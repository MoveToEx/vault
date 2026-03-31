package utils

import (
	"encoding/base64"
	"encoding/json"
)

type Bytes []byte

func (b *Bytes) UnmarshalJSON(data []byte) error {
	var s string
	if err := json.Unmarshal(data, &s); err != nil {
		return err
	}

	decoded, err := base64.RawURLEncoding.DecodeString(s)
	if err != nil {
		return err
	}

	*b = decoded
	return nil
}

func (b Bytes) MarshalJSON() ([]byte, error) {
	encoded := base64.RawURLEncoding.EncodeToString(b)
	return json.Marshal(encoded)
}
