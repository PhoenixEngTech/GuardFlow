"""link cameras to edge gateways

Revision ID: 7a9c2e4f1b68
Revises: 41dfeb410b93
Create Date: 2026-07-18
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "7a9c2e4f1b68"
down_revision: Union[str, None] = "41dfeb410b93"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "camera_sources",
        sa.Column(
            "edge_gateway_id",
            sa.String(),
            nullable=True,
        ),
    )

    op.create_foreign_key(
        "fk_camera_sources_edge_gateway_id_edge_gateways",
        "camera_sources",
        "edge_gateways",
        ["edge_gateway_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_index(
        "ix_camera_sources_edge_gateway_id",
        "camera_sources",
        ["edge_gateway_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_camera_sources_edge_gateway_id",
        table_name="camera_sources",
    )

    op.drop_constraint(
        "fk_camera_sources_edge_gateway_id_edge_gateways",
        "camera_sources",
        type_="foreignkey",
    )

    op.drop_column(
        "camera_sources",
        "edge_gateway_id",
    )
