# Feature Specification: Комната — первый функциональный диалог

**Feature Branch**: `codex/scene-room-dialogue`
**Created**: 2026-07-21
**Status**: Implementation — deliberately plain Telegram Mini App UI
**Scope**: First persistent room dialogue in `/tg`: messages, permitted character voices, and a DM/environment voice.

## Product decision

The player-facing surface is a room-based FRPG. A room is a shared dialogue, not an action-choice page. The visual-novel scene mock remains a review artifact, but this increment deliberately prioritises a usable text flow over its presentation: a standard screen has a message list, a role select, a textarea, and a send button.

## Stories

### P1 — participant reads and writes in an active room

A campaign member opens the `Сцена` tab in Telegram, reads messages in order, selects one of the room's permitted characters, and sends a persistent message as that character.

**Independent test**: Send a message from one Telegram session and verify that it is stored, attributed to the selected character, and appears in another member's open scene through campaign Realtime refresh.

### P2 — participant writes the world during the test

A campaign member can choose `ДМ / окружение` instead of a character and optionally mark the message as an environment description. This is an explicit test-release permission; a follow-up spec will introduce the DM-only authorization boundary.

**Independent test**: Any campaign member can send both speech and description messages with the DM/environment voice.

### P3 — participant opens the first room

When no active room exists, any campaign member can open `Общая сцена`. Creation adds the campaign's current character nodes as the initial permitted speaker pool.

**Independent test**: A campaign member opens the room and can send as a current character or as the environment.

## Functional requirements

- **FR-001**: The Mini App MUST have a `Сцена` tab with an ordered persistent dialogue feed and a local composer.
- **FR-002**: A room MUST belong to one campaign and have at most one active room per campaign in this increment.
- **FR-003**: A permitted character voice MUST be an explicit room-to-character relation. A server action MUST verify it before inserting a character message.
- **FR-004**: The DM/environment voice MUST not be represented by a fake character node. In this test release it is available to every campaign member; later it MUST gain an explicit DM-only grant.
- **FR-005**: Each message MUST persist its author, selected voice, content, message kind (`speech` or `description`), and creation time.
- **FR-006**: Every exported server action MUST authenticate, check campaign membership, derive campaign scope from the room, and validate all referenced IDs before writing through the admin client.
- **FR-007**: Inserting a message MUST broadcast a compact private campaign event; receivers re-read through existing RLS-scoped queries. Failure of realtime delivery must not prevent message persistence.
- **FR-008**: The first room UI MAY use ordinary selects, textarea and buttons. It MUST NOT require the visual-novel layout, portrait cutouts, map, timeline, typing presence, or custom rich-text editor to write a dialogue.

## Explicitly out of scope

- Room list/history, closing/switching rooms, editing/deleting messages, DM management UI for the speaker pool, and user-specific speaker grants.
- Backgrounds, cutouts, appearances, emotions, media-library UI, and new media generation.
- Map movement, timeline movement, RPG rules, action branching, and presence.
- Bot API Rich Messages (separate draft spec 068).
- Generic chat, generic room, or generic asset-usage abstractions.

## Model

```
campaign ──< scene_rooms (one active) ──< scene_messages
                       │
                       └──< scene_room_speakers >── nodes(character)
```

`speaker_kind='dm'` is authorised by campaign membership and deliberately has no `character_node_id`. Character messages can only point at the explicit speaker-pool relation.
