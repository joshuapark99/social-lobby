package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"time"
)

const sessionTokenBytes = 32

type Session struct {
	UserID    int64
	ExpiresAt time.Time
}

func NewSessionToken() (string, error) {
	token := make([]byte, sessionTokenBytes)
	if _, err := rand.Read(token); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(token), nil
}

func HashSessionToken(token string) (string, error) {
	if token == "" {
		return "", errors.New("session token is required")
	}
	hash := sha256.Sum256([]byte(token))
	return hex.EncodeToString(hash[:]), nil
}

func (s Session) IsExpired(now time.Time) bool {
	return !s.ExpiresAt.After(now)
}
