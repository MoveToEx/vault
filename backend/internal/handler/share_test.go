package handler_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFindUser_ByUsername(t *testing.T) {
	router := newRouter()
	searcher := createTestUser(t)
	target := createTestUser(t)

	w := doJSON(t, router, http.MethodGet,
		"/share/lookup?key="+target.User.Username, nil, auth(searcher.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	items := resp["data"].([]any)
	require.NotEmpty(t, items)

	found := items[0].(map[string]any)
	assert.Equal(t, float64(target.User.ID), found["id"])
	assert.Equal(t, target.User.Username, found["username"])
}

func TestFindUser_ByEmail(t *testing.T) {
	router := newRouter()
	searcher := createTestUser(t)
	target := createTestUser(t)

	w := doJSON(t, router, http.MethodGet,
		"/share/lookup?key="+target.User.Email, nil, auth(searcher.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	items := resp["data"].([]any)
	require.NotEmpty(t, items)

	found := items[0].(map[string]any)
	assert.Equal(t, float64(target.User.ID), found["id"])
}

func TestCreateShare(t *testing.T) {
	router := newRouter()
	sender := createTestUser(t)
	receiver := createTestUser(t)
	file := mustCreateFile(t, sender.User.ID, sender.User.RootFolder.Int64)

	payload := map[string]any{
		"receiver":          receiver.User.Username,
		"fileId":            file.ID,
		"encryptedKey":      b64("enc-key"),
		"encryptedMetadata": b64("enc-meta"),
	}
	w := doJSON(t, router, http.MethodPost, "/share", payload, auth(sender.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.Greater(t, data["id"].(float64), float64(0))
}

func TestCreateShare_CannotShareToSelf(t *testing.T) {
	router := newRouter()
	sender := createTestUser(t)
	file := mustCreateFile(t, sender.User.ID, sender.User.RootFolder.Int64)

	payload := map[string]any{
		"receiver":          sender.User.Username,
		"fileId":            file.ID,
		"encryptedKey":      b64("enc-key"),
		"encryptedMetadata": b64("enc-meta"),
	}
	w := doJSON(t, router, http.MethodPost, "/share", payload, auth(sender.Token))
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestCreateShare_OwnershipMismatch(t *testing.T) {
	router := newRouter()
	user1 := createTestUser(t)
	user2 := createTestUser(t)
	user3 := createTestUser(t)

	// file belongs to user2; user1 tries to share it.
	file := mustCreateFile(t, user2.User.ID, user2.User.RootFolder.Int64)

	payload := map[string]any{
		"receiver":          user3.User.Username,
		"fileId":            file.ID,
		"encryptedKey":      b64("enc-key"),
		"encryptedMetadata": b64("enc-meta"),
	}
	w := doJSON(t, router, http.MethodPost, "/share", payload, auth(user1.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestGetShares(t *testing.T) {
	router := newRouter()
	sender := createTestUser(t)
	receiver := createTestUser(t)
	file := mustCreateFile(t, sender.User.ID, sender.User.RootFolder.Int64)
	mustCreateShare(t, file.ID, sender.User.ID, receiver.User.ID)

	w := doJSON(t, router, http.MethodGet, "/share?limit=10", nil, auth(receiver.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	items := resp["data"].([]any)
	assert.NotEmpty(t, items)
}

func TestGetMyShares(t *testing.T) {
	router := newRouter()
	sender := createTestUser(t)
	receiver := createTestUser(t)
	file := mustCreateFile(t, sender.User.ID, sender.User.RootFolder.Int64)
	mustCreateShare(t, file.ID, sender.User.ID, receiver.User.ID)

	w := doJSON(t, router, http.MethodGet, "/share/my?limit=10", nil, auth(sender.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	items := resp["data"].([]any)
	assert.NotEmpty(t, items)
}

func TestGetShare(t *testing.T) {
	router := newRouter()
	sender := createTestUser(t)
	receiver := createTestUser(t)
	file := mustCreateFile(t, sender.User.ID, sender.User.RootFolder.Int64)
	share := mustCreateShare(t, file.ID, sender.User.ID, receiver.User.ID)

	// Receiver can retrieve the share.
	w := doJSON(t, router, http.MethodGet, fmt.Sprintf("/share/%d", share.ID), nil, auth(receiver.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.Equal(t, float64(sender.User.ID), data["senderId"])
	assert.Equal(t, float64(receiver.User.ID), data["receiverId"])
}

func TestGetShare_SenderCanAccess(t *testing.T) {
	router := newRouter()
	sender := createTestUser(t)
	receiver := createTestUser(t)
	file := mustCreateFile(t, sender.User.ID, sender.User.RootFolder.Int64)
	share := mustCreateShare(t, file.ID, sender.User.ID, receiver.User.ID)

	// Sender can also retrieve the share.
	w := doJSON(t, router, http.MethodGet, fmt.Sprintf("/share/%d", share.ID), nil, auth(sender.Token))
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestGetShare_Forbidden(t *testing.T) {
	router := newRouter()
	sender := createTestUser(t)
	receiver := createTestUser(t)
	outsider := createTestUser(t)
	file := mustCreateFile(t, sender.User.ID, sender.User.RootFolder.Int64)
	share := mustCreateShare(t, file.ID, sender.User.ID, receiver.User.ID)

	// Outsider has no access to this share.
	w := doJSON(t, router, http.MethodGet, fmt.Sprintf("/share/%d", share.ID), nil, auth(outsider.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestDeleteShare(t *testing.T) {
	router := newRouter()
	sender := createTestUser(t)
	receiver := createTestUser(t)
	file := mustCreateFile(t, sender.User.ID, sender.User.RootFolder.Int64)
	share := mustCreateShare(t, file.ID, sender.User.ID, receiver.User.ID)

	w := doJSON(t, router, http.MethodDelete, fmt.Sprintf("/share/%d", share.ID), nil, auth(sender.Token))
	assert.Equal(t, http.StatusNoContent, w.Code)
}

// TestGetShareChunk verifies the receiver can obtain a presigned download URL
// for a chunk belonging to a shared file (requires real chunks from uploadFlow).
func TestGetShareChunk(t *testing.T) {
	router := newRouter()
	sender := createTestUser(t)
	receiver := createTestUser(t)

	// Use a real upload so file_chunks rows exist (GetShareChunk JOINs file_chunks).
	fileID := uploadFlow(t, sender, 1024)
	share := mustCreateShare(t, fileID, sender.User.ID, receiver.User.ID)

	w := doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/share/%d/1", share.ID), nil, auth(receiver.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.NotEmpty(t, data["url"])
}

func TestGetShareChunk_OnlyReceiver(t *testing.T) {
	router := newRouter()
	sender := createTestUser(t)
	receiver := createTestUser(t)
	outsider := createTestUser(t)

	fileID := uploadFlow(t, sender, 1024)
	share := mustCreateShare(t, fileID, sender.User.ID, receiver.User.ID)

	// Sender cannot download their own share chunk (only the receiver can).
	w := doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/share/%d/1", share.ID), nil, auth(sender.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)

	// Outsider also cannot access it.
	w2 := doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/share/%d/1", share.ID), nil, auth(outsider.Token))
	assert.Equal(t, http.StatusForbidden, w2.Code)
}

func TestDeleteShare_OnlyOwner(t *testing.T) {
	router := newRouter()
	sender := createTestUser(t)
	receiver := createTestUser(t)
	file := mustCreateFile(t, sender.User.ID, sender.User.RootFolder.Int64)
	share := mustCreateShare(t, file.ID, sender.User.ID, receiver.User.ID)

	// Receiver tries to delete the share (only sender can).
	w := doJSON(t, router, http.MethodDelete, fmt.Sprintf("/share/%d", share.ID), nil, auth(receiver.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)
}
