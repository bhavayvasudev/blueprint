"""DECISIONS.md ADR-024: `installations` — not in ARCHITECTURE.md's original
§11 schema, added here because minting a GitHub App installation token
requires an installation ID, and nothing in the original schema recorded
which installation a user's connected repositories belong to. One user can
have many installations (multiple GitHub accounts/orgs); one installation
can back many `repositories` rows.
"""

import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.db import Base
from models.types import AccountType, InstallationStatus

if TYPE_CHECKING:
    from models.repository import Repository, User


class Installation(Base):
    __tablename__ = "installations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    # Provider-agnostic on purpose (DECISIONS.md ADR-023): "github" is the
    # only value that exists today, but the column doesn't assume GitHub.
    provider: Mapped[str] = mapped_column(String, default="github")
    # The provider's own installation identifier (GitHub: numeric, carried
    # as a string for provider-agnosticism, matching `repositories.github_repo_id`).
    external_id: Mapped[str] = mapped_column(String, unique=True, index=True)
    account_login: Mapped[str] = mapped_column(String)
    account_type: Mapped[AccountType] = mapped_column(String)
    status: Mapped[InstallationStatus] = mapped_column(String, default=InstallationStatus.ACTIVE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="installations")
    repositories: Mapped[list["Repository"]] = relationship(back_populates="installation")
