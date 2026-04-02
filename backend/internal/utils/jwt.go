package utils

import (
	"backend/internal/config"
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID     int64
	Permission int64

	jwt.RegisteredClaims
}

func NewToken(userID int64, permission int64, expiration time.Duration) (string, error) {
	payload := Claims{
		UserID:     userID,
		Permission: permission,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	t := jwt.NewWithClaims(jwt.SigningMethodEdDSA, payload)

	return t.SignedString(config.GetConfig().JWT.PrivateKey)
}

func ParseToken(s string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(
		s,
		&Claims{},
		func(t *jwt.Token) (any, error) {
			return config.GetConfig().JWT.PublicKey, nil
		},
		jwt.WithValidMethods([]string{jwt.SigningMethodEdDSA.Alg()}),
	)

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("Invalid token")
}
