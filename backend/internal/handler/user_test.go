package handler_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetUser(t *testing.T) {
	router := newRouter()
	viewer := createTestUser(t)
	target := createTestUser(t)

	w := doJSON(t, router, http.MethodGet, "/user/"+target.User.Username, nil, auth(viewer.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.Equal(t, float64(target.User.ID), data["id"])
	assert.Equal(t, target.User.Username, data["username"])
	assert.Contains(t, data, "publicKey")
}

func TestGetUser_NotFound(t *testing.T) {
	router := newRouter()
	viewer := createTestUser(t)

	// Username that does not exist → GetUserByName fails → 500.
	w := doJSON(t, router, http.MethodGet, "/user/no-such-user-xyz", nil, auth(viewer.Token))
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestGetUser_Unauthorized(t *testing.T) {
	router := newRouter()

	w := doJSON(t, router, http.MethodGet, "/user/anyone", nil, nil)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}
