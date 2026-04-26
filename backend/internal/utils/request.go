package utils

import (
	"encoding/base64"
	"encoding/json"

	"github.com/gin-gonic/gin"
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

type PaginationPayload struct {
	Limit  int32 `form:"limit"`
	Offset int32 `form:"offset"`
}

func Pagination(c *gin.Context) (offset, limit int32) {
	var pagination PaginationPayload

	if err := c.ShouldBindQuery(&pagination); err != nil {
		return 0, 24
	}

	return pagination.Offset, pagination.Limit
}
