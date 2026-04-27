package auth

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

const findLinkedIdentityUserIDSQL = `
SELECT user_id
FROM linked_identities
WHERE provider = $1 AND provider_subject = $2
`

const insertUserSQL = `
INSERT INTO users (display_name)
VALUES ($1)
RETURNING id
`

const insertLinkedIdentitySQL = `
INSERT INTO linked_identities (user_id, provider, provider_subject, email)
VALUES ($1, $2, $3, $4)
ON CONFLICT (provider, provider_subject) DO NOTHING
`

const insertSessionSQL = `
INSERT INTO user_sessions (user_id, token_hash, expires_at)
VALUES ($1, $2, $3)
`

const findIdentityBySessionHashSQL = `
SELECT li.provider, li.provider_subject, li.email, u.display_name
FROM user_sessions us
JOIN users u ON u.id = us.user_id
JOIN linked_identities li ON li.user_id = u.id
WHERE us.token_hash = $1
  AND us.revoked_at IS NULL
  AND us.expires_at > $2
ORDER BY li.created_at ASC
LIMIT 1
`

const revokeSessionSQL = `
UPDATE user_sessions
SET revoked_at = now()
WHERE token_hash = $1 AND revoked_at IS NULL
`

type PostgresStore struct {
	db *sql.DB
}

func NewPostgresStore(db *sql.DB) PostgresStore {
	return PostgresStore{db: db}
}

func (s PostgresStore) FindOrCreateUserByIdentity(ctx context.Context, identity OIDCIdentity) (string, error) {
	if err := identity.Validate(); err != nil {
		return "", err
	}

	var existingUserID string
	err := s.db.QueryRowContext(ctx, findLinkedIdentityUserIDSQL, identity.Provider, identity.Subject).Scan(&existingUserID)
	if err == nil {
		return existingUserID, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", err
	}
	defer func() {
		_ = tx.Rollback()
	}()

	displayName := identity.Name
	if displayName == "" {
		displayName = identity.Email
	}

	var userID string
	if err := tx.QueryRowContext(ctx, insertUserSQL, displayName).Scan(&userID); err != nil {
		return "", err
	}
	if _, err := tx.ExecContext(ctx, insertLinkedIdentitySQL, userID, identity.Provider, identity.Subject, identity.Email); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", err
	}
	return userID, nil
}

func (s PostgresStore) CreateSession(ctx context.Context, userID string, tokenHash string, expiresAt time.Time) error {
	_, err := s.db.ExecContext(ctx, insertSessionSQL, userID, tokenHash, expiresAt)
	return err
}

func (s PostgresStore) FindIdentityBySessionHash(ctx context.Context, tokenHash string, now time.Time) (OIDCIdentity, bool, error) {
	var identity OIDCIdentity
	err := s.db.QueryRowContext(ctx, findIdentityBySessionHashSQL, tokenHash, now).Scan(
		&identity.Provider,
		&identity.Subject,
		&identity.Email,
		&identity.Name,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return OIDCIdentity{}, false, nil
	}
	if err != nil {
		return OIDCIdentity{}, false, err
	}
	return identity, true, nil
}

func (s PostgresStore) RevokeSession(ctx context.Context, tokenHash string) error {
	_, err := s.db.ExecContext(ctx, revokeSessionSQL, tokenHash)
	return err
}
