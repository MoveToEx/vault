package utils

import (
	"context"
	"encoding/json"
	"log/slog"

	"backend/internal/crypto"
	"backend/internal/db"
	"backend/internal/sqlc"
)

func AppendLog(ctx context.Context, userID int64, level sqlc.LogLevel, payload any, encryptedMetadata []byte) {
	u, err := db.Query().GetUser(ctx, userID)
	if err != nil {
		slog.Default().ErrorContext(ctx, "audit: get user", "user_id", userID, "err", err)
		return
	}
	AppendLogWithPublicKey(ctx, userID, u.PublicKey, level, payload, encryptedMetadata)
}

func AppendLogWithPublicKey(ctx context.Context, userID int64, recipientPublicKey []byte, level sqlc.LogLevel, payload any, encryptedMetadata []byte) {
	plain, err := json.Marshal(payload)
	if err != nil {
		slog.Default().ErrorContext(ctx, "audit: marshal payload", "err", err)
		return
	}
	sealed, err := crypto.SealMessage(recipientPublicKey, plain)
	if err != nil {
		slog.Default().ErrorContext(ctx, "audit: seal", "err", err)
		return
	}
	if err := db.Query().InsertLog(ctx, sqlc.InsertLogParams{
		OwnerID:           userID,
		Level:             level,
		Message:           sealed,
		EncryptedMetadata: encryptedMetadata,
	}); err != nil {
		slog.Default().ErrorContext(ctx, "audit: insert log", "user_id", userID, "err", err)
	}
}
