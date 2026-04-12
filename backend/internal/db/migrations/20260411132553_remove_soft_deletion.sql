-- +goose Up
SELECT 'up SQL query';

ALTER TABLE shares DROP CONSTRAINT shares_file_id_fkey;
ALTER TABLE shares ADD CONSTRAINT shares_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;

ALTER TABLE files DROP COLUMN IF EXISTS deleted_at;

-- +goose Down
SELECT 'down SQL query';

ALTER TABLE files ADD COLUMN deleted_at TIMESTAMPTZ;

ALTER TABLE shares DROP CONSTRAINT shares_file_id_fkey;
ALTER TABLE shares ADD CONSTRAINT shares_file_id_fkey FOREIGN KEY (file_id) REFERENCES files(id);