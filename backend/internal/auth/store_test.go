package auth

import (
	"strings"
	"testing"
)

func TestPostgresStoreQueriesPersistLinkedIdentitiesAndSessions(t *testing.T) {
	for name, query := range map[string]string{
		"find identity":       findLinkedIdentityUserIDSQL,
		"insert user":         insertUserSQL,
		"insert identity":     insertLinkedIdentitySQL,
		"insert session":      insertSessionSQL,
		"find session join":   findIdentityBySessionHashSQL,
		"revoke session hash": revokeSessionSQL,
	} {
		if strings.TrimSpace(query) == "" {
			t.Fatalf("expected %s query", name)
		}
	}

	if !strings.Contains(findLinkedIdentityUserIDSQL, "provider_subject") {
		t.Fatal("expected linked identity lookup by provider subject")
	}
	if !strings.Contains(insertSessionSQL, "token_hash") {
		t.Fatal("expected sessions to store token hashes")
	}
	if !strings.Contains(findIdentityBySessionHashSQL, "revoked_at IS NULL") {
		t.Fatal("expected session lookup to exclude revoked sessions")
	}
	if !strings.Contains(findIdentityBySessionHashSQL, "expires_at >") {
		t.Fatal("expected session lookup to exclude expired sessions")
	}
}
