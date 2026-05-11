package utils

type Envelope struct {
	EncryptedMetadata Bytes `json:"encryptedMetadata"`
	EphemeralKey      Bytes `json:"ephemeralKey"`
}

type FileEnvelope struct {
	EncryptedMetadata Bytes `json:"encryptedMetadata"`
	EncryptedKey      Bytes `json:"encryptedKey"`
	EphemeralKey      Bytes `json:"ephemeralKey"`
}

type KDFParameters struct {
	Salt       Bytes `json:"salt"`
	MemoryCost int32 `json:"memoryCost"`
	TimeCost   int32 `json:"timeCost"`
}
