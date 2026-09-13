"""reset_and_recreate_schema

Revision ID: 9a8b7c6d5e4f
Revises: a1b2c3d4e5f6
Create Date: 2026-06-15

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '9a8b7c6d5e4f'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Drop existing tables to start clean
    op.execute("DROP TABLE IF EXISTS otp_store CASCADE")
    op.execute("DROP TABLE IF EXISTS audit_logs CASCADE")
    op.execute("DROP TABLE IF EXISTS documents CASCADE")
    op.execute("DROP TABLE IF EXISTS users CASCADE")

    # 2. Re-create users table
    op.create_table('users',
        sa.Column('vehicle_reg_no', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('phone_number', sa.String(length=15), nullable=True),
        sa.Column('email', sa.String(), nullable=True),
        sa.Column('is_verified', sa.Boolean(), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('vehicle_reg_no')
    )

    # 3. Re-create documents table
    op.create_table('documents',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('vehicle_reg_no', sa.String(), nullable=False),
        sa.Column('doc_type', sa.String(), nullable=False),
        sa.Column('version_number', sa.Integer(), nullable=False),
        sa.Column('is_latest', sa.Boolean(), nullable=False),
        sa.Column('file_hash', sa.String(length=64), nullable=False),
        sa.Column('s3_key', sa.String(), nullable=False),
        sa.Column('original_filename', sa.String(), nullable=False),
        sa.Column('mime_type', sa.String(), nullable=False),
        sa.Column('policy_start_date', sa.Date(), nullable=True),
        sa.Column('policy_end_date', sa.Date(), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('notes', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column('retain_until', sa.Date(), nullable=False),
        sa.Column('is_deleted', sa.Boolean(), nullable=False),
        sa.Column('deleted_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['vehicle_reg_no'], ['users.vehicle_reg_no'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('vehicle_reg_no', 'doc_type', 'version_number', name='uq_documents_reg_type_version')
    )

    # Add indexes for documents table
    op.create_index('ix_documents_vehicle_reg_no', 'documents', ['vehicle_reg_no'], unique=False)
    op.create_index('ix_documents_file_hash', 'documents', ['file_hash'], unique=False)
    op.create_index('ix_documents_policy_start_date', 'documents', ['policy_start_date'], unique=False)
    op.create_index('ix_documents_policy_end_date', 'documents', ['policy_end_date'], unique=False)
    op.create_index('ix_documents_uploaded_at', 'documents', ['uploaded_at'], unique=False)
    op.create_index('ix_documents_retain_until', 'documents', ['retain_until'], unique=False)
    op.create_index('ix_documents_is_deleted', 'documents', ['is_deleted'], unique=False)
    op.create_index('ix_documents_latest_deleted_expiry', 'documents', ['is_latest', 'is_deleted', 'policy_end_date'], unique=False)

    # 4. Re-create audit_logs table
    op.create_table('audit_logs',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('action', sa.String(length=30), nullable=False),
        sa.Column('performed_by', sa.String(length=50), nullable=False),
        sa.Column('target_reg', sa.String(), nullable=False),
        sa.Column('document_id', sa.UUID(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(['document_id'], ['documents.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )

    # Add indexes for audit_logs table
    op.create_index('ix_audit_logs_target_reg_timestamp', 'audit_logs', ['target_reg', 'timestamp'], unique=False)

    # 5. Re-create otp_store table
    op.create_table('otp_store',
        sa.Column('vehicle_reg_no', sa.String(), nullable=False),
        sa.Column('otp_code', sa.String(length=10), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint('vehicle_reg_no')
    )


def downgrade() -> None:
    op.drop_table('otp_store')
    op.drop_index('ix_audit_logs_target_reg_timestamp', table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_index('ix_documents_latest_deleted_expiry', table_name='documents')
    op.drop_index('ix_documents_is_deleted', table_name='documents')
    op.drop_index('ix_documents_retain_until', table_name='documents')
    op.drop_index('ix_documents_uploaded_at', table_name='documents')
    op.drop_index('ix_documents_policy_end_date', table_name='documents')
    op.drop_index('ix_documents_policy_start_date', table_name='documents')
    op.drop_index('ix_documents_file_hash', table_name='documents')
    op.drop_index('ix_documents_vehicle_reg_no', table_name='documents')
    op.drop_table('documents')
    op.drop_table('users')
