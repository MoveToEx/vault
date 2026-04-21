package handler_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"

	"backend/internal/utils"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// encryptedSize returns the on-wire byte count for a chunk of plaintext bytes.
// Mirrors utils.GetEncryptedChunkSize: cipher = plain + 16-byte tag + 24-byte nonce.
func encryptedSize(plainSize int64) int64 {
	return utils.GetEncryptedChunkSize(plainSize)
}

// uploadFlow runs a complete upload for fileSize bytes, puts real data to MinIO,
// and returns the resulting file ID.
func uploadFlow(t *testing.T, user testUser, fileSize int64) int64 {
	t.Helper()
	router := newRouter()

	// Step 1 – InitUpload.
	w := doJSON(t, router, http.MethodPost, "/upload/init", map[string]any{
		"size":              fileSize,
		"encryptedMetadata": b64("upload-meta"),
		"parentId":          0,
	}, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code, "InitUpload: %s", w.Body)

	var initBody map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &initBody))
	uploadData := initBody["data"].(map[string]any)
	uploadID := int64(uploadData["id"].(float64))
	chunks := int(uploadData["chunks"].(float64))
	chunkSize := int64(uploadData["chunkSize"].(float64))

	// Steps 2a–2c per chunk.
	for i := 1; i <= chunks; i++ {
		// 2a – Get presigned PUT URL.
		w2 := doJSON(t, router, http.MethodPost,
			fmt.Sprintf("/upload/%d/%d/init", uploadID, i), nil, auth(user.Token))
		require.Equal(t, http.StatusOK, w2.Code, "UploadChunkInit[%d]: %s", i, w2.Body)

		var chunkInitBody map[string]any
		require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &chunkInitBody))
		cd := chunkInitBody["data"].(map[string]any)
		presignURL := cd["url"].(string)
		method := cd["method"].(string)

		// Compute this chunk's plaintext size.
		thisChunk := chunkSize
		if int64(i) == int64(chunks) && fileSize%chunkSize != 0 {
			thisChunk = fileSize % chunkSize
		}
		encLen := encryptedSize(thisChunk)

		// 2b – PUT encrypted-size bytes of dummy data to MinIO.
		data := bytes.Repeat([]byte{0x42}, int(encLen))
		req, err := http.NewRequestWithContext(context.Background(), method, presignURL, bytes.NewReader(data))
		require.NoError(t, err)
		req.ContentLength = encLen
		resp, err := http.DefaultClient.Do(req)
		require.NoError(t, err)
		io.Copy(io.Discard, resp.Body) //nolint:errcheck
		resp.Body.Close()
		require.Equal(t, http.StatusOK, resp.StatusCode, "PUT chunk %d to MinIO", i)

		// 2c – Mark chunk complete.
		w3 := doJSON(t, router, http.MethodPost,
			fmt.Sprintf("/upload/%d/%d/complete", uploadID, i), nil, auth(user.Token))
		require.Equal(t, http.StatusNoContent, w3.Code, "UploadChunkComplete[%d]: %s", i, w3.Body)
	}

	// Step 3 – UploadComplete: migrate to file.
	w4 := doJSON(t, router, http.MethodPost, fmt.Sprintf("/upload/%d", uploadID),
		map[string]any{"encryptedKey": b64("enc-key")}, auth(user.Token))
	require.Equal(t, http.StatusNoContent, w4.Code, "UploadComplete: %s", w4.Body)

	return mustFindLatestFile(t, user.User.ID).ID
}

// ─── GetUploadSessions ───────────────────────────────────────────────────────

func TestGetUploadSessions_Empty(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	w := doJSON(t, router, http.MethodGet, "/upload", nil, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	items := resp["data"].([]any)
	assert.Empty(t, items)
}

func TestGetUploadSessions_ShowsActive(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	// Init upload then register at least one chunk so the INNER JOIN returns a row.
	w := doJSON(t, router, http.MethodPost, "/upload/init", map[string]any{
		"size":              int64(1024),
		"encryptedMetadata": b64("meta"),
		"parentId":          0,
	}, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)
	var initBody map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &initBody))
	uploadID := int64(initBody["data"].(map[string]any)["id"].(float64))

	// Register chunk 1 (creates upload_chunks row required by the JOIN).
	doJSON(t, router, http.MethodPost,
		fmt.Sprintf("/upload/%d/1/init", uploadID), nil, auth(user.Token))

	w2 := doJSON(t, router, http.MethodGet, "/upload", nil, auth(user.Token))
	require.Equal(t, http.StatusOK, w2.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &resp))
	items := resp["data"].([]any)
	assert.NotEmpty(t, items)
}

// ─── InitUpload ──────────────────────────────────────────────────────────────

func TestInitUpload(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	w := doJSON(t, router, http.MethodPost, "/upload/init", map[string]any{
		"size":              int64(4 * 1024 * 1024), // 4 MiB
		"encryptedMetadata": b64("meta"),
		"parentId":          0,
	}, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.Greater(t, data["id"].(float64), float64(0))
	assert.Equal(t, float64(1), data["chunks"])
	assert.Greater(t, data["chunkSize"].(float64), float64(0))
}

func TestInitUpload_ExplicitParent(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	sub := mustCreateSubfolder(t, user.User.ID, user.User.RootFolder.Int64)

	w := doJSON(t, router, http.MethodPost, "/upload/init", map[string]any{
		"size":              int64(1024),
		"encryptedMetadata": b64("meta"),
		"parentId":          sub.ID,
	}, auth(user.Token))
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestInitUpload_InsufficientCapacity(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	// Request more than the user's 10 GiB capacity.
	const tooBig = int64(11) * 1024 * 1024 * 1024
	w := doJSON(t, router, http.MethodPost, "/upload/init", map[string]any{
		"size":              tooBig,
		"encryptedMetadata": b64("meta"),
		"parentId":          0,
	}, auth(user.Token))
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestInitUpload_ParentOwnershipMismatch(t *testing.T) {
	router := newRouter()
	user1 := createTestUser(t)
	user2 := createTestUser(t)

	// user1 tries to upload into user2's root folder.
	w := doJSON(t, router, http.MethodPost, "/upload/init", map[string]any{
		"size":              int64(1024),
		"encryptedMetadata": b64("meta"),
		"parentId":          user2.User.RootFolder.Int64,
	}, auth(user1.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestInitUpload_InvalidParentFolder(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	// Non-existent folder ID.
	w := doJSON(t, router, http.MethodPost, "/upload/init", map[string]any{
		"size":              int64(1024),
		"encryptedMetadata": b64("meta"),
		"parentId":          int64(999999999),
	}, auth(user.Token))
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestInitUpload_EmptyBody(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	w := doJSON(t, router, http.MethodPost, "/upload/init", nil, auth(user.Token))
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// ─── UploadChunkInit ─────────────────────────────────────────────────────────

func TestUploadChunkInit(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	// Create an upload session first.
	w := doJSON(t, router, http.MethodPost, "/upload/init", map[string]any{
		"size": int64(1024), "encryptedMetadata": b64("meta"), "parentId": 0,
	}, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	uploadID := int64(body["data"].(map[string]any)["id"].(float64))

	w2 := doJSON(t, router, http.MethodPost,
		fmt.Sprintf("/upload/%d/1/init", uploadID), nil, auth(user.Token))
	require.Equal(t, http.StatusOK, w2.Code)

	var chunkBody map[string]any
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &chunkBody))
	cd := chunkBody["data"].(map[string]any)
	assert.NotEmpty(t, cd["url"])
	assert.Equal(t, "PUT", cd["method"])
}

func TestUploadChunkInit_ExceedChunkCount(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	// 1-chunk upload → requesting chunk index 2 exceeds the limit.
	w := doJSON(t, router, http.MethodPost, "/upload/init", map[string]any{
		"size": int64(1024), "encryptedMetadata": b64("meta"), "parentId": 0,
	}, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	uploadID := int64(body["data"].(map[string]any)["id"].(float64))

	w2 := doJSON(t, router, http.MethodPost,
		fmt.Sprintf("/upload/%d/2/init", uploadID), nil, auth(user.Token))
	assert.Equal(t, http.StatusConflict, w2.Code)
}

func TestUploadChunkInit_WrongOwner(t *testing.T) {
	router := newRouter()
	user1 := createTestUser(t)
	user2 := createTestUser(t)

	// user1 creates the session; user2 tries to get the chunk URL.
	w := doJSON(t, router, http.MethodPost, "/upload/init", map[string]any{
		"size": int64(1024), "encryptedMetadata": b64("meta"), "parentId": 0,
	}, auth(user1.Token))
	require.Equal(t, http.StatusOK, w.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	uploadID := int64(body["data"].(map[string]any)["id"].(float64))

	w2 := doJSON(t, router, http.MethodPost,
		fmt.Sprintf("/upload/%d/1/init", uploadID), nil, auth(user2.Token))
	assert.Equal(t, http.StatusConflict, w2.Code)
}

func TestUploadChunkInit_InvalidUploadID(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	w := doJSON(t, router, http.MethodPost, "/upload/999999999/1/init", nil, auth(user.Token))
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

// ─── UploadChunkComplete ─────────────────────────────────────────────────────

func TestUploadChunkComplete(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	// Init session.
	w := doJSON(t, router, http.MethodPost, "/upload/init", map[string]any{
		"size": int64(1024), "encryptedMetadata": b64("meta"), "parentId": 0,
	}, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	uploadID := int64(body["data"].(map[string]any)["id"].(float64))

	// Get presigned URL (which also inserts the chunk record).
	doJSON(t, router, http.MethodPost,
		fmt.Sprintf("/upload/%d/1/init", uploadID), nil, auth(user.Token))

	// Mark chunk complete.
	w3 := doJSON(t, router, http.MethodPost,
		fmt.Sprintf("/upload/%d/1/complete", uploadID), nil, auth(user.Token))
	assert.Equal(t, http.StatusNoContent, w3.Code)
}

func TestUploadChunkComplete_AlreadyCompleted(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	w := doJSON(t, router, http.MethodPost, "/upload/init", map[string]any{
		"size": int64(1024), "encryptedMetadata": b64("meta"), "parentId": 0,
	}, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	uploadID := int64(body["data"].(map[string]any)["id"].(float64))

	doJSON(t, router, http.MethodPost, fmt.Sprintf("/upload/%d/1/init", uploadID), nil, auth(user.Token))

	// First completion — succeeds.
	doJSON(t, router, http.MethodPost, fmt.Sprintf("/upload/%d/1/complete", uploadID), nil, auth(user.Token))

	// Second completion — 409.
	w4 := doJSON(t, router, http.MethodPost,
		fmt.Sprintf("/upload/%d/1/complete", uploadID), nil, auth(user.Token))
	assert.Equal(t, http.StatusConflict, w4.Code)
}

func TestUploadChunkComplete_WrongOwner(t *testing.T) {
	router := newRouter()
	user1 := createTestUser(t)
	user2 := createTestUser(t)

	w := doJSON(t, router, http.MethodPost, "/upload/init", map[string]any{
		"size": int64(1024), "encryptedMetadata": b64("meta"), "parentId": 0,
	}, auth(user1.Token))
	require.Equal(t, http.StatusOK, w.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	uploadID := int64(body["data"].(map[string]any)["id"].(float64))

	doJSON(t, router, http.MethodPost, fmt.Sprintf("/upload/%d/1/init", uploadID), nil, auth(user1.Token))

	w3 := doJSON(t, router, http.MethodPost,
		fmt.Sprintf("/upload/%d/1/complete", uploadID), nil, auth(user2.Token))
	assert.Equal(t, http.StatusConflict, w3.Code)
}

// ─── UploadComplete ──────────────────────────────────────────────────────────

func TestUploadComplete_OwnershipMismatch(t *testing.T) {
	router := newRouter()
	user1 := createTestUser(t)
	user2 := createTestUser(t)

	w := doJSON(t, router, http.MethodPost, "/upload/init", map[string]any{
		"size": int64(1024), "encryptedMetadata": b64("meta"), "parentId": 0,
	}, auth(user1.Token))
	require.Equal(t, http.StatusOK, w.Code)
	var body map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &body))
	uploadID := int64(body["data"].(map[string]any)["id"].(float64))

	w2 := doJSON(t, router, http.MethodPost, fmt.Sprintf("/upload/%d", uploadID),
		map[string]any{"encryptedKey": b64("enc-key")}, auth(user2.Token))
	assert.Equal(t, http.StatusForbidden, w2.Code)
}

func TestUploadComplete_InvalidUploadID(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	w := doJSON(t, router, http.MethodPost, "/upload/999999999",
		map[string]any{"encryptedKey": b64("enc-key")}, auth(user.Token))
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

// ─── Full upload flow (with real MinIO) ──────────────────────────────────────

func TestFullUploadFlow_SingleChunk(t *testing.T) {
	user := createTestUser(t)
	fileID := uploadFlow(t, user, 1024) // 1 KiB → 1 chunk

	// Verify the file exists in the DB.
	file := mustFindLatestFile(t, user.User.ID)
	assert.Equal(t, fileID, file.ID)
	assert.Equal(t, int64(1024), file.Size)
	assert.Equal(t, int32(1), file.Chunks)
}

func TestFullUploadFlow_MultiChunk(t *testing.T) {
	user := createTestUser(t)
	// 10 MiB → 3 chunks (4+4+2 MiB with 4 MiB chunkSize).
	fileID := uploadFlow(t, user, 10*1024*1024)

	file := mustFindLatestFile(t, user.User.ID)
	assert.Equal(t, fileID, file.ID)
	assert.Equal(t, int64(10*1024*1024), file.Size)
	assert.Equal(t, int32(3), file.Chunks)
}

func TestFullUploadFlow_FileAppearsInListing(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	uploadFlow(t, user, 1024)

	w := doJSON(t, router, http.MethodGet, "/files", nil, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	items := resp["data"].([]any)
	assert.NotEmpty(t, items)
}

// ─── GetChunk (presign download URL) ─────────────────────────────────────────

func TestGetChunk(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	fileID := uploadFlow(t, user, 1024)

	w := doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/files/%d/1", fileID), nil, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.NotEmpty(t, data["url"])
	// The handler presigns a GET URL; method field is not present but url must be a valid S3 URL.
	assert.Contains(t, data["url"].(string), testS3Bucket)
}

func TestGetChunk_DownloadData(t *testing.T) {
	// After a full upload, the presigned GET URL should return the data we PUT.
	user := createTestUser(t)
	fileID := uploadFlow(t, user, 1024)

	router := newRouter()
	w := doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/files/%d/1", fileID), nil, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	presignURL := resp["data"].(map[string]any)["url"].(string)

	// Follow the presigned URL directly.
	getResp, err := http.Get(presignURL) //nolint:noctx
	require.NoError(t, err)
	body, _ := io.ReadAll(getResp.Body)
	getResp.Body.Close()
	assert.Equal(t, http.StatusOK, getResp.StatusCode)

	// Data should be the dummy bytes we uploaded (1024 + 40 = 1064 bytes).
	assert.Equal(t, int(encryptedSize(1024)), len(body))
}

func TestGetChunk_OwnershipMismatch(t *testing.T) {
	router := newRouter()
	user1 := createTestUser(t)
	user2 := createTestUser(t)
	fileID := uploadFlow(t, user1, 1024)

	w := doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/files/%d/1", fileID), nil, auth(user2.Token))
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

func TestGetChunk_InvalidIndex(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	fileID := uploadFlow(t, user, 1024)

	// Chunk index 99 does not exist.
	w := doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/files/%d/99", fileID), nil, auth(user.Token))
	assert.Equal(t, http.StatusInternalServerError, w.Code)
}

// ─── Capacity updated after upload ───────────────────────────────────────────

func TestGetCapacity_AfterUpload(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	wBefore := doJSON(t, router, http.MethodGet, "/me/capacity", nil, auth(user.Token))
	require.Equal(t, http.StatusOK, wBefore.Code)
	var before map[string]any
	require.NoError(t, json.Unmarshal(wBefore.Body.Bytes(), &before))
	usedBefore := int64(before["data"].(map[string]any)["used"].(float64))

	uploadFlow(t, user, 1024)

	wAfter := doJSON(t, router, http.MethodGet, "/me/capacity", nil, auth(user.Token))
	require.Equal(t, http.StatusOK, wAfter.Code)
	var after map[string]any
	require.NoError(t, json.Unmarshal(wAfter.Body.Bytes(), &after))
	usedAfter := int64(after["data"].(map[string]any)["used"].(float64))

	assert.Greater(t, usedAfter, usedBefore)
	assert.Equal(t, int64(1024), usedAfter-usedBefore)
}
