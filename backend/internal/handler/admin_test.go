package handler_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAdminStats(t *testing.T) {
	router := newRouter()
	admin := createAdminUser(t)

	w := doJSON(t, router, http.MethodGet, "/admin/stats", nil, auth(admin.Token))
	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.Contains(t, data, "userCount")
	assert.Contains(t, data, "fileCount")
	assert.Contains(t, data, "totalStoredBytes")
	assert.Contains(t, data, "activeUploadSessions")
}

func TestAdminStats_Forbidden(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	w := doJSON(t, router, http.MethodGet, "/admin/stats", nil, auth(user.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestAdminStats_Unauthorized(t *testing.T) {
	router := newRouter()

	w := doJSON(t, router, http.MethodGet, "/admin/stats", nil, nil)
	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestAdminGetSiteConfig(t *testing.T) {
	router := newRouter()
	admin := createAdminUser(t)

	w := doJSON(t, router, http.MethodGet, "/admin/site-config", nil, auth(admin.Token))
	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.Contains(t, data, "registrationOpen")
	assert.Contains(t, data, "uploadExpirySeconds")
	assert.Contains(t, data, "defaultUserCapacityBytes")
}

func TestAdminPatchSiteConfig(t *testing.T) {
	router := newRouter()
	admin := createAdminUser(t)

	payload := map[string]any{
		"uploadExpirySeconds":      3600,
		"registrationOpen":         false,
		"defaultUserCapacityBytes": 1 << 30, // 1 GiB
	}
	w := doJSON(t, router, http.MethodPatch, "/admin/site-config", payload, auth(admin.Token))
	assert.Equal(t, http.StatusNoContent, w.Code)

	// Verify the update persisted.
	w2 := doJSON(t, router, http.MethodGet, "/admin/site-config", nil, auth(admin.Token))
	require.Equal(t, http.StatusOK, w2.Code)
	var resp map[string]any
	require.NoError(t, json.Unmarshal(w2.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.Equal(t, float64(3600), data["uploadExpirySeconds"])
	assert.Equal(t, false, data["registrationOpen"])

	// Restore registration open so other tests can still create users.
	restore := map[string]any{
		"uploadExpirySeconds":      10800,
		"registrationOpen":         true,
		"defaultUserCapacityBytes": 1 << 30,
	}
	doJSON(t, router, http.MethodPatch, "/admin/site-config", restore, auth(admin.Token))
}

func TestAdminPatchSiteConfig_InvalidExpiry(t *testing.T) {
	router := newRouter()
	admin := createAdminUser(t)

	// Too small
	w := doJSON(t, router, http.MethodPatch, "/admin/site-config", map[string]any{
		"uploadExpirySeconds":      10,
		"registrationOpen":         true,
		"defaultUserCapacityBytes": 1 << 30,
	}, auth(admin.Token))
	assert.Equal(t, http.StatusBadRequest, w.Code)

	// Too large
	w2 := doJSON(t, router, http.MethodPatch, "/admin/site-config", map[string]any{
		"uploadExpirySeconds":      86400*8,
		"registrationOpen":         true,
		"defaultUserCapacityBytes": 1 << 30,
	}, auth(admin.Token))
	assert.Equal(t, http.StatusBadRequest, w2.Code)
}

func TestAdminPatchSiteConfig_InvalidCapacity(t *testing.T) {
	router := newRouter()
	admin := createAdminUser(t)

	// Too small (< 1 MiB)
	w := doJSON(t, router, http.MethodPatch, "/admin/site-config", map[string]any{
		"uploadExpirySeconds":      3600,
		"registrationOpen":         true,
		"defaultUserCapacityBytes": 100,
	}, auth(admin.Token))
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestAdminListUsers(t *testing.T) {
	router := newRouter()
	admin := createAdminUser(t)
	// Create a couple of regular users to have something to list.
	createTestUser(t)
	createTestUser(t)

	w := doJSON(t, router, http.MethodGet, "/admin/users", nil, auth(admin.Token))
	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	assert.Contains(t, data, "total")
	assert.Contains(t, data, "items")
	items := data["items"].([]any)
	assert.NotEmpty(t, items)
}

func TestAdminGetSiteConfig_Forbidden(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	w := doJSON(t, router, http.MethodGet, "/admin/site-config", nil, auth(user.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestAdminListUsers_Forbidden(t *testing.T) {
	router := newRouter()
	user := createTestUser(t)

	w := doJSON(t, router, http.MethodGet, "/admin/users", nil, auth(user.Token))
	assert.Equal(t, http.StatusForbidden, w.Code)
}

func TestAdminListUsers_Pagination(t *testing.T) {
	router := newRouter()
	admin := createAdminUser(t)

	w := doJSON(t, router, http.MethodGet, "/admin/users?limit=1&offset=0", nil, auth(admin.Token))
	assert.Equal(t, http.StatusOK, w.Code)

	var resp map[string]any
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	data := resp["data"].(map[string]any)
	items := data["items"].([]any)
	assert.Len(t, items, 1)
}

func TestAdminPatchUserCapacity(t *testing.T) {
	router := newRouter()
	admin := createAdminUser(t)
	target := createTestUser(t)

	payload := map[string]any{"capacity": 2 << 30} // 2 GiB
	w := doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/admin/users/%d/capacity", target.User.ID),
		payload, auth(admin.Token))
	assert.Equal(t, http.StatusNoContent, w.Code)
}

func TestAdminPatchUserCapacity_BelowUsage(t *testing.T) {
	router := newRouter()
	admin := createAdminUser(t)
	target := createTestUser(t)

	// Set capacity far below the default (usage is 0, but capacity below 1 MiB is invalid).
	payload := map[string]any{"capacity": 100}
	w := doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/admin/users/%d/capacity", target.User.ID),
		payload, auth(admin.Token))
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

func TestAdminPatchUserCapacity_NotFound(t *testing.T) {
	router := newRouter()
	admin := createAdminUser(t)

	payload := map[string]any{"capacity": 2 << 30}
	w := doJSON(t, router, http.MethodPatch,
		"/admin/users/999999999/capacity",
		payload, auth(admin.Token))
	assert.Equal(t, http.StatusNotFound, w.Code)
}

func TestAdminPatchUserActive_Disable(t *testing.T) {
	router := newRouter()
	admin := createAdminUser(t)
	// Create a second admin so the first can be disabled (last-admin guard won't fire).
	createAdminUser(t)
	target := createTestUser(t)

	w := doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/admin/users/%d/active", target.User.ID),
		map[string]any{"isActive": false}, auth(admin.Token))
	assert.Equal(t, http.StatusNoContent, w.Code)

	// Re-enable for cleanliness.
	doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/admin/users/%d/active", target.User.ID),
		map[string]any{"isActive": true}, auth(admin.Token))
}

func TestAdminPatchUserActive_CannotDisableSelf(t *testing.T) {
	router := newRouter()
	admin := createAdminUser(t)

	w := doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/admin/users/%d/active", admin.User.ID),
		map[string]any{"isActive": false}, auth(admin.Token))
	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// TestAdminPatchUserActive_AdminCanDisableOtherAdmin verifies that one admin can
// disable another admin when additional active admins exist in the system.
func TestAdminPatchUserActive_AdminCanDisableOtherAdmin(t *testing.T) {
	router := newRouter()
	admin1 := createAdminUser(t)
	admin2 := createAdminUser(t)

	// admin1 disables admin2 — succeeds because admin1 is still active.
	w := doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/admin/users/%d/active", admin2.User.ID),
		map[string]any{"isActive": false}, auth(admin1.Token))
	assert.Equal(t, http.StatusNoContent, w.Code)

	// Re-enable admin2.
	doJSON(t, router, http.MethodPatch,
		fmt.Sprintf("/admin/users/%d/active", admin2.User.ID),
		map[string]any{"isActive": true}, auth(admin1.Token))
}
