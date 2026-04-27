ALTER TABLE invites
    ADD COLUMN IF NOT EXISTS target_email text;

CREATE INDEX IF NOT EXISTS idx_invites_target_email
    ON invites (target_email)
    WHERE target_email IS NOT NULL;
