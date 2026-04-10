
-- name: NewUser :one
INSERT INTO users (
    email, username, opaque_record, credential_identifier, permission, capacity,
    kdf_salt, kdf_memory_cost, kdf_time_cost, kdf_parallelism,
    public_key, encrypted_private_key, root_folder
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *;

-- name: GetOpaqueClientRecord :one
SELECT id, username, opaque_record, credential_identifier FROM users
WHERE username = $1;

-- name: GetKDFParameters :one
SELECT id, kdf_memory_cost, kdf_parallelism, kdf_salt, kdf_time_cost
FROM users
WHERE id = $1;

-- name: NewSession :one
INSERT INTO sessions (refresh_token, user_id, expires_at)
VALUES ($1, $2, $3)
RETURNING *;

-- name: GetSession :one
SELECT * FROM sessions
WHERE refresh_token = $1;

-- name: RotateSession :exec
UPDATE sessions
SET refresh_token = @new_token, last_used_at = NOW()
WHERE refresh_token = $1;

-- name: GetUser :one
SELECT * FROM users
WHERE id = $1;

-- name: NewFile :one
INSERT INTO files (
    owner_id, encrypted_metadata, encrypted_key,
    chunks, size
)
VALUES (
    $1, $2, $3, $4, $5
)
RETURNING *;

-- name: SetFileMetadata :exec
UPDATE files
SET encrypted_metadata = $1
WHERE id = $2;

-- name: SetFolderMetadata :exec
UPDATE folders
SET encrypted_metadata = $1
WHERE id = $2;


-- name: SetFileParent :exec
UPDATE files
SET parent_id = $2
WHERE id = $1;

-- name: GetUsedCapacity :one
SELECT COALESCE(SUM(size), 0)::BIGINT FROM files
WHERE owner_id = $1 AND deleted_at ISNULL;

-- name: NewUpload :one
INSERT INTO uploads (
    user_id, chunks, chunk_size, size, expires_at, parent_id, encrypted_metadata
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
)
RETURNING *;

-- name: NewUploadChunk :exec
INSERT INTO upload_chunks (upload_id, chunk_index, s3_key, completed)
VALUES ($1, $2, $3, false);

-- name: CompleteUploadChunk :exec
UPDATE upload_chunks
SET completed = TRUE, checksum = $3
WHERE upload_id = $1 AND chunk_index = $2;

-- name: CountActiveUploadSession :one
SELECT COUNT(*) FROM uploads
WHERE user_id = $1 AND completed_at IS NULL AND expires_at > NOW();

-- name: GetActiveUploadSession :many
SELECT u.*, ARRAY_AGG(uc.chunk_index)::INT[] AS completed FROM uploads u
INNER JOIN upload_chunks uc ON u.id = uc.upload_id
WHERE user_id = $1 AND u.completed_at IS NULL AND u.expires_at > NOW()
GROUP BY u.id;

-- name: GetUploadSession :one
SELECT * FROM uploads
WHERE id = $1 AND completed_at IS NULL AND expires_at > NOW();

-- name: CompleteUploadSession :exec
UPDATE uploads
SET completed_at = NOW()
WHERE id = $1 AND expires_at > NOW();

-- name: MigrateUpload :one
INSERT INTO
    files (owner_id, encrypted_metadata, parent_id, encrypted_key, chunks, size, chunk_size)
SELECT
    user_id, encrypted_metadata, parent_id, $2 AS encrypted_key, chunks, size, chunk_size
FROM uploads u
WHERE u.id = $1
RETURNING id;

-- name: MigrateChunks :exec
INSERT INTO
    file_chunks (file_id, chunk_index, s3_key, checksum)
SELECT 
    $1 AS file_id, chunk_index, s3_key, checksum
FROM upload_chunks
WHERE upload_id = $2 AND completed = TRUE;

-- name: GetUploadChunk :one
SELECT * FROM upload_chunks
WHERE upload_id = $1 AND chunk_index = $2;

-- name: NewFolder :one
INSERT INTO folders(encrypted_metadata, parent_id, owner_id)
VALUES ($1, $2, $3)
RETURNING *;

-- name: SetRootFolder :exec
UPDATE users
SET root_folder = $1
WHERE id = $2;

-- name: GetFiles :many
SELECT * FROM files f
WHERE parent_id = $1 AND deleted_at ISNULL;

-- name: GetFolder :one
SELECT * FROM folders
WHERE id = $1 AND deleted_at ISNULL;

-- name: GetSubfolders :many
SELECT * FROM folders
WHERE parent_id = $1 AND deleted_at ISNULL;

-- name: GetFile :one
SELECT * FROM files
WHERE id = $1;

-- name: GetChunk :one
SELECT c.* FROM file_chunks c
JOIN files f ON c.file_id = f.id
WHERE f.owner_id = $1 AND f.id = @file_id AND c.chunk_index = $2;

-- name: GetChunks :one
SELECT c.* FROM file_chunks c
JOIN files f ON c.file_id = f.id
WHERE f.owner_id = $1 AND f.id = @file_id;

-- name: DeleteFile :exec
UPDATE files
SET deleted_at = NOW()
WHERE id = $1;


--#region Sharing

-- name: GetUserByName :one
SELECT * FROM users
WHERE username = $1;

-- name: FindUserByUsername :many
SELECT id, username, public_key FROM users
WHERE username ILIKE CONCAT('%', @key::TEXT, '%');

-- name: FindUserByEmail :many
SELECT id, username, public_key FROM users
WHERE email ILIKE CONCAT('%', @key::TEXT, '%');

-- name: NewShare :one
INSERT INTO shares(file_id, sender_id, receiver_id, encrypted_fek, encrypted_metadata)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: GetShares :many
SELECT s.*, u.username AS sender FROM shares s
INNER JOIN users u ON s.sender_id = u.id
WHERE s.receiver_id = $1 AND s.expires_at > NOW()
ORDER BY s.created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetSharesBySender :many
SELECT
    s.id, s.sender_id, s.receiver_id, u.username AS receiver,
    f.encrypted_metadata, s.created_at, s.expires_at
FROM shares s
INNER JOIN files f ON s.file_id = f.id
INNER JOIN users u ON s.receiver_id = u.id
WHERE s.sender_id = $1 AND s.expires_at > NOW()
ORDER BY s.created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetShare :one
SELECT s.*, f.chunks, f.size, f.chunk_size FROM shares s
INNER JOIN files f ON s.file_id = f.id
WHERE s.id = $1 AND s.expires_at > NOW();

-- name: GetShareChunk :one
SELECT s.*, c.* FROM shares s
INNER JOIN files f ON s.file_id = f.id
INNER JOIN file_chunks c ON c.file_id = f.id
WHERE s.id = $1 AND c.chunk_index = $2 AND s.expires_at > NOW();

-- name: InvalidateShare :exec
UPDATE shares
SET expires_at = NOW()
WHERE id = $1;

--#endregion