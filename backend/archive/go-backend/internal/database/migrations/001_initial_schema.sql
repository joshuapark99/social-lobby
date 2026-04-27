CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS linked_identities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider text NOT NULL,
    provider_subject text NOT NULL,
    email text,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS communities (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL UNIQUE,
    name text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'member',
    status text NOT NULL DEFAULT 'active',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, community_id)
);

CREATE TABLE IF NOT EXISTS invites (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    code_hash text NOT NULL UNIQUE,
    created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    max_redemptions integer,
    redemption_count integer NOT NULL DEFAULT 0,
    expires_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS room_layouts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug text NOT NULL,
    version integer NOT NULL,
    layout_json jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (slug, version)
);

CREATE TABLE IF NOT EXISTS rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    community_id uuid NOT NULL REFERENCES communities(id) ON DELETE CASCADE,
    layout_id uuid NOT NULL REFERENCES room_layouts(id),
    slug text NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (community_id, slug)
);

CREATE TABLE IF NOT EXISTS room_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visited_rooms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    first_visited_at timestamptz NOT NULL DEFAULT now(),
    last_visited_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, room_id)
);

CREATE TABLE IF NOT EXISTS temporary_room_lifecycle_records (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    reason text NOT NULL,
    expires_at timestamptz,
    closed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_room_messages_room_created_at
    ON room_messages (room_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_visited_rooms_user_last_visited_at
    ON visited_rooms (user_id, last_visited_at DESC);
