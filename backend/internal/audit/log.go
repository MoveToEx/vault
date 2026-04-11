package audit

import (
	"context"
	"encoding/json"
	"log/slog"

	"backend/internal/db"
	"backend/internal/sqlc"
)

// Append loads the user's public key and stores a sealed log entry. Failures are logged and do not panic.
// encryptedMetadata is optional: client-encrypted file/folder metadata (same format as files.encrypted_metadata), or nil.
func Append(ctx context.Context, userID int64, level sqlc.LogLevel, payload any, encryptedMetadata []byte) {
	u, err := db.Query().GetUser(ctx, userID)
	if err != nil {
		slog.Default().ErrorContext(ctx, "audit: get user", "user_id", userID, "err", err)
		return
	}
	AppendWithPublicKey(ctx, userID, u.PublicKey, level, payload, encryptedMetadata)
}

// AppendWithPublicKey avoids an extra user lookup when the caller already has the public key (e.g. registration).
func AppendWithPublicKey(ctx context.Context, userID int64, recipientPublicKey []byte, level sqlc.LogLevel, payload any, encryptedMetadata []byte) {
	plain, err := json.Marshal(payload)
	if err != nil {
		slog.Default().ErrorContext(ctx, "audit: marshal payload", "err", err)
		return
	}
	sealed, err := SealMessage(recipientPublicKey, plain)
	if err != nil {
		slog.Default().ErrorContext(ctx, "audit: seal", "err", err)
		return
	}
	if err := db.Query().InsertLog(ctx, sqlc.InsertLogParams{
		OwnerID:             userID,
		Level:               level,
		Message:             sealed,
		EncryptedMetadata:   encryptedMetadata,
	}); err != nil {
		slog.Default().ErrorContext(ctx, "audit: insert log", "user_id", userID, "err", err)
	}
}
