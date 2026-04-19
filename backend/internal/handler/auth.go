package handler

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/permission"
	"backend/internal/sqlc"
	"backend/internal/utils"
	"crypto/rand"
	"encoding/json"
	"time"

	"github.com/bytemare/opaque"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgtype"
)

type RegisterStartPayload struct {
	Username string      `json:"username"`
	Blinded  utils.Bytes `json:"blinded"`
}

type RegisterStartResponse struct {
	Message utils.Bytes `json:"message"`
}

func RegisterStart(c *gin.Context) {
	var payload RegisterStartPayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := c.Request.Context()

	siteCfg, err := db.Query().GetSiteConfig(ctx)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when reading site configuration")
		return
	}

	if !siteCfg.RegistrationOpen {
		utils.ErrorResponse(c, 403, "Registration is closed")
		return
	}

	svr := config.Opaque()

	req, err := svr.Deserialize.RegistrationRequest(payload.Blinded)

	if err != nil {
		utils.ErrorResponse(c, 500, "Faile when deserializing registration")
		return
	}

	credID := opaque.RandomBytes(64)
	pks, err := svr.Deserialize.DecodeAkePublicKey(config.GetConfig().Opaque.ServerPublicKey)
	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when decoding AKE key")
		return
	}

	status := config.Redis().Set(ctx, "reg/cred_id:"+payload.Username, credID, time.Minute*10)

	if status.Err() != nil {
		utils.ErrorResponse(c, 500, "Failed when recording state")
		return
	}

	response := svr.RegistrationResponse(req, pks, credID, config.GetConfig().Opaque.SecretOPRFSeed)

	utils.SuccessResponse(c, RegisterStartResponse{
		Message: response.Serialize(),
	})
}

type KDFParameters struct {
	Salt        utils.Bytes `json:"salt"`
	MemoryCost  int32       `json:"memoryCost"`
	TimeCost    int32       `json:"timeCost"`
	Parallelism int32       `json:"parallelism"`
}

type RegisterFinishPayload struct {
	Email               string        `json:"email"`
	Username            string        `json:"username"`
	PublicKey           utils.Bytes   `json:"publicKey"`
	EncryptedPrivateKey utils.Bytes   `json:"encryptedPrivateKey"`
	OpaqueRecord        utils.Bytes   `json:"opaqueRecord"`
	KDF                 KDFParameters `json:"kdf"`

	EncryptedRootMetadata utils.Bytes `json:"encryptedRootMetadata"`
}

func RegisterFinish(c *gin.Context) {
	var payload RegisterFinishPayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := c.Request.Context()

	siteCfg, err := db.Query().GetSiteConfig(ctx)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when reading site configuration")
		return
	}

	if !siteCfg.RegistrationOpen {
		utils.ErrorResponse(c, 403, "Registration is closed")
		return
	}

	credID, err := config.Redis().GetDel(ctx, "reg/cred_id:"+payload.Username).Bytes()

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when recovering credential ID")
		return
	}

	svr := config.Opaque()

	record, err := svr.Deserialize.RegistrationRecord(payload.OpaqueRecord)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid record")
		return
	}

	var user sqlc.User

	err = db.Transaction(ctx, func(qtx *sqlc.Queries) error {
		var txErr error
		user, txErr = qtx.NewUser(ctx, sqlc.NewUserParams{
			Email:    payload.Email,
			Username: payload.Username,

			PublicKey:           payload.PublicKey,
			EncryptedPrivateKey: payload.EncryptedPrivateKey,

			CredentialIdentifier: credID,
			OpaqueRecord:         record.Serialize(),

			Permission: permission.User,
			Capacity:   siteCfg.DefaultUserCapacityBytes,

			KdfSalt:        payload.KDF.Salt,
			KdfMemoryCost:  payload.KDF.MemoryCost,
			KdfTimeCost:    payload.KDF.TimeCost,
			KdfParallelism: payload.KDF.Parallelism,
		})
		if txErr != nil {
			return txErr
		}

		folder, txErr := qtx.NewFolder(ctx, sqlc.NewFolderParams{
			EncryptedMetadata: payload.EncryptedRootMetadata,
			OwnerID:           user.ID,
		})
		if txErr != nil {
			return txErr
		}

		return qtx.SetRootFolder(ctx, sqlc.SetRootFolderParams{
			ID: user.ID,
			RootFolder: pgtype.Int8{
				Valid: true,
				Int64: folder.ID,
			},
		})
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when completing registration")
		return
	}

	utils.AppendLogWithPublicKey(ctx, user.ID, user.PublicKey, sqlc.LogLevelInfo, map[string]any{
		"action": "register",
	}, nil)

	utils.SuccessResponse(c, nil)
}

type LoginStartPayload struct {
	Username string      `json:"username"`
	KE1      utils.Bytes `json:"ke1"`
}

type LoginStartResponse struct {
	KE2          utils.Bytes `json:"ke2"`
	LoginStateID string      `json:"loginStateID"`
}

type LoginState struct {
	AKEState utils.Bytes `json:"akeState"`
	UserID   int64       `json:"userID"`
}

func LoginStart(c *gin.Context) {
	var payload LoginStartPayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	svr := config.Opaque()

	ke1, err := svr.Deserialize.KE1(payload.KE1)

	if err != nil {
		utils.ErrorResponse(c, 400, "Failed when deserializing KE1")
		return
	}

	ctx := c.Request.Context()

	rec, err := db.Query().GetOpaqueClientRecord(ctx, payload.Username)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid credential")
		return
	}

	lite, err := db.Query().GetUserLiteByUsername(ctx, payload.Username)

	if err != nil || !lite.IsActive {
		utils.ErrorResponse(c, 403, "Invalid credential")
		return
	}

	record, err := svr.Deserialize.RegistrationRecord(rec.OpaqueRecord)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when serializing record")
		return
	}

	ke2, err := svr.LoginInit(ke1, &opaque.ClientRecord{
		CredentialIdentifier: rec.CredentialIdentifier,
		ClientIdentity:       utils.Bytes(rec.Username),
		RegistrationRecord:   record,
	})
	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when initializing login")
		return
	}

	loginStateID := rand.Text()

	state, mErr := json.Marshal(LoginState{
		AKEState: svr.SerializeState(),
		UserID:   rec.ID,
	})

	if mErr != nil {
		utils.ErrorResponse(c, 500, "Failed when marshaling state")
		return
	}

	if err := config.Redis().Set(ctx, "login/state_id:"+loginStateID, state, time.Minute*5).Err(); err != nil {
		utils.ErrorResponse(c, 500, "Failed when recording state")
		return
	}

	utils.SuccessResponse(c, LoginStartResponse{
		KE2:          ke2.Serialize(),
		LoginStateID: loginStateID,
	})
}

type LoginFinishPayload struct {
	KE3          utils.Bytes `json:"ke3"`
	LoginStateID string      `json:"loginStateID"`
}

type LoginFinishResponse struct {
	RefreshToken        string        `json:"refreshToken"`
	KDF                 KDFParameters `json:"kdf"`
	EncryptedPrivateKey utils.Bytes   `json:"encryptedPrivateKey"`
	PublicKey           utils.Bytes   `json:"publicKey"`
}

func LoginFinish(c *gin.Context) {
	var payload LoginFinishPayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	svr := config.Opaque()
	ke3, err := svr.Deserialize.KE3(payload.KE3)
	ctx := c.Request.Context()

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid KE3")
		return
	}

	raw, err := config.Redis().Get(ctx, "login/state_id:"+payload.LoginStateID).Bytes()

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid state id")
		return
	}

	var state LoginState

	if err := json.Unmarshal(raw, &state); err != nil {
		utils.ErrorResponse(c, 500, "Failed when unmarshaling state")
		return
	}

	if err := svr.SetAKEState(state.AKEState); err != nil {
		utils.ErrorResponse(c, 500, "Invalid state")
		return
	}

	if err := svr.LoginFinish(ke3); err != nil {
		utils.ErrorResponse(c, 401, "Invalid credential")
		return
	}

	user, err := db.Query().GetUser(ctx, state.UserID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting KDF parameters")
		return
	}

	if !user.IsActive {
		utils.ErrorResponse(c, 403, "Account is disabled")
		return
	}

	session, err := db.Query().NewSession(ctx, sqlc.NewSessionParams{
		RefreshToken: rand.Text(),
		UserID:       state.UserID,
		ExpiresAt: pgtype.Timestamptz{
			Valid: true,
			Time:  time.Now().Add(time.Hour * 72),
		},
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when creating session")
		return
	}

	utils.AppendLogWithPublicKey(ctx, user.ID, user.PublicKey, sqlc.LogLevelInfo, map[string]any{
		"action": "login",
	}, nil)

	utils.SuccessResponse(c, LoginFinishResponse{
		RefreshToken:        session.RefreshToken,
		EncryptedPrivateKey: user.EncryptedPrivateKey,
		PublicKey:           user.PublicKey,
		KDF: KDFParameters{
			Salt:        user.KdfSalt,
			MemoryCost:  user.KdfMemoryCost,
			Parallelism: user.KdfParallelism,
			TimeCost:    user.KdfTimeCost,
		},
	})
}

type GetResponse struct {
	ID                  int64       `json:"id"`
	Username            string      `json:"username"`
	PublicKey           utils.Bytes `json:"publicKey"`
	EncryptedPrivateKey utils.Bytes `json:"encryptedPrivateKey"`
	RootFolder          int64       `json:"rootFolder"`
	CreatedAt           time.Time   `json:"createdAt"`
	Permission          int64       `json:"permission"`
	KDFSalt             utils.Bytes `json:"kdfSalt"`
	KDFMemoryCost       int32       `json:"kdfMemoryCost"`
	KDFTimeCost         int32       `json:"kdfTimeCost"`
	KdfParallelism      int32       `json:"kdfParallelism"`
}

func GetIdentity(c *gin.Context) {
	userID := c.GetInt64("UserID")

	ctx := c.Request.Context()

	user, err := db.Query().GetUser(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting user")
		return
	}

	utils.SuccessResponse(c, GetResponse{
		ID:                  user.ID,
		Username:            user.Username,
		PublicKey:           user.PublicKey,
		EncryptedPrivateKey: user.EncryptedPrivateKey,
		RootFolder:          user.RootFolder.Int64,
		CreatedAt:           user.CreatedAt.Time,
		Permission:          user.Permission,
		KDFSalt:             user.KdfSalt,
		KDFMemoryCost:       user.KdfMemoryCost,
		KDFTimeCost:         user.KdfTimeCost,
		KdfParallelism:      user.KdfParallelism,
	})
}

type RefreshPayload struct {
	RefreshToken string `json:"refreshToken"`
}

type RefreshResponse struct {
	Token        string `json:"token"`
	RefreshToken string `json:"refreshToken"`
}

func Refresh(c *gin.Context) {
	var payload RefreshPayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := c.Request.Context()

	ref, err := db.Query().GetSession(ctx, payload.RefreshToken)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting token")
		return
	}

	if time.Now().After(ref.ExpiresAt.Time) {
		utils.ErrorResponse(c, 401, "Session expired")
		return
	}

	authRow, err := db.Query().GetUserAuthByID(ctx, ref.UserID)

	if err != nil {
		utils.ErrorResponse(c, 401, "Session expired")
		return
	}

	if !authRow.IsActive {
		utils.ErrorResponse(c, 401, "Session expired")
		return
	}

	token, err := utils.NewToken(ref.UserID, authRow.Permission, time.Minute*5)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when generating token")
		return
	}

	refreshToken := rand.Text()

	if err := db.Query().RotateSession(ctx, sqlc.RotateSessionParams{
		RefreshToken: ref.RefreshToken,
		NewToken:     refreshToken,
	}); err != nil {
		utils.ErrorResponse(c, 500, "Failed when rotating refresh token")
		return
	}

	utils.AppendLog(c.Request.Context(), ref.UserID, sqlc.LogLevelTrace, map[string]any{
		"action": "session_refresh",
	}, nil)

	utils.SuccessResponse(c, RefreshResponse{
		Token:        token,
		RefreshToken: refreshToken,
	})
}

// PasswordChangeStart begins an OPAQUE credential update (same protocol as registration start).
func PasswordChangeStart(c *gin.Context) {
	userID := c.GetInt64("UserID")

	var payload RegisterStartPayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	ctx := c.Request.Context()

	u, err := db.Query().GetUser(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when loading user")
		return
	}

	if !u.IsActive {
		utils.ErrorResponse(c, 403, "Account is disabled")
		return
	}

	svr := config.Opaque()

	req, err := svr.Deserialize.RegistrationRequest(payload.Blinded)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when deserializing registration")
		return
	}

	credID := opaque.RandomBytes(64)
	pks, err := svr.Deserialize.DecodeAkePublicKey(config.GetConfig().Opaque.ServerPublicKey)
	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when decoding AKE key")
		return
	}

	status := config.Redis().Set(ctx, "reg/cred_id:"+u.Username, credID, time.Minute*10)

	if status.Err() != nil {
		utils.ErrorResponse(c, 500, "Failed when recording state")
		return
	}

	response := svr.RegistrationResponse(req, pks, credID, config.GetConfig().Opaque.SecretOPRFSeed)

	utils.SuccessResponse(c, RegisterStartResponse{
		Message: response.Serialize(),
	})
}

type PasswordChangeFinishPayload struct {
	OpaqueRecord        utils.Bytes   `json:"opaqueRecord"`
	EncryptedPrivateKey utils.Bytes   `json:"encryptedPrivateKey"`
	KDF                 KDFParameters `json:"kdf"`
}

func PasswordChangeFinish(c *gin.Context) {
	var payload PasswordChangeFinishPayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	userID := c.GetInt64("UserID")
	ctx := c.Request.Context()

	u, err := db.Query().GetUser(ctx, userID)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when loading user")
		return
	}

	if !u.IsActive {
		utils.ErrorResponse(c, 403, "Account is disabled")
		return
	}

	credID, err := config.Redis().GetDel(ctx, "reg/cred_id:"+u.Username).Bytes()

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when recovering credential ID")
		return
	}

	svr := config.Opaque()

	record, err := svr.Deserialize.RegistrationRecord(payload.OpaqueRecord)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid record")
		return
	}

	if err := db.Query().UpdateUserCredentials(ctx, sqlc.UpdateUserCredentialsParams{
		ID:                   userID,
		OpaqueRecord:         record.Serialize(),
		CredentialIdentifier: credID,
		KdfSalt:              payload.KDF.Salt,
		KdfMemoryCost:        payload.KDF.MemoryCost,
		KdfTimeCost:          payload.KDF.TimeCost,
		KdfParallelism:       payload.KDF.Parallelism,
		EncryptedPrivateKey:  payload.EncryptedPrivateKey,
	}); err != nil {
		utils.ErrorResponse(c, 500, "Failed when updating credentials")
		return
	}

	utils.AppendLogWithPublicKey(ctx, userID, u.PublicKey, sqlc.LogLevelCritical, map[string]any{
		"action": "password_change",
	}, nil)

	utils.SuccessResponse(c, nil)
}
