
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

-- name: GetUsedCapacity :one
SELECT COALESCE(SUM(size), 0)::BIGINT FROM files
WHERE owner_id = $1;

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
SET completed = TRUE
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
    file_chunks (file_id, chunk_index, s3_key)
SELECT 
    $1 AS file_id, chunk_index, s3_key
FROM upload_chunks
WHERE upload_id = $2 AND completed = TRUE;

-- name: GetUploadChunk :one
SELECT * FROM upload_chunks
WHERE upload_id = $1 AND chunk_index = $2;

-- name: GetUploadChunks :many
SELECT * FROM upload_chunks
WHERE upload_id = $1;

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
WHERE parent_id = $1;

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

-- name: GetFileS3Keys :many
SELECT s3_key FROM file_chunks
WHERE file_id = $1;

-- name: DeleteFile :exec
DELETE FROM files
WHERE id = $1 AND owner_id = $2;

-- name: ListUploadChunks :many
SELECT s3_key FROM upload_chunks WHERE upload_id = $1;

-- name: GetExpiredUploads :many
SELECT * FROM uploads
WHERE completed_at ISNULL AND expires_at <= NOW()
ORDER BY expires_at ASC
LIMIT 500;

-- name: DeleteUploadChunks :exec
DELETE FROM upload_chunks WHERE upload_id = $1;

-- name: DeleteIncompleteUpload :exec
DELETE FROM uploads
WHERE id = $1 AND completed_at IS NULL;


-- name: InsertLog :exec
INSERT INTO logs (owner_id, level, message, encrypted_metadata)
VALUES ($1, $2, $3, $4);

-- name: ListLogsForOwner :many
SELECT id, level, message, encrypted_metadata, created_at
FROM logs
WHERE owner_id = sqlc.arg(owner_id)
  AND (sqlc.arg(level_filter)::text = '' OR level::text = sqlc.arg(level_filter))
  AND (sqlc.arg(created_after)::timestamptz IS NULL OR created_at >= sqlc.arg(created_after))
  AND (sqlc.arg(created_before)::timestamptz IS NULL OR created_at <= sqlc.arg(created_before))
ORDER BY id DESC
LIMIT sqlc.arg(limit_rows) OFFSET sqlc.arg(offset_rows);

-- name: CountLogsForOwner :one
SELECT COUNT(*)::bigint
FROM logs
WHERE owner_id = sqlc.arg(owner_id)
  AND (sqlc.arg(level_filter)::text = '' OR level::text = sqlc.arg(level_filter))
  AND (sqlc.arg(created_after)::timestamptz IS NULL OR created_at >= sqlc.arg(created_after))
  AND (sqlc.arg(created_before)::timestamptz IS NULL OR created_at <= sqlc.arg(created_before));

-- name: TraverseChunks :many
WITH RECURSIVE t(id, parent_id) AS (
        SELECT f.id, f.parent_id
        FROM folders f 
        WHERE f.id = $1
    UNION
        SELECT f.id, f.parent_id
        FROM folders f
        JOIN t cur ON f.parent_id = cur.id
)
SELECT ch.s3_key
FROM files f
INNER JOIN file_chunks ch ON f.id = ch.file_id
WHERE f.id IN (
    SELECT id FROM t
);


-- name: GetFolderDepth :one
WITH RECURSIVE t(id, parent_id) AS (
        SELECT id, parent_id
        FROM folders f
        WHERE f.id = $1
    UNION
        SELECT parent.id, parent.parent_id
        FROM folders parent, t cur
        WHERE parent.id = cur.parent_id
)
SELECT COUNT(*) FROM t;

-- name: DeleteFiles :exec
WITH RECURSIVE t(id, parent_id) AS (
        SELECT f.id, f.parent_id
        FROM folders f 
        WHERE f.id = $1
    UNION
        SELECT f.id, f.parent_id
        FROM folders f
        JOIN t cur ON f.parent_id = cur.id
)
DELETE FROM files f
WHERE f.parent_id IN (
    SELECT id FROM t
);

-- name: DeleteFolders :exec
WITH RECURSIVE t(id, parent_id) AS (
        SELECT f.id, f.parent_id
        FROM folders f 
        WHERE f.id = $1
    UNION
        SELECT f.id, f.parent_id
        FROM folders f
        JOIN t cur ON f.parent_id = cur.id
)
DELETE FROM folders f
WHERE f.id IN (
    SELECT id FROM t
);

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

--#region Site config & admin

-- name: GetSiteConfig :one
SELECT id, upload_expiry_seconds, registration_open, default_user_capacity_bytes, updated_at FROM site_config
WHERE id = 1;

-- name: UpdateSiteConfig :exec
UPDATE site_config SET
    upload_expiry_seconds = $1,
    registration_open = $2,
    default_user_capacity_bytes = $3,
    updated_at = NOW()
WHERE id = 1;

-- name: GetUserAuthByID :one
SELECT is_active, permission FROM users
WHERE id = $1;

-- name: DeleteSessionsByUser :exec
DELETE FROM sessions
WHERE user_id = $1;

-- name: ListSessionsByUser :many
SELECT id, created_at, expires_at, last_used_at FROM sessions
WHERE user_id = $1
ORDER BY created_at DESC;

-- name: DeleteSessionByIDForUser :exec
DELETE FROM sessions
WHERE id = $1 AND user_id = $2;

-- name: UpdateUserCredentials :exec
UPDATE users SET
    opaque_record = $2,
    credential_identifier = $3,
    kdf_salt = $4,
    kdf_memory_cost = $5,
    kdf_time_cost = $6,
    kdf_parallelism = $7,
    encrypted_private_key = $8,
    updated_at = NOW()
WHERE id = $1;

-- name: DeleteSharesForUser :exec
DELETE FROM shares
WHERE sender_id = $1 OR receiver_id = $1;

-- name: ListIncompleteUploadIDsByUser :many
SELECT id FROM uploads WHERE user_id = $1 AND completed_at IS NULL;

-- name: DeleteUploadChunksByUser :exec
DELETE FROM upload_chunks
WHERE upload_id IN (SELECT id FROM uploads WHERE user_id = $1);

-- name: DeleteUploadsByUser :exec
DELETE FROM uploads WHERE user_id = $1;

-- name: DeleteUserByID :exec
DELETE FROM users WHERE id = $1;

-- name: CountUsers :one
SELECT COUNT(*)::BIGINT FROM users;

-- name: CountFiles :one
SELECT COUNT(*)::BIGINT FROM files;

-- name: GetTotalSize :one
SELECT COALESCE(SUM(size), 0)::BIGINT AS total FROM files;

-- name: CountActiveUploads :one
SELECT COUNT(*)::BIGINT FROM uploads
WHERE completed_at IS NULL AND expires_at > NOW();

-- name: CountUsersAdmin :one
SELECT COUNT(*)::BIGINT FROM users;

-- name: ListUsersAdmin :many
SELECT id, email, username, permission, capacity, is_active, is_locked,
    created_at, last_login_at
FROM users
ORDER BY id ASC
LIMIT $1 OFFSET $2;

-- name: UpdateUserCapacity :exec
UPDATE users
SET capacity = $2, updated_at = NOW()
WHERE id = $1;

-- name: SetUserActive :exec
UPDATE users
SET is_active = $2, updated_at = NOW()
WHERE id = $1;

-- name: GetUserLiteByUsername :one
SELECT id, is_active FROM users
WHERE username = $1;

-- name: CountOtherActiveAdmins :one
SELECT COUNT(*)::BIGINT FROM users
WHERE permission = 2 AND is_active = TRUE AND id <> $1;

--#endregion