ALTER TABLE users
    ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
    ON users (username)
    WHERE username IS NOT NULL;
