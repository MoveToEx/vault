-- +goose Up
CREATE TABLE IF NOT EXISTS site_config (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    upload_expiry_seconds INTEGER NOT NULL DEFAULT 10800,
    registration_open BOOLEAN NOT NULL DEFAULT TRUE,
    default_user_capacity_bytes BIGINT NOT NULL DEFAULT 2147483648,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO site_config (id, upload_expiry_seconds, registration_open, default_user_capacity_bytes)
VALUES (1, 10800, TRUE, 2147483648)
ON CONFLICT (id) DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS site_config;
