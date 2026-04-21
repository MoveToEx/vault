package handler_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetCapacity(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	w := doJSON(t, router, http.MethodGet, "/me/capacity", nil, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.Contains(t, data, "used")
	assert.Contains(t, data, "capacity")
	assert.Equal(t, float64(0), data["used"])
}

func TestGetFiles_DefaultRoot(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	rootFolder := user.User.RootFolder.Int64

	// Create a file and a subfolder in the root.
	mustCreateFile(t, user.User.ID, rootFolder)
	mustCreateSubfolder(t, user.User.ID, rootFolder)

	w := doJSON(t, router, http.MethodGet, "/files", nil, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	items := resp["data"].([]any)
	assert.GreaterOrEqual(t, len(items), 2) // at least the file + subfolder we just created
}

func TestGetFiles_ExplicitDir(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	rootFolder := user.User.RootFolder.Int64

	sub := mustCreateSubfolder(t, user.User.ID, rootFolder)
	mustCreateFile(t, user.User.ID, sub.ID)

	w := doJSON(t, router, http.MethodGet, fmt.Sprintf("/files?dir=%d", sub.ID), nil, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	items := resp["data"].([]any)
	assert.Len(t, items, 1)
}

func TestGetFiles_OwnershipMismatch(t *testing.T) {
	router := newRouter()
	user1 := createTestUser(t)
	user2 := createTestUser(t)

	// Create a folder owned by user2.
	sub := mustCreateSubfolder(t, user2.User.ID, user2.User.RootFolder.Int64)

	// user1 tries to list user2's folder.
	w := doJSON(t, router, http.MethodGet, fmt.Sprintf("/files?dir=%d", sub.ID), nil, auth(user1.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestGetFile(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	rootFolder := user.User.RootFolder.Int64
	file := mustCreateFile(t, user.User.ID, rootFolder)

	w := doJSON(t, router, http.MethodGet, fmt.Sprintf("/files/%d", file.ID), nil, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.Contains(t, data, "chunks")
	assert.Contains(t, data, "size")
	assert.Contains(t, data, "encryptedKey")
}

func TestGetFile_OwnershipMismatch(t *testing.T) {
	router := newRouter()
	user1 := createTestUser(t)
	user2 := createTestUser(t)
	file := mustCreateFile(t, user2.User.ID, user2.User.RootFolder.Int64)

	w := doJSON(t, router, http.MethodGet, fmt.Sprintf("/files/%d", file.ID), nil, auth(user1.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestUpdateFile(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	file := mustCreateFile(t, user.User.ID, user.User.RootFolder.Int64)

	payload := map[string]any{"encryptedMetadata": b64("test")}
	w := doJSON(t, router, http.MethodPost, fmt.Sprintf("/files/%d", file.ID), payload, auth(user.Token))
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestUpdateFile_OwnershipMismatch(t *testing.T) {
	router := newRouter()
	user1 := createTestUser(t)
	user2 := createTestUser(t)
	file := mustCreateFile(t, user2.User.ID, user2.User.RootFolder.Int64)

	payload := map[string]any{"encryptedMetadata": b64("test")}
	w := doJSON(t, router, http.MethodPost, fmt.Sprintf("/files/%d", file.ID), payload, auth(user1.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestNewFolder(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	// Create subfolder at root (parentId = 0 means use root).
	payload := map[string]any{
		"parentId":          0,
		"encryptedMetadata": b64("folder-meta"),
	}
	w := doJSON(t, router, http.MethodPost, "/folder", payload, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.Contains(t, data, "ID")
	assert.Greater(t, data["ID"].(float64), float64(0))
}

func TestNewFolder_ExplicitParent(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	rootFolder := user.User.RootFolder.Int64

	payload := map[string]any{
		"parentId":          rootFolder,
		"encryptedMetadata": b64("folder-meta"),
	}
	w := doJSON(t, router, http.MethodPost, "/folder", payload, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)
}

func TestNewFolder_OwnershipMismatch(t *testing.T) {
	router := newRouter()
	user1 := createTestUser(t)
	user2 := createTestUser(t)

	// Try to create a folder inside user2's root.
	payload := map[string]any{
		"parentId":          user2.User.RootFolder.Int64,
		"encryptedMetadata": b64("folder-meta"),
	}
	w := doJSON(t, router, http.MethodPost, "/folder", payload, auth(user1.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestUpdateFolder(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	sub := mustCreateSubfolder(t, user.User.ID, user.User.RootFolder.Int64)

	payload := map[string]any{"encryptedMetadata": b64("updated-meta")}
	w := doJSON(t, router, http.MethodPut, fmt.Sprintf("/folder/%d", sub.ID), payload, auth(user.Token))
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestUpdateFolder_OwnershipMismatch(t *testing.T) {
	router := newRouter()
	user1 := createTestUser(t)
	user2 := createTestUser(t)
	sub := mustCreateSubfolder(t, user2.User.ID, user2.User.RootFolder.Int64)

	payload := map[string]any{"encryptedMetadata": b64("updated-meta")}
	w := doJSON(t, router, http.MethodPut, fmt.Sprintf("/folder/%d", sub.ID), payload, auth(user1.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestDeleteFolder(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	sub := mustCreateSubfolder(t, user.User.ID, user.User.RootFolder.Int64)

	w := doJSON(t, router, http.MethodDelete, fmt.Sprintf("/folder/%d", sub.ID), nil, auth(user.Token))
	assert.Equal(t, http.StatusNoContent, w.Code)
}

func TestDeleteFolder_OwnershipMismatch(t *testing.T) {
	router := newRouter()
	user1 := createTestUser(t)
	user2 := createTestUser(t)
	sub := mustCreateSubfolder(t, user2.User.ID, user2.User.RootFolder.Int64)

	w := doJSON(t, router, http.MethodDelete, fmt.Sprintf("/folder/%d", sub.ID), nil, auth(user1.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestDeleteFile(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	file := mustCreateFile(t, user.User.ID, user.User.RootFolder.Int64)

	w := doJSON(t, router, http.MethodDelete, fmt.Sprintf("/files/%d", file.ID), nil, auth(user.Token))
	assert.Equal(t, http.StatusNoContent, w.Code)
}

func TestDeleteFile_OwnershipMismatch(t *testing.T) {
	router := newRouter()
	user1 := createTestUser(t)
	user2 := createTestUser(t)
	file := mustCreateFile(t, user2.User.ID, user2.User.RootFolder.Int64)

	w := doJSON(t, router, http.MethodDelete, fmt.Sprintf("/files/%d", file.ID), nil, auth(user1.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestMoveFile(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	rootFolder := user.User.RootFolder.Int64
	file := mustCreateFile(t, user.User.ID, rootFolder)
	dest := mustCreateSubfolder(t, user.User.ID, rootFolder)

	payload := map[string]any{"destinationFolderId": dest.ID}
	w := doJSON(t, router, http.MethodPatch, fmt.Sprintf("/files/%d/move", file.ID), payload, auth(user.Token))
	assert.Equal(t, http.StatusNoContent, w.Code)
}

func TestMoveFile_DestOwnershipMismatch(t *testing.T) {
	router := newRouter()
	user1 := createTestUser(t)
	user2 := createTestUser(t)
	file := mustCreateFile(t, user1.User.ID, user1.User.RootFolder.Int64)

	// Destination folder belongs to user2.
	destInUser2 := user2.User.RootFolder.Int64
	payload := map[string]any{"destinationFolderId": destInUser2}
	w := doJSON(t, router, http.MethodPatch, fmt.Sprintf("/files/%d/move", file.ID), payload, auth(user1.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestMoveFolder(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	rootFolder := user.User.RootFolder.Int64
	src := mustCreateSubfolder(t, user.User.ID, rootFolder)
	dest := mustCreateSubfolder(t, user.User.ID, rootFolder)

	payload := map[string]any{"destinationFolderId": dest.ID}
	w := doJSON(t, router, http.MethodPatch, fmt.Sprintf("/folder/%d/move", src.ID), payload, auth(user.Token))
	assert.Equal(t, http.StatusNoContent, w.Code)
}

func TestMoveFolder_IntoSelf(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	sub := mustCreateSubfolder(t, user.User.ID, user.User.RootFolder.Int64)

	payload := map[string]any{"destinationFolderId": sub.ID}
	w := doJSON(t, router, http.MethodPatch, fmt.Sprintf("/folder/%d/move", sub.ID), payload, auth(user.Token))
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestMoveFolder_IntoDescendant(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	root := user.User.RootFolder.Int64

	// parent → child → grandchild
	parent := mustCreateSubfolder(t, user.User.ID, root)
	child := mustCreateSubfolder(t, user.User.ID, parent.ID)

	// Try to move parent into its own descendant (child).
	payload := map[string]any{"destinationFolderId": child.ID}
	w := doJSON(t, router, http.MethodPatch, fmt.Sprintf("/folder/%d/move", parent.ID), payload, auth(user.Token))
	assert.Equal(t, http.StatusBadRequest, w.Code)
}
