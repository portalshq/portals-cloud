# Channels Broadcast

Channels is the public broadcast context: creators publish executable programs, stations curate those programs over time, and viewers enter rooms or move together in authenticated groups.

## Topology

**Channel**:
A creator profile and commercial owner, represented by a central `tenants` row. One channel can own many programs.
_Avoid_: Program, station, room

**Program**:
An executable bundled experience owned by one channel. A program has one immutable public slug and can be scheduled by many stations.
_Avoid_: Channel, station

**Program slug**:
The canonical public identifier for a program room, bundle, and audience proxy, such as `bears`.
_Avoid_: Channel ID, station ID

**Station**:
A curated, single-stream venue that schedules programs in non-overlapping slots.
_Avoid_: Channel, creator, program

**Slot**:
A half-open station window, `[starts_at, ends_at)`, in which one program airs.
_Avoid_: Channel, room

**Room**:
The viewer-facing program experience at `/<program-slug>`, including its live stage or off-air lobby.
_Avoid_: Channel, station

## Audience

**Preview**:
A read-only mode of the program room that retains the stage, backdrop, off-air schedule, and a bounded public-chat tail while suppressing audience writes.
_Avoid_: Separate player, demo room

**Public chat**:
The durable conversation for one program, shared by its standalone app, Channels room, feed preview, and X Player Card.
_Avoid_: Global chat, station chat

**Viewer group**:
An authenticated set of users that follows one station or one directly selected program and retains its private conversation while tuning changes.
_Avoid_: Anonymous squad, public audience

**Watch link**:
A public `/g/<code>` link that follows group tuning without granting membership or private-chat access.
_Avoid_: Invite link

**Membership link**:
A revocable link carrying its secret in the URL fragment; a signed-in viewer must use it to join a group.
_Avoid_: Watch link

**X Space watch party**:
An X Space that keeps X as its audio host while a post containing the Channels group Player Card is shared or pinned into the Space.
_Avoid_: Embedded X Space, X audio integration
