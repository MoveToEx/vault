package handler

import (
	"backend/internal/config"
	"backend/internal/db"
	"backend/internal/sqlc"
	"backend/internal/utils"
	"context"
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

	ctx := context.Background()
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

	ctx := context.Background()

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

	user, err := db.Query().NewUser(ctx, sqlc.NewUserParams{
		Email:    payload.Email,
		Username: payload.Username,

		PublicKey:           payload.PublicKey,
		EncryptedPrivateKey: payload.EncryptedPrivateKey,

		CredentialIdentifier: credID,
		OpaqueRecord:         record.Serialize(),

		Permission: 1,
		Capacity:   2 * 1024 * 1024,

		KdfSalt:        payload.KDF.Salt,
		KdfMemoryCost:  payload.KDF.MemoryCost,
		KdfTimeCost:    payload.KDF.TimeCost,
		KdfParallelism: payload.KDF.Parallelism,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when creating user")
		return
	}

	folder, err := db.Query().NewFolder(ctx, sqlc.NewFolderParams{
		EncryptedMetadata: payload.EncryptedRootMetadata,
		OwnerID:           user.ID,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when creating root directory")
		return
	}

	err = db.Query().SetRootFolder(ctx, sqlc.SetRootFolderParams{
		ID: user.ID,
		RootFolder: pgtype.Int8{
			Valid: true,
			Int64: folder.ID,
		},
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when assigning root directory")
		return
	}

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

	ctx := context.Background()

	rec, err := db.Query().GetOpaqueClientRecord(ctx, payload.Username)

	if err != nil {
		utils.ErrorResponse(c, 400, "Invalid credential")
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

	loginStateID := rand.Text()

	state, err := json.Marshal(LoginState{
		AKEState: svr.SerializeState(),
		UserID:   rec.ID,
	})

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when marshaling state")
		return
	}

	config.Redis().Set(ctx, "login/state_id:"+loginStateID, state, time.Minute*5)

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
}

func LoginFinish(c *gin.Context) {
	var payload LoginFinishPayload

	if err := c.ShouldBindJSON(&payload); err != nil {
		utils.ErrorResponse(c, 400, "Invalid request")
		return
	}

	svr := config.Opaque()
	ke3, err := svr.Deserialize.KE3(payload.KE3)
	ctx := context.Background()

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

	utils.SuccessResponse(c, LoginFinishResponse{
		RefreshToken:        session.RefreshToken,
		EncryptedPrivateKey: user.EncryptedPrivateKey,
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
	KDFSalt             utils.Bytes `json:"kdfSalt"`
	KDFMemoryCost       int32       `json:"kdfMemoryCost"`
	KDFTimeCost         int32       `json:"kdfTimeCost"`
	KdfParallelism      int32       `json:"kdfParallelism"`
}

func GetIdentity(c *gin.Context) {
	userID := c.GetInt64("UserID")

	ctx := context.Background()

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

	ctx := context.Background()

	ref, err := db.Query().GetSession(ctx, payload.RefreshToken)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when getting token")
		return
	}

	if time.Now().After(ref.ExpiresAt.Time) {
		utils.ErrorResponse(c, 401, "Session expired")
		return
	}

	token, err := utils.NewToken(ref.UserID, 0, time.Minute*5)

	if err != nil {
		utils.ErrorResponse(c, 500, "Failed when generating token")
		return
	}

	refreshToken := rand.Text()

	if err := db.Query().UpdateSession(ctx, sqlc.UpdateSessionParams{
		RefreshToken: ref.RefreshToken,
		NewToken:     refreshToken,
	}); err != nil {
		utils.ErrorResponse(c, 500, "Failed when rotating refresh token")
		return
	}

	utils.SuccessResponse(c, RefreshResponse{
		Token:        token,
		RefreshToken: refreshToken,
	})
}
