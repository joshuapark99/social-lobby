INSERT INTO communities (id, slug, name)
VALUES ('00000000-0000-4000-8000-000000000001', 'default-community', 'Default Community')
ON CONFLICT (slug) DO UPDATE
SET name = EXCLUDED.name,
    updated_at = now();

INSERT INTO room_layouts (id, slug, version, layout_json)
VALUES
    (
        '00000000-0000-4000-8000-000000000101',
        'main-lobby',
        1,
        '{
            "theme": "cozy-lobby",
            "backgroundAsset": "rooms/main-lobby.png",
            "avatarStyleSet": "soft-rounded",
            "objectPack": "lobby-furniture-v1",
            "width": 2400,
            "height": 1600,
            "spawnPoints": [{ "x": 320, "y": 420 }],
            "collision": [{ "x": 520, "y": 360, "w": 220, "h": 90 }],
            "teleports": [{ "label": "Rooftop", "targetRoom": "rooftop" }]
        }'::jsonb
    ),
    (
        '00000000-0000-4000-8000-000000000102',
        'rooftop',
        1,
        '{
            "theme": "evening-rooftop",
            "backgroundAsset": "rooms/rooftop.png",
            "avatarStyleSet": "soft-rounded",
            "objectPack": "rooftop-furniture-v1",
            "width": 2200,
            "height": 1400,
            "spawnPoints": [{ "x": 280, "y": 380 }],
            "collision": [{ "x": 900, "y": 220, "w": 340, "h": 70 }],
            "teleports": [{ "label": "Lobby", "targetRoom": "main-lobby" }]
        }'::jsonb
    )
ON CONFLICT (slug, version) DO UPDATE
SET layout_json = EXCLUDED.layout_json;

INSERT INTO rooms (id, community_id, layout_id, slug, name, kind, is_default)
VALUES
    (
        '00000000-0000-4000-8000-000000000201',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000101',
        'main-lobby',
        'Main Lobby',
        'permanent',
        true
    ),
    (
        '00000000-0000-4000-8000-000000000202',
        '00000000-0000-4000-8000-000000000001',
        '00000000-0000-4000-8000-000000000102',
        'rooftop',
        'Rooftop',
        'permanent',
        false
    )
ON CONFLICT (community_id, slug) DO UPDATE
SET layout_id = EXCLUDED.layout_id,
    name = EXCLUDED.name,
    kind = EXCLUDED.kind,
    is_default = EXCLUDED.is_default,
    updated_at = now();
