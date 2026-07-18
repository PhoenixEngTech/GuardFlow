"""Add edge gateways table

Revision ID: 41dfeb410b93
Revises: 463b1875cc82
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "41dfeb410b93"
down_revision: Union[str, None] = "463b1875cc82"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "edge_gateways",
        sa.Column(
            "id",
            sa.String(),
            nullable=False,
        ),
        sa.Column(
            "gateway_id",
            sa.String(length=100),
            nullable=False,
        ),
        sa.Column(
            "name",
            sa.String(length=100),
            nullable=False,
        ),
        sa.Column(
            "site_name",
            sa.String(length=150),
            nullable=True,
        ),
        sa.Column(
            "customer_name",
            sa.String(length=150),
            nullable=True,
        ),
        sa.Column(
            "token_hash",
            sa.String(length=64),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
        ),
        sa.Column(
            "is_active",
            sa.Boolean(),
            nullable=False,
        ),
        sa.Column(
            "registered_camera_count",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "online_camera_count",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "offline_camera_count",
            sa.Integer(),
            nullable=False,
        ),
        sa.Column(
            "last_seen_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column(
            "created_by_operator_id",
            sa.String(),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by_operator_id"],
            ["operators.id"],
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
        if_not_exists=True,
    )

    op.create_index(
        "ix_edge_gateways_id",
        "edge_gateways",
        ["id"],
        unique=False,
        if_not_exists=True,
    )

    op.create_index(
        "ix_edge_gateways_gateway_id",
        "edge_gateways",
        ["gateway_id"],
        unique=True,
        if_not_exists=True,
    )

    op.create_index(
        "ix_edge_gateways_created_by_operator_id",
        "edge_gateways",
        ["created_by_operator_id"],
        unique=False,
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_edge_gateways_created_by_operator_id",
        table_name="edge_gateways",
        if_exists=True,
    )

    op.drop_index(
        "ix_edge_gateways_gateway_id",
        table_name="edge_gateways",
        if_exists=True,
    )

    op.drop_index(
        "ix_edge_gateways_id",
        table_name="edge_gateways",
        if_exists=True,
    )

    op.drop_table(
        "edge_gateways",
        if_exists=True,
    )