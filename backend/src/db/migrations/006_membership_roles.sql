DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'memberships_role_check'
          AND conrelid = 'memberships'::regclass
    ) THEN
        ALTER TABLE memberships
            ADD CONSTRAINT memberships_role_check
            CHECK (role IN ('member', 'admin', 'owner'))
            NOT VALID;

        ALTER TABLE memberships
            VALIDATE CONSTRAINT memberships_role_check;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_memberships_community_role
    ON memberships (community_id, role)
    WHERE status = 'active';
