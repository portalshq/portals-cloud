# DESIGN.md — channels

Single source of truth for the design system. If the CSS or components drift
from this file, this file wins. Applies to **all three routes**: the feed at
`/`, the browse index at `/channels`, and the channel room at `/[slug]`.

## Discovery

- **Artifact:** feed-first discovery surface for a network of independent
  channels, each one its own room. A filterable index sits behind it at
  `/channels`; each room has a detail page.
- **Positioning:** consumer-facing. Friendly, not technical. The reader is
  browsing, not evaluating.
- **Primary action:** enter a channel.
- **Adjectives:** nocturnal, soft, buoyant, friendly, unhurried.
- **Aesthetic:** *nocturnal soft-object in a refracted atmosphere.* A warm
  green-black ground, one coral interface accent, and a subdued full-spectrum
  light field behind the product. Elevation is expressed as light rather than
  as a line.
- **Signature move:** **the lit object.** The one hero surface per view is a
  soft-edged object floating in a dark room, its silhouette defined by a
  lightness step off the ground plus a tight neutral bloom at its edge. Behind
  it, spectral ribbons cross real perspective depth like light leaking through
  a prism. Because elevation is light, the interface needs no hairlines at all.

### Rules that are not negotiable

- **No uppercase text anywhere**, and no eyebrow or kicker labels. Status is
  sentence case, always paired with a word, never colour alone.
- **No border lines anywhere.** Separation comes from lightness steps
  (`--color-surface`, `--color-surface-2`), type, and space.
- **One interface accent colour only.** `--color-warning` and `--color-error`
  are functional signals and appear only on real warning and error states. The
  decorative WebGL atmosphere is environmental light, not an interface accent:
  it never communicates status, selection, or affordance, and it stays behind
  all content at `z-index: 0`.
- **The accent marks actions.** `--color-accent` appears only on
  interactive elements and live interaction states: primary buttons and their
  hover, `aria-pressed` toggles, the active filter pill, link hovers, the
  profile hover, and the focus ring. Icons, live pills, monograms, the episode
  numeral, the brand mark, the progress readout, the glow, and the scrollbar are
  all neutral. Status still reads as status because the word is always present.
- Group hover selectors in one `@media (hover: hover)` block per stylesheet.
  Keep keyboard focus and pressed states available on every input type.
- **Forbidden copy.** The words *portals*, *AI*, *application*, *living*, and
  *infrastructure* do not appear in any user-facing string. *Living* is written
  as *live*. A CI grep for these belongs on this directory.

## Typography

| Role | Face | Source |
| --- | --- | --- |
| Display | DieGroteskC | `frontend/public/fonts` |
| Body / UI | DieGroteskB | `frontend/public/fonts` |

The shared font declarations load the frontend's local font files. The default
family is DieGroteskB; headings use DieGroteskC.

- **Four font classes only:** `fontH1` is 500/display/h1 with heading tracking;
  `fontH2` is 500/display/h2 with heading tracking; `fontNormal` is
  400/default/normal; and `fontMicro` is 400/default/micro. Classes use the
  `font` shorthand. H1 stays clamped; h2 becomes normal and normal becomes
  micro at 640px and below. Micro stays fixed.
- Display heading tracking follows the frontend display style, from `0.22px` to `0.57px` across the viewport.
- Public app text uses opaque white as its base color, including supporting copy, thumbnail monograms, and numerals. Functional control and error colors remain opaque.
- Both heading sizes use weight 500. Normal and micro text use weight 400.
- Body copy and interactive labels use the normal size.

## Color

The public interface uses low-chroma dark surfaces and a coral accent for
interactive states. The accent is `#F06C49`, with `#F58C70` on hover and
`#24110c` text on filled controls. Supporting and primary text use opaque white.
Functional warning and error colors remain distinct.

### Environmental chromatic field

The fixed Three.js background frames a one-sheet hyperboloid receding through
the midground along Z. The camera grazes the near rim from the right and below.
The near flare crops along the left and bottom edges, and the waist sits in the
upper-right third. Broad ribbons follow curved meridians at a fixed
angle around the axis, gathering at the waist and flaring toward the ends. Bright
white streaks ride inside softer blue and coral light leaks. Shifting coral and
peach light fills the interior in world space, with the strongest glow at the
waist. The surface rotates around Z about once every 17 minutes.

The canvas fades in only after its first completed render. A static CSS
atmosphere sits underneath for initialization failure and WebGL context loss.
A dark vignette and the existing opaque media/control surfaces preserve text
contrast. The background has `pointer-events: none` and `aria-hidden="true"`;
the application content occupies `z-index: 1`, while the existing rail stays
above it. No route copy or metadata changes with the scene.

## Spacing, radius, shadow

- **Spacing:** 4px base, `--space-1` … `--space-10`. Tight inside a group
  (`--space-5` in the panel stack), generous between regions (`--space-8` in
  the rail, `--space-10` between the header block and the player region).
  `--space-14` was retired with the room's old section rhythm and is no longer
  part of the scale.
- **Text inset:** uncontained text groups use `--text-inset` inline padding.
  Their media or control containers use a matching negative inline margin when
  they need to retain the surrounding section's full width.
- **Radius — exactly two values.** `--radius: 16px` for media surfaces and
  cards (at the ceiling, not past it — 24px+ is blob-rounding) and
  `--radius-pill: 999px` for controls.
- **Shadow — exactly one approach.** `--glow-card`, a tight, dim neutral bloom,
  applied to **one hero object per view** and nothing else:
  `0 14px 34px -20px oklch(0.96 0.01 140 / 0.1)`. Repeating it across a card
  grid turns a signature into fog, so the grid cards get a plain surface step
  instead. No element has both a hairline and a shadow, because no element has
  a hairline.

## Motion

- **One duration for the whole product: `--duration: 120ms`.** Fast, physical,
  never showy. The drawer wipe at 120ms still reads as a drawer.
- `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for everything except the
  drawer, which uses `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`.
- Only `transform`, `opacity`, and `clip-path` are animated. Never `width`,
  `height`, `top`, `left`, or `box-shadow`.
- Buttons and links scale from the bottom edge when pressed. The scale is
  `0.97` on desktop and `0.94` at 640px and below.
- The feed progress bar is `transform: scaleY()` driven by scroll, with a 90ms
  linear transition because it is a continuous read, not a state change.
- `prefers-reduced-motion: reduce` collapses `--duration` to 1ms and drops the
  `:active` press scale. User-initiated direct feedback is retained; ambient
  motion is not.
- **Ambient scene motion is a separate clock.** Light sweeps advance along Z on
  the curved meridians of the hyperboloid and fade at the depth boundaries.
  Frame deltas clamp at 50ms so tab switches and main-thread stalls cannot jump
  the scene forward. Pointer and nested-feed scroll values move the perspective
  camera with exponential damping. The foreground shifts more than distant rays.
- **The ambient scene freezes under reduced motion.** It renders one composed
  frame and does not schedule an animation loop until the preference changes.
  Hidden tabs stop the loop; returning resets the previous timestamp so elapsed
  hidden time is discarded. Context loss also stops rendering until restoration.

## Scrollbars

`--scrollbar-size: 14px`, of which 2px on each side is the transparent gutter,
leaving a 10px grabbable thumb — `oklch(0.7 0.01 150 / 0.35)`, neutral, floating
in a transparent track via `border: 2px solid transparent` +
`background-clip: content-box`, with `scrollbar-color` set for Firefox and
`oklch(0.8 0.01 150 / 0.5)` on hover.

The thumb is **hidden on the feed and the channel room**, and only there. Both
were showing a scrollbar flush against the player, where it read as part of the
player rather than as a page affordance. The feed already carries its own
position readout as the progress rail, and a channel room's only scroll is past
the player. The browse index keeps its scrollbar, because there the scroll *is*
the page and hiding it would remove the only cue that more exists.

`scrollbar-gutter: stable` is set app-wide so laying out on a page that does
scroll never shifts content sideways — but **not** on the two player
containers. Those are `overflow: hidden`, which makes them scroll containers, so
the blanket gutter reserved an 11px strip *inside* the frame and the video
rendered 11px narrower than its box (835 in a 846 box, 689 in a 700 box). They
never scroll, so they carry `scrollbar-gutter: auto` and the video fills its
box exactly. This is the one place the blanket rule has to be overridden, and it
is worth stating as a rule rather than a fix: **the gutter is for scrollers, and
`overflow: hidden` on a non-scrolling box makes a box that is not one.**

## Craft layer

- **The chromatic background** lives in `components/background/` and mounts once
  in `app/layout.tsx`. The React wrapper dynamically imports the engine, so the
  Three.js bundle does not block the initial route module. The engine owns its
  renderer, two shader scenes, instanced ray geometry, browser listeners, and
  disposal. The atmosphere and all 192 ribbons render in two draw calls. Pixel
  ratio caps at 1.5. The scene loads no external assets. Tests drive the renderer
  through a narrow adapter and cover the math, parallax, reduced motion,
  visibility, context recovery, resize fallbacks, and resource cleanup above
  the 95% line-coverage gate.
- **The rail** is a shared component (`components/shell/Rail.tsx`) used by all
  three routes. A fixed 264px rail that wipes open to a 76px strip via
  `clip-path: inset()`, never a width animation. Labels sit in the clipped
  region at `opacity: 0` and fade in on open, so the wipe never slices visible
  text; page-specific drawer items opt in with `data-rail-label`.
  `:focus-within` opens it, which gives keyboard parity for free.
  Under 640px it becomes a bottom bar so it stops consuming 28% of a phone
  screen.
- **Nav highlight.** The rail reads the live pathname. `/` matches exactly and
  gets `aria-current="page"`; every other path belongs to browse, which gets
  `aria-current="true"`, so a channel room keeps browse lit rather than
  dropping the highlight. Both values take the same treatment: a
  `--color-surface-2` pill, the icon in the same ink as every other icon, and a
  heavier label. The current route is never signalled by a coloured glyph — see
  *Iconography* — so the pill and the weight carry it.
- **The brand is a caption, not a mark.** The rail has no logo dot. The name
  `channels` is set small and quiet beneath the profile chip at the foot, as a
  caption rather than a lockup, and it is dropped entirely from the mobile
  bottom bar. The rail opens on the navigation.
- **Rail reservation: the feed and the room reserve the collapsed width.** Both
  centre their column, so neither puts content under the 264px drawer.
  `/channels` reserves the **expanded** width instead, because it is
  left-aligned and a narrower reservation let the open drawer cover the
  heading, the filter row, and the Follow button. The room originally reserved
  the expanded width too; once it was centred that reservation became dead
  space, so it now matches the feed.
- **Feed.** The scroller is `100dvh` with `scroll-snap-type: y mandatory`; each
  panel is `100dvh` with `scroll-snap-stop: always`. Panel content is one
  column, left-aligned at every level, centred as a group and capped at
  **700px** so a large display does not strand the player in a void.
- **The player takes the leftover height.** The column is a full-height flex
  stack: the text blocks are `flex: 0 0 auto` and a `.videoFrame` takes the rest
  with `flex: 1 1 auto; min-height: 0`. Below 641px the frame *is* the player —
  the video fills it and the 16:9 ratio is dropped, so `object-fit: cover`
  crops rather than letterboxes. Above 641px the frame is a grid, which lets
  the video's `height: 100%` resolve against a definite grid area so
  `aspect-ratio: 16 / 9` can derive the width from that height, with
  `justify-self: start` so the player shares the text's left edge.
  **On desktop the 700px measure is now the binding constraint, not the
  height:** the frame is 700px wide and 523px tall, so a height-derived width
  of 930px is cut off by `max-width: 100%` and the box lands at **1.34**, not
  1.78, at every width from 900 to 1920. `object-fit: cover` crops the sides.
  That is the intended trade — the measure holds and the picture is cropped,
  rather than the column growing past its measure — but it is a real change
  from the 1.78 this line used to claim, and it is measured, not assumed. At
  390px the ratio is 0.8.
- **Landscape tablets.** Landscape viewports from 641px through 1400px with
  a coarse primary pointer use a full-bleed feed player. Each panel still
  snaps at one dynamic viewport height. The top navigation clears the device
  safe area. Metadata and playback notices sit below it. The title,
  description, and actions sit along the bottom over a short contrast
  gradient. Secondary actions use 44px icon targets and the entry link
  keeps its label. Browse and room content clear the top navigation.
- **Streaming: visibility, not scroll arithmetic.** Exactly one panel holds a
  `VideoDeliveryPlayer` at a time; every other panel renders an inert box of the
  same size, so nothing shifts when a stream arrives. Which panel is live comes
  from `useOnScreen` (`components/channels/use-on-screen.ts`), one
  `IntersectionObserver` per panel, shared by the feed and the room.
  - It tests `intersectionRatio`, **not** `isIntersecting`. A full-height panel
    whose edge merely touches the viewport boundary is "intersecting" with zero
    visible pixels, which is enough to start a second stream downloading beside
    the one being watched. The default threshold is `0.5`.
  - `visible` is live; `seen` latches on first sight and never flips back. That
    is what lets a stream mount once and stay mounted.
  - The previous implementation derived the live panel as
    `round(scrollTop / clientHeight)`. That is not visibility — it read panel
    geometry on every scroll event, and it mis-predicted a panel that was on
    screen. The scroll listener survives for the progress rail alone, with
    panel geometry cached and events collapsed into one `requestAnimationFrame`,
    so it no longer gates playback.
- **Player states.** `loading`, `playing`, `buffering`, `reconnecting`, and
  `error` each render a sentence-case status line on an **opaque**
  `--color-bg` bar, so status text keeps its contrast over arbitrary video
  content. The bar is `role="status"` and is dropped once the stream is
  `playing`, so a settled player shows nothing at all. The package's held-frame
  capture handles the buffering freeze. The failure state rides on the note's
  own `data-state`, not on a wrapper, so neither surface has to wrap the player
  just to colour it.
- **Reconnect is for losing the stream, not for a hiccup.** The controller used
  to treat the media element's `stalled` event as a failure. Chrome fires
  `stalled` every few seconds on a perfectly healthy MSE-backed HLS stream —
  `readyState` intact, no error, `currentTime` still climbing — so the controller
  tore hls.js down and reloaded from zero on a loop, pinning the UI in
  `reconnecting` and restarting the video every few seconds. `onstalled` is now
  left unbound. A real outage still surfaces as `waiting` (underrun) or a fatal
  hls.js `NETWORK_ERROR`, and both are still handled.
- **Off-air panels preview the program room.** The active feed panel mounts
  the same program stage/lobby in read-only preview mode, so its title,
  backdrop, off-air line, and next-session information remain program-owned.
  Preview removes reminder forms, votes, reactions, chat input, and other
  write actions; Channels adds at most three recent public messages over the
  stage. A legacy bundle receives the poster/schedule fallback, never an
  unrestricted full-room mount. Only the active panel runs media and chat
  polling. Browse entries and room links always use `/<program-slug>`, which
  serves the full program room with a 200 response before, during, and after
  air.
- **Channel room.** The page *is* the channel, so there is no gate: no "enter
  the room" button, no `aria-pressed` toggle, and no primary action anywhere on
  this route. The stage is a presence surface, not an entry point, and it
  carries the same live stream as the feed — the room was showing a monogram
  where a player belonged.
  - It **plays on first sight and pauses when the reader scrolls away**, rather
    than unmounting. The latched `seen` from `useOnScreen` means the stream is
    created exactly once per room visit, so scrolling past it and back resumes
    the same stream and the same position. That is the promise the room's copy
    makes — *nothing resets while you are away* — and remounting would break it
    by dropping the stream back to the top.
  - The column is **centred** at its own 1000px cap, not the feed's 700px: a
    700px measure would squeeze a 16:9 stage. It shares the feed's padding
    exactly — `--space-10` block, `--space-6` inline, `--rail-collapsed` plus
    `--space-6` on the inline start, plus the scrollbar gutter on the inline end
    — so the two read as one rhythm.
  - The header and the player are **one block**: status, title, identity line and
    stage are separated by `--space-4`, not the section rhythm, and the byline
    the player used to sit under is now the shared identity line. The
    "Everyone is welcome mid-story" section was removed; the room is the title,
    the player, and the description.
  - There is no persistent stage caption. "Broadcasting right now" and the
    schedule line lived here once and are gone — the identity line's blurb
    already says whether the channel is live, and a second copy of it on the
    player was the same fact twice.
  - The fake running timecode from an earlier pass was removed: a clock that
    does not tick is the same tell as a status dot that does not change.
- **Index.** Hero with the scoped counts, one featured channel on the full
  stage, then a tool row and a card grid. The tool row is a right-aligned
  horizontal grid above the cards: four filters (Live now, Play, Stories,
  Learning) as 44px icon squares with their labels set underneath, then search
  last. There is no "All" filter — a filter is either on or off, and clicking
  an active one clears it. An active filter swaps its category icon for `X`
  and takes the accent, so the state is legible without relying on the icon
  alone. **Search is compressed to a single icon button** that expands into a
  248px field when focused, keeps its "Search" label underneath so the row
  never changes height, and turns into `X` once it holds a value. Clicking
  the icon again closes the field and clears any query. The
  expand/collapse is a hard swap with an opacity fade rather than a width
  animation. Tracks size to their content so the fixed-width tool cells stay
  in a column while search is free to grow. Both the filter state and the
  hero counts describe the current scope, so the counts move as you filter.
- **Components.** Buttons are ranked by importance: one primary (coral filled),
  secondaries are `--color-surface-2`. Focus is a
  two-tone `box-shadow` ring (`0 0 0 2px bg, 0 0 0 4px accent`) so it works on
  both grounds and follows the pill radius.
- **One identity line, shared.** A channel is identified by a single line —
  **owner · sparkles+tag · blurb** — rendered by `ChannelMeta` and used
  identically by the feed and the room, so the two cannot drift:
  `Massively Social · ✦Always on · •Live now`. The owner is `--color-fg` at
  `--text-base`; the sparkles+tag is `--text-xs` and the blurb `--text-sm`, both
  `--color-muted`. The blurb reads `Live now` when the channel is live and the
  viewers line otherwise, so it is never an empty slot.
  This replaced two stacked rows — a status line above the title and a byline
  below it — which spent a whole line saying the same thing twice, and put the
  live state *above* the title it belonged under.
  - **The status dot is gone.** It marked nothing the word beside it did not
    already say, and at 8px it was the only 8px thing on the line. Status is
    never colour alone; with no colour, the word is the whole signal.
  - The blurb is `--color-fg`, not muted: it is the answer to "is this one
    live", which is the question the line exists to answer.
- **Follow reads as a badge, not a repaint.** The bell sits inside a 26px
  circular chip and stays the same glyph in both states: the chip turning
  accent and the word changing to "Following" are the whole signal. Swapping
  the icon as well would be a third cue saying the same thing. The word stays
  in normal ink outside the accent, and its weight never changes. The bell is one
  of only two filled icons, so in the pressed state it is a solid bell on the
  coral chip and the label swap carries the rest.
- **No label ever changes a control's width.** "Follow"/"Following" and
  "Share"/"Link copied" sit in fixed-width buttons (142px and 150px), sized to
  the longest string each shows, so no state change can reflow the row. The
  share button also reports success honestly: the clipboard rejects in a
  non-secure context, so "Link copied" only appears once the write resolves.
- **Iconography.** lucide-react at one grid (24), one stroke (`strokeWidth`
  1.75), one radius (round caps, matching `--radius-pill`).
  - **One ink for every icon.** A single app-wide rule puts all icons in
    `--color-fg`. The set read as two families while that was true, because
    `--color-muted` icons sat next to `--color-fg` ones at the same weight; four
    rules that overrode it had to go, including the accent on the current nav
    icon and on the featured card's arrow.
  - **Outline is the default; fill is opt-in.** `fill` is applied by a
    `.lucide.filled` class, not globally, so an icon added later arrives
    outlined instead of accidentally solid. Exactly two icons are filled: the
    **bell** and the **sparkles**. Share, the up-arrow, the heart, home, browse,
    the four filter icons, and search are all outlined. A filled glyph next to a
    14px label reads heavier than the label, and filling 44 icons at once made
    every control look stamped.
  - Share is lucide's `CornerUpRight`, the curved arrow. `Share2` was wrong
    twice over: filled, its three nodes read as a graph with no arrowhead at
    16px, so it did not read as *send it on*; and `Share` is the
    arrow-out-of-a-bowl, not the curved arrow. (`ShareArrow` is not a real
    lucide icon — absent from every published version, including 1.48.0.)
  - The rail's profile chevron is gone, so no icon is hand-inlined any more.
  - Every icon-only control carries an accessible name.
- **Imagery.** There are no thumbnail assets. Media surfaces carry a
  **typographic monogram** — the channel's initial in Bricolage at reduced
  green opacity — and the featured card carries its episode numeral. This is a
  deliberate placeholder device, not stock art, and it should be replaced by
  real stills when they exist.
- **Accessibility.** WCAG 2.2 AA. 44px minimum targets. Feed panels are
  `<section>`s labelled by their channel name, so tabbing moves panel to panel
  and the browser scrolls each into view. Status is never colour alone — the
  status word is always present, and no icon carries a state in colour. No
  uppercase, which also removes all-caps legibility risk.

## Content

All channel copy, the browse lede, and the stream constant live in
`components/channels/data.ts`. One file, so the forbidden-word rule is
enforceable in one place and the feed and the index can never disagree.

`PLACEHOLDER_STREAM` points at a public HLS test asset so the player is
genuinely live out of the box. **Replace the per-channel `stream` field with
real manifests before this ships.** Nothing else changes when they arrive.

A placeholder source **must serve its segments as a real media type**
(`video/MP2T`, `video/mp4`). The `test-streams.mux.dev` assets answer
`application/octet-stream`, which Chrome treats as an opaque response and blocks
the moment a session is torn down and rebuilt — which the feed does on every
panel change. The replacement session then loads a fragment, reports `playing`,
and never advances past 0:00, with `readyState` 4 and minutes of seekable
buffer behind it. A manual `play()` does not revive it. That is why
`PLACEHOLDER_STREAM` is a `video/MP2T` source.

`BUNNY_STREAM` is the long-standing Mux Big Buck Bunny asset, and three channels
still use it for variety. It is safe on a **channel page**, where the stream is
created once and never rebuilt, and it is **not** safe in the feed: it tolerates
about one teardown and then wedges, after which every later bunny session in
that page is born frozen. This is measured, not assumed, and the comment on the
constant records it. Point those three at `PLACEHOLDER_STREAM` if the
freeze-on-second-revisit is not worth the variety.

## Slop audit

Scored against `references/slop-checklist.md` on a production build at 1440×900
and 390×844, with screenshots of all three routes.

**Artifact fit:** pass, checked in-browser rather than from source.

**Colour:** pass. Coral accent distinguishes interactive elements. No
gradient text, no cream ground, no even multi-hue spread. The glow was caught
twice: first as too wide (a spotlight haze, a named tell), then as applied to
every grid card (fog). It is now one hero object per view at reduced alpha.

**Typography:** pass. Frontend display and body faces use the existing Channels type scale.
Ratio stated. No eyebrow, no pill chip above a headline, no full-sentence
display headline — "Pick a room." is three words.

**Layout:** pass. Rendered-page checks pass: **the expanded drawer was covering
page content on `/channels`** and was caught on screenshot; the rail reservation
now differs by layout. No horizontal overflow on any route
(`scrollWidth` ≤ `clientWidth` at 1440 and 390). No clipping container around a
popover. Two later findings, both fixed and both real: an 11px scrollbar gutter
reserved *inside* each player container, and the feed's player ratio dropping
to 1.34 once the 700px measure became the binding constraint.

**Radius:** pass. 16px on media surfaces, pill on controls, two values.

**Motion:** pass. Transform, opacity, and clip-path only; one 120ms duration;
ease-out for enter; reduced-motion honored.

**Components:** pass. Full state matrix. Loading, buffering, reconnecting, and
error states designed. Visible label on search. No placeholder-as-label.

**Dark mode:** n/a. Dark-only by brief, not inverted. `L 0.16` ground, `L 0.96`
ink — neither pure black nor pure white.

**Accessibility gate:** pass. Focus verified in-browser: a 2px perimeter at 4px
total spread, no layout shift, not clipped by the rail's `clip-path` because
`:focus-within` opens the drawer first. 44px targets measured. No meaning by
colour alone. **Zero console errors in dev and production on all three routes.**

**Build correctness:** pass. All six channel pages prerender via
`generateStaticParams`; unknown slugs 404 through `notFound()`.

### Changelog

- **Uncontained text alignment** — Added a shared inline inset to text-only
  groups in the feed, browse page, channel room, and Bears error state. Player,
  card media, browse controls, and action groups compensate with negative
  margins to preserve their visual alignment.
- **Typography standardization** — Replaced per-component font properties and
  size utilities with the four shared font classes across the public app and
  admin. H2 and normal step down one size on mobile; h1 remains clamped and
  micro remains static.
- **Mobile feed actions** — Action labels are visually hidden below 641px while
  remaining in the accessibility tree; icon controls retain 44px touch targets.
- **v11** — A fixed Three.js atmosphere sits behind all three routes. Curved
  ribbons trace a one-sheet hyperboloid. White streaks travel through soft blue
  and coral light leaks, and a shifting coral glow fills the waist. The scene
  supports reduced motion, hidden-tab pausing, WebGL context recovery, and a CSS
  fallback.
- **v10** — Playback is driven by visibility, not scroll arithmetic. One
  `useOnScreen` IntersectionObserver shared by the feed and the room, tested on
  `intersectionRatio` so a panel whose edge merely touches the viewport no
  longer starts a second stream; a latched `seen` so a stream mounts once. The
  channel room grew a player where it had a monogram, and pauses rather than
  unmounts when scrolled past, so the stream resumes where it was. The controller
  stopped treating the media element's `stalled` event as a failure, which had
  been tearing a healthy stream down and reloading it from zero every few
  seconds. The feed measure is 700px, the room is centred at 1000px and shares
  the feed's padding, and the header/player gap is `--space-4`. Two stacked
  identity rows became one shared `ChannelMeta` line with the status dot
  removed; the "Everyone is welcome mid-story" section and the "Broadcasting
  right now" caption are gone. The rail lost its "N of M" counter and the
  profile chevron. All icons share one ink, and outline is now the default with
  fill opt-in — only the bell and the sparkles are filled. Share is
  `CornerUpRight`. Player containers set `scrollbar-gutter: auto` after an 11px
  gutter was found reserved inside them, and the scrollbar thumb is hidden on
  the feed and the room. `PLACEHOLDER_STREAM` moved off the mux assets for the
  reasons recorded above.
- **v9** — The follow button keeps the bell in both states; only the chip and
  the word signal the change. Share moved from `Share2` to lucide's `Share`,
  which is the arrow variant — `ShareArrow` is not a real icon in any published
  lucide-react version.
- **v8** — Follow button rebuilt: the icon chip takes the accent and the label
  stays in ink outside it, with a fixed 142px width so the label swap cannot
  reflow the row; the same treatment was applied to Share at 150px. The follow
  and share buttons are now one shared component used by both the feed and the
  room, so the two pages cannot drift. Share now reports "Link copied" only
  after the clipboard write actually resolves. The "Scroll for the next
  channel" cue was removed from the feed.
- **v7** — The feed player now takes the height the text leaves over instead
  of a fixed 560px column. Below 641px it fills the frame and breaks the
  16:9 ratio, cropping via `object-fit: cover`; above 641px it fills the height
  and keeps the ratio, with the width derived from the height. The stack is
  capped at 1100px and the video is start-aligned so the player and the text
  share one left edge. The sidebar logo dot was removed.
- **v6** — Nav highlight fixed: it only matched the exact `/channels` path, so
  the feed had no highlighted item and a channel room lost it too. It now
  derives from the pathname, with `aria-current="page"` for the exact route
  and `"true"` for the browse section. The brand lockup was split — the dot
  leads the rail alone and the name `channels` moved under the profile chip,
  and it is removed from the mobile bottom bar.
- **v5** — Index tools rebuilt. Filters are icon buttons with labels
  underneath in a right-aligned horizontal grid above the cards, with search
  compressed to the last cell and expanding into a field on focus. The "All"
  filter was removed, so filter state is boolean and an active filter swaps to
  `X`. Both bugs found on screenshot: the expanded search was clipped to its
  68px grid track, and the input drew a second focus rectangle inside the
  field. Also fixed a stuck-open search — mousedown blurs the input before the
  clear click lands, so the empty-value close check saw the stale value; `X`
  now dismisses outright.
- **v4** — Accent moved slightly darker and toward forest green:
  `oklch(0.7 0.185 150)` (`#1ebd5b`), a smaller movement than v3 because the
  sRGB ceiling tightens as the hue darkens. Scrollbar widened to a 14px track
  with a 10px thumb. The channel room lost its "enter the room" gate, the
  duplicated status line, and the now-dead `.primary` rules; the page is the
  channel, so the feed keeps the only primary action in the product. The
  room's measure tightened to 760px.
- **v3** — Green reserved for interaction. Accent moved to slime green
  `oklch(0.82 0.255 143)` (`#36eb39`), the sRGB chroma peak. Status dots, live
  pills, monograms, the episode numeral, the brand mark, the progress readout,
  the glow, and the scrollbar all went neutral; only primary buttons, pressed
  toggles, the active filter, nav/link hovers, and the focus ring stay green.
  Scrollbar thumb is neutral. Index heading is now "What's live now" with no
  lede; the search moved below the heading and above every channel as a
  full-width field; both hero counts now describe the current scope rather
  than the whole catalogue. The search focus ring moved from the input to the
  field, which had been drawing a rectangle inside the rounded field.
- **v2** — `/channels` folded into the system. Shared `Rail` and shared channel
  data; both index and room restyled onto the same tokens. Single global
  `--duration: 120ms`. Jade moved to `oklch(0.78 0.203 152)` (`#0fda72`), the
  sRGB ceiling. Transparent-gutter scrollbars. Forbidden-word list adopted and
  a grep added to the audit. "Find your next way in." → "Pick a room."; the
  "network of living things" eyebrow, the "editor's entry point" label, and the
  "independent experiences" footnote were removed. Glow cut to one hero object
  per view. The fake timecode was removed.
- **v1** — Feed-first home established. `/` became the feed, `/channels` became
  the browse index. Nocturnal soft-object aesthetic, jade-only accent, no
  hairlines, no uppercase. Signature move: the lit object. Player wired to
  `@portalshq/capability-video-delivery` with one stream live at a time.
