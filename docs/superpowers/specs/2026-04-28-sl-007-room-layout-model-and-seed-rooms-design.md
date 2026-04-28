# SL-007 Room Layout Model And Seed Rooms Design

## Scope

This ticket establishes the room metadata contract shared by the backend and frontend. It does not implement rendering, movement, or realtime room presence.

The implementation covers:

- validated room layout documents for seeded permanent rooms
- backend room metadata endpoints for the default community and individual rooms
- frontend loading states for lobby and room metadata
- tests for layout validation, room responses, and frontend room metadata states

The implementation does not cover:

- Pixi rendering
- WebSocket room joins
- active presence
- movement or teleport execution

## Current State

The backend already has seeded `room_layouts` and `rooms` records, but the layout shape only exists implicitly in SQL and JSON seed data. The frontend still shows placeholder lobby and room panels and has no room metadata API contract.

This creates two gaps:

1. invalid layout data could be stored or served without a strong validation boundary
2. the frontend has no real read model for rooms before the renderer ticket

## Goals

- define a first-class layout schema matching the ticket acceptance criteria
- validate layout dimensions, spawn points, collision bounds, and teleport targets
- guarantee that the default community exposes at least two permanent rooms
- expose room metadata with the active layout version over HTTP
- let the frontend load and display room metadata without introducing renderer or realtime concerns

## Architecture

### Layout domain

The backend will add a dedicated room layout module with:

- layout types matching the MVP shape
- structural validation for JSON payloads loaded from the database
- semantic validation for dimensions, bounds, spawn points, and teleports

Validation rules:

- `width` and `height` must be positive integers
- every spawn point must be within room bounds
- every collision rectangle must stay within room bounds and use positive `w` and `h`
- every teleport must have a non-empty label and target an existing room slug in the same metadata set

The authoritative layout payload remains the JSON stored in Postgres. Seed SQL continues to populate the database, while runtime validation ensures the application only serves valid layouts.

### Backend read model

The backend will add a room metadata service and HTTP routes that return:

- community slug and name
- room slug, name, kind, and `isDefault`
- active layout version
- validated layout payload

Initial endpoints:

- `GET /api/communities/default/rooms`
- `GET /api/rooms/:roomSlug`

Both endpoints will be read-only and require the same session expectations as the existing authenticated app flow. The handlers will use the existing database layer patterns already present for auth and invites.

The list endpoint returns the permanent rooms for the default community. The room detail endpoint returns one room by slug and its active layout. Missing rooms return `404`.

### Frontend integration

The frontend will add a room metadata client boundary on top of the existing API client.

`LobbyView` will:

- load the default community room list on mount
- show loading, error, and success states
- render room name, slug, theme, dimensions, and whether the room is the default room

`RoomView` will:

- load room metadata for the route room slug
- show loading and error states
- render room name, theme, dimensions, layout version, spawn point count, collision count, and teleport labels

The frontend remains read-only. It will not infer movement rules or open realtime connections from this ticket.

## Data Contracts

### Layout payload

```json
{
  "theme": "cozy-lobby",
  "backgroundAsset": "rooms/main-lobby.png",
  "avatarStyleSet": "soft-rounded",
  "objectPack": "lobby-furniture-v1",
  "width": 2400,
  "height": 1600,
  "spawnPoints": [{ "x": 320, "y": 420 }],
  "collision": [{ "x": 520, "y": 360, "w": 220, "h": 90 }],
  "teleports": [{ "label": "Rooftop", "targetRoom": "rooftop" }]
}
```

### Room list item

```json
{
  "slug": "main-lobby",
  "name": "Main Lobby",
  "kind": "permanent",
  "isDefault": true,
  "layoutVersion": 1,
  "layout": {
    "theme": "cozy-lobby",
    "backgroundAsset": "rooms/main-lobby.png",
    "avatarStyleSet": "soft-rounded",
    "objectPack": "lobby-furniture-v1",
    "width": 2400,
    "height": 1600,
    "spawnPoints": [{ "x": 320, "y": 420 }],
    "collision": [{ "x": 520, "y": 360, "w": 220, "h": 90 }],
    "teleports": [{ "label": "Rooftop", "targetRoom": "rooftop" }]
  }
}
```

### Room detail response

```json
{
  "community": {
    "slug": "default-community",
    "name": "Default Community"
  },
  "room": {
    "slug": "main-lobby",
    "name": "Main Lobby",
    "kind": "permanent",
    "isDefault": true,
    "layoutVersion": 1,
    "layout": {
      "theme": "cozy-lobby",
      "backgroundAsset": "rooms/main-lobby.png",
      "avatarStyleSet": "soft-rounded",
      "objectPack": "lobby-furniture-v1",
      "width": 2400,
      "height": 1600,
      "spawnPoints": [{ "x": 320, "y": 420 }],
      "collision": [{ "x": 520, "y": 360, "w": 220, "h": 90 }],
      "teleports": [{ "label": "Rooftop", "targetRoom": "rooftop" }]
    }
  }
}
```

## Error Handling

- invalid stored layout data returns a server error and is logged with the room slug and validation reason
- unknown room slug returns `404`
- frontend room metadata failures show user-facing fallback text and keep the shell responsive
- list and detail loading should fail independently so a bad room detail request does not break the lobby route

## Testing Plan

Backend tests:

- layout validator accepts valid seeded layouts
- layout validator rejects out-of-bounds spawn points
- layout validator rejects out-of-bounds collision rectangles
- layout validator rejects teleports pointing to unknown room slugs
- room route tests cover list success, detail success, and missing room `404`

Frontend tests:

- lobby view renders loading, error, and loaded room list states
- room view renders loading, error, and loaded room metadata states

## Implementation Order

1. add failing backend tests for layout validation and room routes
2. implement the room layout validator and room metadata query/service layer
3. add failing frontend tests for lobby and room metadata loading
4. implement the frontend room metadata API client and views
5. update the SL-007 vault note after verification
