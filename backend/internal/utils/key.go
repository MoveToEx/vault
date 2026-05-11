package utils

import "backend/internal/sqlc"

type PrivateKeySuite struct {
	KemPub Bytes `json:"kemPub"`
	KemPri Bytes `json:"kemPri"`
	SgnPub Bytes `json:"sgnPub"`
	SgnPri Bytes `json:"sgnPri"`
}

type KeySuite struct {
	KemPub Bytes `json:"kemPub"`
	SgnPub Bytes `json:"sgnPub"`
}

func GetPrivateSuite(user sqlc.User) PrivateKeySuite {
	return PrivateKeySuite{
		KemPub: user.KemPub,
		KemPri: user.KemPri,
		SgnPub: user.SgnPub,
		SgnPri: user.SgnPri,
	}
}

func GetSuite(user sqlc.User) KeySuite {
	return KeySuite{
		KemPub: user.KemPub,
		SgnPub: user.SgnPub,
	}
}
