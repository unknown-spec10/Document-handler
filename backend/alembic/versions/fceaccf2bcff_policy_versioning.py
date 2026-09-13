"""policy_versioning

Revision ID: fceaccf2bcff
Revises: 56e17edfe0eb
Create Date: 2026-06-15 19:39:19.794695

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'fceaccf2bcff'
down_revision: Union[str, Sequence[str], None] = '56e17edfe0eb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # 1. Add columns as nullable first to prevent failures with existing records
    op.add_column('documents', sa.Column('version_number', sa.Integer(), nullable=True))
    op.add_column('documents', sa.Column('is_latest', sa.Boolean(), nullable=True))
    op.add_column('documents', sa.Column('file_hash', sa.String(length=64), nullable=True))
    op.add_column('documents', sa.Column('policy_start_date', sa.Date(), nullable=True))
    op.add_column('documents', sa.Column('policy_end_date', sa.Date(), nullable=True))
    op.add_column('documents', sa.Column('notes', sa.Text(), nullable=True))

    # 2. Populate default values for existing records
    op.execute(
        "UPDATE documents SET "
        "version_number = 1, "
        "is_latest = TRUE, "
        "policy_start_date = CAST(uploaded_at AS DATE), "
        "policy_end_date = CAST(uploaded_at AS DATE) + INTERVAL '365 days', "
        "file_hash = md5('legacy_' || CAST(id AS VARCHAR) || original_filename)"
    )

    # 3. Alter columns to be NOT NULL now that they are populated
    op.alter_column('documents', 'version_number', nullable=False)
    op.alter_column('documents', 'is_latest', nullable=False)
    op.alter_column('documents', 'file_hash', nullable=False)
    op.alter_column('documents', 'policy_end_date', nullable=False)

    # 4. Drop/create constraints and indices
    op.create_index(op.f('ix_documents_file_hash'), 'documents', ['file_hash'], unique=False)
    op.create_index(op.f('ix_documents_policy_end_date'), 'documents', ['policy_end_date'], unique=False)
    op.create_index(op.f('ix_documents_policy_start_date'), 'documents', ['policy_start_date'], unique=False)
    op.create_unique_constraint('uq_documents_phone_type_version', 'documents', ['phone_number', 'doc_type', 'version_number'])
    # op.drop_column('documents', 'is_overridden')
    # op.drop_column('documents', 'overridden_at')
    op.drop_column('users', 'is_overridden')
    op.drop_column('users', 'overridden_at')



def downgrade() -> None:
    """Downgrade schema."""
    op.add_column('users', sa.Column('overridden_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=True))
    op.add_column('users', sa.Column('is_overridden', sa.BOOLEAN(), autoincrement=False, nullable=False, server_default=sa.text('false')))
    op.add_column('documents', sa.Column('overridden_at', postgresql.TIMESTAMP(), autoincrement=False, nullable=True))
    op.add_column('documents', sa.Column('is_overridden', sa.BOOLEAN(), autoincrement=False, nullable=False, server_default=sa.text('false')))
    op.drop_constraint('uq_documents_phone_type_version', 'documents', type_='unique')
    op.drop_index(op.f('ix_documents_policy_start_date'), table_name='documents')
    op.drop_index(op.f('ix_documents_policy_end_date'), table_name='documents')
    op.drop_index(op.f('ix_documents_file_hash'), table_name='documents')
    op.drop_column('documents', 'notes')
    op.drop_column('documents', 'policy_end_date')
    op.drop_column('documents', 'policy_start_date')
    op.drop_column('documents', 'file_hash')
    op.drop_column('documents', 'is_latest')
    op.drop_column('documents', 'version_number')
