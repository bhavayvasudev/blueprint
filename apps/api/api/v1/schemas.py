"""Request/response models for the auth and repos routers (RULES.md §2:
Pydantic models at every API boundary)."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from models.types import AccountType, ConnectionStatus, SnapshotStatus


class UserOut(BaseModel):
    id: uuid.UUID
    github_id: str
    email: str
    name: str

    model_config = {"from_attributes": True}


class InstallationOut(BaseModel):
    id: uuid.UUID
    account_login: str
    account_type: AccountType

    model_config = {"from_attributes": True}


class AvailableRepositoryOut(BaseModel):
    external_id: str
    full_name: str
    default_branch: str
    private: bool
    html_url: str


class ConnectRepositoryRequest(BaseModel):
    installation_id: uuid.UUID
    full_name: str


class RepositoryOut(BaseModel):
    id: uuid.UUID
    installation_id: uuid.UUID
    full_name: str
    default_branch: str
    private: bool
    connection_status: ConnectionStatus
    last_synced_sha: str | None
    last_synced_at: datetime | None

    model_config = {"from_attributes": True}


class SnapshotOut(BaseModel):
    id: uuid.UUID
    commit_sha: str | None
    status: SnapshotStatus
    created_at: datetime

    model_config = {"from_attributes": True}


class GraphNodeOut(BaseModel):
    id: uuid.UUID
    node_type: str
    label: str
    metadata: dict[str, object]


class GraphEdgeOut(BaseModel):
    id: uuid.UUID
    source_node_id: uuid.UUID
    target_node_id: uuid.UUID
    edge_type: str

    model_config = {"from_attributes": True}


class LanguageStatOut(BaseModel):
    language: str
    file_count: int
    loc: int

    model_config = {"from_attributes": True}


class TreeSitterStatusOut(BaseModel):
    full_confidence_files: int
    low_confidence_files: int

    model_config = {"from_attributes": True}


class KnowledgeGraphStatusOut(BaseModel):
    node_count: int
    edge_count: int

    model_config = {"from_attributes": True}


class ArchitectureGraphOut(BaseModel):
    snapshot: SnapshotOut
    file_count: int
    language_mix: list[LanguageStatOut]
    tree_sitter_status: TreeSitterStatusOut
    knowledge_graph_status: KnowledgeGraphStatusOut
    repository_graph_nodes: list[GraphNodeOut]
    repository_graph_edges: list[GraphEdgeOut]
