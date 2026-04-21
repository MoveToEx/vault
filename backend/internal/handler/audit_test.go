package handler_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
	"time"

	"backend/internal/sqlc"
	"backend/internal/utils"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// seedAuditLogs inserts n log entries for the given user.
func seedAuditLogs(t *testing.T, u testUser, n int) {
	t.Helper()
	ctx := context.Background()
	for i := range n {
		utils.AppendLogWithPublicKey(ctx, u.User.ID, u.User.PublicKey, sqlc.LogLevelInfo, map[string]any{
			"action": fmt.Sprintf("test_action_%d", i),
		}, nil)
	}
}

func TestListAuditLogs(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	seedAuditLogs(t, user, 5)

	w := doJSON(t, router, http.MethodGet, "/audit/logs", nil, auth(user.Token))
	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.Contains(t, data, "total")
	assert.Contains(t, data, "items")
	items := data["items"].([]any)
	assert.NotEmpty(t, items)
}

func TestListAuditLogs_Pagination(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	seedAuditLogs(t, user, 10)

	w := doJSON(t, router, http.MethodGet, "/audit/logs?limit=3&offset=0", nil, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	items := data["items"].([]any)
	assert.Len(t, items, 3)

	total := data["total"].(float64)
	assert.GreaterOrEqual(t, total, float64(10))
}

func TestListAuditLogs_LevelFilter(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	ctx := context.Background()

	// Insert one log at each level.
	utils.AppendLogWithPublicKey(ctx, user.User.ID, user.User.PublicKey, sqlc.LogLevelTrace, map[string]any{"action": "trace"}, nil)
	utils.AppendLogWithPublicKey(ctx, user.User.ID, user.User.PublicKey, sqlc.LogLevelWarning, map[string]any{"action": "warn"}, nil)

	w := doJSON(t, router, http.MethodGet, "/audit/logs?level=trace", nil, auth(user.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	total := data["total"].(float64)
	assert.GreaterOrEqual(t, total, float64(1))
}

func TestListAuditLogs_InvalidLevel(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	w := doJSON(t, router, http.MethodGet, "/audit/logs?level=bogus", nil, auth(user.Token))
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestListAuditLogs_TimeRangeFilter(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)
	seedAuditLogs(t, user, 3)

	from := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)
	to := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)

	w := doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/audit/logs?from=%s&to=%s", from, to),
		nil, auth(user.Token))
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestListAuditLogs_InvalidFrom(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	w := doJSON(t, router, http.MethodGet, "/audit/logs?from=not-a-date", nil, auth(user.Token))
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestListAuditLogs_InvalidTo(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	w := doJSON(t, router, http.MethodGet, "/audit/logs?to=not-a-date", nil, auth(user.Token))
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestListAuditLogs_FromAfterTo(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	from := time.Now().Add(time.Hour).UTC().Format(time.RFC3339)
	to := time.Now().Add(-time.Hour).UTC().Format(time.RFC3339)

	w := doJSON(t, router, http.MethodGet,
		fmt.Sprintf("/audit/logs?from=%s&to=%s", from, to),
		nil, auth(user.Token))
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestListAuditLogs_OnlyOwnLogs(t *testing.T) {
	router := newRouter()
	user1 := createTestUser(t)
	user2 := createTestUser(t)

	// Seed 5 logs for user1 only.
	seedAuditLogs(t, user1, 5)

	// user2 should see 0 items (no logs seeded for them yet).
	w := doJSON(t, router, http.MethodGet, "/audit/logs", nil, auth(user2.Token))
	require.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	total := data["total"].(float64)
	assert.Equal(t, float64(0), total)
}
