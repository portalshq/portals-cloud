# Channel content by page

```mermaid
flowchart TB
    Catalog["Shared channel catalog<br/>Central schedule and program data + mock channels"]

    Catalog --> Feed["/ · Scroll feed"]
    Catalog --> Browse["/channels · Browse"]
    Catalog --> Room["/[slug] · Channel room"]

    Feed --> FeedContent["Active panel<br/>Muted HLS or demo video when available<br/>Animated backdrop or poster as fallback"]
    Browse --> BrowseContent["Searchable card grid<br/>One visible card animates its backdrop<br/>Other cards use their configured poster"]
    Room --> Bears["/bears · Full Bears watch app<br/>Forest canvas + HLS, demo video, or Reactor<br/>Chat, sound, and audience interactions"]
    Room --> Other["Other channel rooms<br/>Registered watch bundle or channel details and an HLS stage"]

    FeedContent --> PreviewStatus["Shared preview status<br/>Off air when the app reports no playback<br/>Unavailable when the preview request fails"]
    BrowseContent --> PreviewStatus
    Bears --> Lobby["Off-air lobby<br/>Next episode and email reminder form if scheduled"]
```

## What renders where

| Page | Media and controls |
| --- | --- |
| `/` | One feed panel owns playback at a time. It plays HLS or a looping progressive video. The feed starts muted, and the rail sound setting follows the active panel as viewers scroll. When no preview video is available, a configured backdrop can animate on the active panel. Inactive panels use their configured poster. |
| `/channels` | The browse grid uses the same preview component with video playback disabled. It animates one visible backdrop at a time, prioritizing the hovered or focused card. The featured banner has its own layout. |
| `/bears` | The Channels shell mounts the Bears watch bundle on entry. Bears supplies the stage, chat, and audience interactions. The rail handles sound and the account dialog. The embedded Bears header stays in the layout while hidden. Back uses same-origin history when available and otherwise opens the matching feed panel. Its off-air lobby can show the next episode and email reminder form. Leaving the room unmounts the watch app. |
| Other `/[slug]` pages | Channels renders the channel details and an HLS player when a stream is configured. |

## App previews and playback

[Register a channel app](./CHANNEL-APPS.md) to give another channel the same room and preview integration.

- The catalog merges central schedule bindings and mock channels by slug. Bears contributes a preview endpoint, poster, and backdrop module when its backend is configured. [Catalog implementation](../lib/catalog.ts)
- An active Bears preview refreshes every 15 seconds through `/api/channels/bears/preview`. The endpoint uses Bears’ `/api/channel` response to resolve playback and the next start time. The browser loads playable media from the returned URL. [Preview implementation](../components/channels/ChannelPreview.tsx)
- Dry run supplies a progressive demo video even between episodes. A Reactor-only channel can be live while its feed panel shows the backdrop. Reactor playback is available inside the room.
- A successful response with no playback shows “Bears is off-air right now.” A failed preview request shows “Bears is unavailable right now.” The reminder form appears only in the Bears room when an upcoming episode is available.
- The backdrop entry reuses the Bears forest renderer and scene clock. Channels mounts it independently of the watch bundle, so previewing a card opens no chat, interaction, or Reactor sessions. [Bears integration](./BEARS.md)

## Follows and reminders

Every Follow button — feed panels, the featured banner, channel details, and the room rail — reads one shared client store, so follow state is consistent everywhere a program appears. [Store implementation](../lib/follows.ts)

- Signed-in viewers persist follows to central `program_follows` through `/api/follows`. The store hydrates from the server once and broadcasts updates to all mounted buttons. Writes commit only after the server confirms — a pending, failed, or superseded request never moves a button to "Following" — and a hydration whose snapshot predates a confirmed write is discarded for a fresh one. Writes for the same program serialize, so the last click is the state that sticks.
- Guests follow anonymously: state persists in `localStorage` (`channels:follows`) with no sign-in prompt. On the next authenticated load the store POSTs each stored program to `/api/follows` and removes it locally after success or a permanent rejection (for example a deleted program), so retryable failures transfer on the following visit and dead entries do not linger.
- Clicking Follow opens the reminders form that completes the process — nothing is written until it is submitted, and closing without submitting cancels the follow so the button stays unfollowed. `POST /api/notifications/subscriptions` with `ensureFollow` writes the follow row and the reminder preference in one transaction for verified recipients. Guests submit an email; their follow persists locally and reminders activate through the verification link. Signed-in viewers whose address still needs verifying commit nothing until `claimVerifiedEmail` writes the subscription and `program_follows` together; `claimVerifiedEmail` also associates the recipient with their account when they sign up.
- Channels without a bound `programId` keep the local chip behaviour — no persistence, no reminder prompt.
