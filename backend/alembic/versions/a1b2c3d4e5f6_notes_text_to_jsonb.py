"""notes_text_to_jsonb

Revision ID: a1b2c3d4e5f6
Revises: fceaccf2bcff
Create Date: 2026-06-15

Migrates the `notes` column in `documents` from plain Text to native PostgreSQL JSONB.
Legacy plain-text notes are backfilled into the new structure as {"version_note": "<old text>"}.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '5c90b75f2972'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Convert notes column from Text to JSONB.
    Step 1: Add a temporary JSONB column.
    Step 2: Backfill — rows with valid JSON are cast directly;
            rows with plain-text content are wrapped as {"version_note": "<text>"}.
    Step 3: Drop old text column, rename temp column.
    """
    # 1. Add temporary JSONB column
    op.add_column('documents', sa.Column('notes_jsonb', postgresql.JSONB(), nullable=True))

    # 2. Backfill: rows that already contain valid JSON (start with '{') — cast directly.
    #    Rows with plain text (or NULL) — wrap as {"version_note": "<text>"}.
    op.execute("""
        UPDATE documents
        SET notes_jsonb = CASE
            WHEN notes IS NULL THEN NULL
            WHEN notes ~ '^\\s*\\{' THEN notes::jsonb
            ELSE jsonb_build_object('version_note', notes)
        END
    """)

    # 3. Drop the old text column
    op.drop_column('documents', 'notes')

    # 4. Rename the temp column to 'notes'
    op.alter_column('documents', 'notes_jsonb', new_column_name='notes')


def downgrade() -> None:
    """
    Revert JSONB notes back to Text.
    Extracts 'version_note' as the text representation (lossy — policy_number is dropped).
    """
    op.add_column('documents', sa.Column('notes_text', sa.Text(), nullable=True))

    op.execute("""
        UPDATE documents
        SET notes_text = CASE
            WHEN notes IS NULL THEN NULL
            ELSE COALESCE(notes->>'version_note', notes::text)
        END
    """)

    op.drop_column('documents', 'notes')
    op.alter_column('documents', 'notes_text', new_column_name='notes')
