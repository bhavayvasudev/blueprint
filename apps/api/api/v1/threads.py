"""Threads routes (PRODUCT.md §4). Thin per RULES.md §6 — the conversation
logic (grounding, streaming, persistence) lives in
`services.thread_service`; these handlers authorize the repository, adapt
request/response shapes, and — for the one streaming endpoint — turn the
service's transport-agnostic `StreamEvent`s into `text/event-stream` frames.

The `POST .../ask` endpoint runs an LLM in the request path. That is the
deliberate, documented exception (ARCHITECTURE.md §13, the Stage-11 shape):
a light, grounded retrieval + one model call, never the full reasoning
pipeline, which stays in the worker.
"""

import json
import uuid
from collections.abc import Iterator

from fastapi import APIRouter, Depends, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from api.dependencies import get_current_user
from api.v1.schemas import (
    AskRequest,
    CreateThreadRequest,
    ThreadDetailOut,
    ThreadOut,
    UpdateThreadRequest,
)
from integrations.embeddings.registry import get_embedding_provider
from integrations.llm.registry import get_chat_provider
from models.db import get_session
from models.repository import User
from pipeline.retrieval.grounding import StreamEvent
from services.repository_connection_service import get_connected_repository
from services.thread_service import (
    create_thread,
    delete_thread,
    get_thread,
    list_threads,
    starter_suggestions,
    stream_answer,
    update_thread,
)

router = APIRouter(prefix="/repos/{repository_id}/threads", tags=["threads"])


@router.get("", response_model=list[ThreadOut])
def list_repo_threads(
    repository_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> list[ThreadOut]:
    repository = get_connected_repository(db, user=user, repository_id=repository_id)
    return [ThreadOut.model_validate(t) for t in list_threads(db, user=user, repository=repository)]


@router.post("", response_model=ThreadDetailOut, status_code=201)
def create_repo_thread(
    repository_id: uuid.UUID,
    body: CreateThreadRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> ThreadDetailOut:
    repository = get_connected_repository(db, user=user, repository_id=repository_id)
    thread = create_thread(
        db, user=user, repository=repository, first_question=body.first_question
    )
    return ThreadDetailOut.model_validate(thread)


@router.get("/suggestions", response_model=list[str])
def thread_suggestions(
    repository_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> list[str]:
    """Declared before `/{thread_id}` so "suggestions" is never mistaken for
    a thread id."""
    repository = get_connected_repository(db, user=user, repository_id=repository_id)
    return starter_suggestions(db, repository=repository)


@router.get("/{thread_id}", response_model=ThreadDetailOut)
def get_repo_thread(
    repository_id: uuid.UUID,
    thread_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> ThreadDetailOut:
    repository = get_connected_repository(db, user=user, repository_id=repository_id)
    thread = get_thread(db, user=user, repository=repository, thread_id=thread_id)
    return ThreadDetailOut.model_validate(thread)


@router.patch("/{thread_id}", response_model=ThreadOut)
def update_repo_thread(
    repository_id: uuid.UUID,
    thread_id: uuid.UUID,
    body: UpdateThreadRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> ThreadOut:
    repository = get_connected_repository(db, user=user, repository_id=repository_id)
    thread = get_thread(db, user=user, repository=repository, thread_id=thread_id)
    updated = update_thread(
        db, thread=thread, pinned=body.pinned, title=body.title, status=body.status
    )
    return ThreadOut.model_validate(updated)


@router.delete("/{thread_id}", status_code=204)
def delete_repo_thread(
    repository_id: uuid.UUID,
    thread_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> Response:
    repository = get_connected_repository(db, user=user, repository_id=repository_id)
    thread = get_thread(db, user=user, repository=repository, thread_id=thread_id)
    delete_thread(db, thread=thread)
    return Response(status_code=204)


def _sse(events: Iterator[StreamEvent]) -> Iterator[str]:
    """Serialize the service's `StreamEvent`s to Server-Sent-Event frames.
    The only place that knows the wire format (RULES.md §6)."""
    for event in events:
        yield f"event: {event.event}\ndata: {json.dumps(event.data)}\n\n"


@router.post("/{thread_id}/ask")
def ask_repo_thread(
    repository_id: uuid.UUID,
    thread_id: uuid.UUID,
    body: AskRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> StreamingResponse:
    """Ask a question and stream the grounded answer back as SSE. The `db`
    session lives for the whole stream (FastAPI closes it on generator
    exhaustion), which is what lets the service persist the answer and its
    evidence as it goes."""
    repository = get_connected_repository(db, user=user, repository_id=repository_id)
    thread = get_thread(db, user=user, repository=repository, thread_id=thread_id)
    events = stream_answer(
        db,
        thread=thread,
        question=body.question,
        embedding_provider=get_embedding_provider(),
        chat_provider=get_chat_provider(),
    )
    return StreamingResponse(
        _sse(events),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Disable proxy buffering so tokens reach the browser as they're
            # produced, not batched at the end (nginx/Railway edge).
            "X-Accel-Buffering": "no",
        },
    )
