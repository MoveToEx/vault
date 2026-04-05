package utils

import (
	"backend/internal/config"
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	Permission int64

	jwt.RegisteredClaims
}

func NewToken(userID int64, permission int64, expiration time.Duration) (string, error) {
	payload := Claims{
		Permission: permission,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Audience:  []string{config.GetConfig().JWT.Audience},
			Subject:   fmt.Sprint(userID),
			Issuer:    config.GetConfig().JWT.Issuer,
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
		jwt.WithAudience(config.GetConfig().JWT.Audience),
		jwt.WithIssuer(config.GetConfig().JWT.Issuer),
	)

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*Claims); ok && token.Valid {
		return claims, nil
	}

	return nil, errors.New("Invalid token")
}
