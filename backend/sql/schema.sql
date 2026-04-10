DROP SCHEMA IF EXISTS public CASCADE;

CREATE SCHEMA public;

CREATE TYPE log_level AS ENUM('trace', 'info', 'warning', 'critical');

CREATE TABLE IF NOT EXISTS users (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    email VARCHAR(255) NOT NULL,
    username VARCHAR(255) NOT NULL UNIQUE,

    opaque_record BYTEA NOT NULL,
    credential_identifier BYTEA NOT NULL,

    permission BIGINT NOT NULL DEFAULT 0,
    capacity BIGINT NOT NULL DEFAULT 0,

    kdf_salt BYTEA NOT NULL,
    kdf_memory_cost INTEGER NOT NULL,
    kdf_time_cost INTEGER NOT NULL,
    kdf_parallelism INTEGER NOT NULL,

    public_key BYTEA NOT NULL,
    encrypted_private_key BYTEA NOT NULL,

    root_folder BIGINT,

    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_locked BOOLEAN NOT NULL DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

    refresh_token TEXT NOT NULL UNIQUE,
    user_id BIGINT NOT NULL REFERENCES users(id),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    last_used_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS files (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    owner_id BIGINT NOT NULL REFERENCES users(id),
    
    encrypted_metadata BYTEA NOT NULL,

    encrypted_key BYTEA NOT NULL,

    parent_id BIGINT NOT NULL,

    chunks INT NOT NULL,
    chunk_size BIGINT NOT NULL,
    size BIGINT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS file_chunks (
    file_id BIGINT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,

    s3_key TEXT NOT NULL UNIQUE,
    checksum BYTEA NOT NULL,

    PRIMARY KEY (file_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS folders (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

    encrypted_metadata BYTEA NOT NULL,

    parent_id BIGINT REFERENCES folders(id),
    owner_id BIGINT NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS logs (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    owner_id BIGINT REFERENCES users(id),

    level LOG_LEVEL NOT NULL DEFAULT 'info',
    message TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
ADD FOREIGN KEY(root_folder) REFERENCES folders(id)
ON UPDATE NO ACTION ON DELETE CASCADE;

ALTER TABLE files
ADD FOREIGN KEY(parent_id) REFERENCES folders(id)
ON UPDATE NO ACTION ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS uploads (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
    user_id BIGINT NOT NULL REFERENCES users(id),

    encrypted_metadata BYTEA NOT NULL,

    parent_id BIGINT NOT NULL,

    chunks INT NOT NULL,
    chunk_size BIGINT NOT NULL,
    size BIGINT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '3 hours'
);

CREATE TABLE IF NOT EXISTS upload_chunks (
    upload_id BIGINT NOT NULL REFERENCES uploads(id),
    chunk_index INT NOT NULL,

    s3_key TEXT NOT NULL UNIQUE,

    completed BOOLEAN NOT NULL DEFAULT FALSE,
    checksum BYTEA NOT NULL,

    PRIMARY KEY (upload_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS shares (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

    file_id BIGINT NOT NULL REFERENCES files(id),
    sender_id BIGINT NOT NULL REFERENCES users(id),
    receiver_id BIGINT NOT NULL REFERENCES users(id),
    
    encrypted_fek BYTEA NOT NULL,
    encrypted_metadata BYTEA NOT NULL,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days'
);