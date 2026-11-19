# Viewer groups

Viewer groups are a small Channels-owned continuity primitive. They are not a
second public-audience system: programs still own their stage and interactions,
and every viewer of a program shares that program's public chat.

## Model

Central migrations `0012` and `0013` create the group, membership, private
conversation, and program-scoped public-conversation records.

- Every group owner and member is an active `users` row. Anonymous viewers may
  watch a public group link and read public chat, but cannot join a group or
  read its private thread.
- A group points to exactly one station or one program. Station tuning resolves
  the current slot; between shows it resolves the next slot so viewers see that
  program's real off-air lobby and schedule instead of a blank group page.
- The group has one monotonically increasing `revision`. Only the owner can
  retune it through the station/program picker, and stale writes are rejected.
- There is no drift state, consensus protocol, group tier, or duplicate group
  ballot system. Members move together; a member who wants to browse
  independently leaves the group. The owner ends the group rather than leaving
  an ownerless record.

`/g/<watch-code>` keeps the group shell and chat mounted while its
`ChannelAppRoom` swaps to the newly resolved program. `/embed/g/<watch-code>`
uses the same tuning snapshot, starts muted, and selects the first available
program caption track.

## Watch access and membership

The watch code is intentionally public. It appears in Player Card metadata and
may be posted to a large X Space audience. It reveals only public tuning,
program catalog data, group name, and an aggregate active-member count.

Membership uses a separate random secret in the URL fragment:

```text
https://channels.example/g/<watch-code>#invite=<membership-secret>
```

Fragments are not sent in HTTP requests or Player Card metadata. A signed-in
viewer explicitly joins with that secret. The owner can rotate it, revoke a
member, or end the group. Copy group link and Share to X remain nested under
the room's **Invite** control; the membership link is a separate owner action.

## Tuning delivery

`GET /api/groups/<code>/tuning` is a cacheable one-second public snapshot. The
client refreshes close to a known slot boundary and otherwise polls with small
jitter. This deliberately avoids a long-lived group socket for every public X
viewer: CDN caching collapses a large watch party to a bounded origin read rate,
while `revision` fences out stale owner changes.

The snapshot contains only:

```ts
{
  revision: number
  name: string
  memberCount: number
  stationId?: string
  programId?: string
  slug?: string
  slotId?: string
  boundary?: string
  nextSession?: string
  channel?: PublicProgramRoom
}
```

No member roster, invite secret, email address, or private message is cacheable.

## Chat

Public chat is scoped to the active program, not to a station and not globally
across unrelated programs. These surfaces use the same durable program thread:

1. the standalone program app;
2. the full Channels program room;
3. the active feed preview, read-only and bounded;
4. the X Player Card, including a card opened from an X Space.

Group chat is private and group-scoped, so it remains mounted when the group
moves to another program or station. Only authenticated members see the
**Group / Public** selector. Public viewers see only the active program's public
conversation. Program bundles that export `supportsShellChat = true` suppress
their own chat window in a group room so the shell renders exactly one window.

Public adapters read and write
`/api/programs/<program-id>/chat`. `CHANNELS_CHAT_SERVICE_TOKEN` authenticates
server-to-server writes from a standalone program, but never authorizes group
chat. The feed never posts.

## X Spaces

Channels does not embed X Space audio and does not require the X developer API.
The creator starts a Space in X, posts the public group watch link, then uses
X's own **Share to Space** and pin controls. The post's Player Card points to
`/embed/g/<watch-code>`, which keeps resolving the group's current program as
the station changes. X remains responsible for audio, speakers, and listeners.

Inline Player Card playback and uninterrupted Space audio vary by X client and
must pass the desktop, iOS, and Android staging matrix before a launch claim is
made. See [X Player Cards](./X-PLAYER-CARD.md).
