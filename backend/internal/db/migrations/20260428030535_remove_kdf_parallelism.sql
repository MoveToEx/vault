-- +goose Up
SELECT 'up SQL query';

ALTER TABLE users
DROP COLUMN kdf_parallelism;

-- +goose Down
SELECT 'down SQL query';

ALTER TABLE users
ADD kdf_parallelism INTEGER NOT NULL DEFAULT 1;

ALTER TABLE users
ALTER TABLE kdf_parallelism
DROP DEFAULT;
