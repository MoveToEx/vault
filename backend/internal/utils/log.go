package utils

import (
	"context"
	"encoding/json"
	"log/slog"

	"backend/internal/crypto"
	"backend/internal/db"
	"backend/internal/sqlc"
)

func AppendLog(ctx context.Context, userID int64, level sqlc.LogLevel, payload any, extraEnvelope, extraKemCipher []byte) {
	u, err := db.Query().GetUser(ctx, userID)
	if err != nil {
		slog.Default().ErrorContext(ctx, "audit: get user", "user_id", userID, "err", err)
		return
	}
	AppendLogWithPublicKey(ctx, userID, u.KemPub, level, payload, extraEnvelope, extraKemCipher)
}

func AppendLogWithPublicKey(ctx context.Context, userID int64, kemPub []byte, level sqlc.LogLevel, payload any, extraEnvelope, extraKemCipher []byte) {
	plain, err := json.Marshal(payload)
	if err != nil {
		slog.Default().ErrorContext(ctx, "audit: marshal payload", "err", err)
		return
	}
	cipher, err := crypto.CryptoKEMEncryptBytes(kemPub, plain, nil)
	if err != nil {
		slog.Default().ErrorContext(ctx, "audit: KEM encrypt", "err", err)
		return
	}
	if err := db.Query().InsertLog(ctx, sqlc.InsertLogParams{
		OwnerID:          userID,
		Level:            level,
		MessageEnvelope:  cipher.Ciphertext,
		MessageKemCipher: cipher.KEMCiphertext,
		ExtraEnvelope:    extraEnvelope,
		ExtraKemCipher:   extraKemCipher,
	}); err != nil {
		slog.Default().ErrorContext(ctx, "audit: insert log", "user_id", userID, "err", err)
	}
}
