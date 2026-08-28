-- Adds HTML document support.
--
-- Required before deploying: src/main.py runs Base.metadata.create_all, which
-- creates missing tables but never alters an existing one. Run this against the
-- production database first, or every request touching documents will fail.
--
-- Safe to run more than once.

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS kind VARCHAR(20) NOT NULL DEFAULT 'markdown';

ALTER TABLE documents
    ADD COLUMN IF NOT EXISTS render_key VARCHAR(32);

CREATE UNIQUE INDEX IF NOT EXISTS ix_documents_render_key
    ON documents (render_key);

-- Existing rows are all markdown and need no key. HTML docs get one on push.
