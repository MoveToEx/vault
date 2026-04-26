-- +goose Up
SELECT 'up SQL query';

CREATE TABLE IF NOT EXISTS public_shares (
    id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,

    key VARCHAR(32) NOT NULL UNIQUE,

    file_id BIGINT NOT NULL REFERENCES files(id),
    owner_id BIGINT NOT NULL REFERENCES users(id),

    encrypted_key BYTEA NOT NULL,
    encrypted_metadata BYTEA NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days'
);

CREATE INDEX IF NOT EXISTS public_shares_key_idx ON public_shares(key);


-- +goose Down
SELECT 'down SQL query';

DROP INDEX public_shares_key_idx;
DROP TABLE public_shares;