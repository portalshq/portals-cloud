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
- **Aesthetic:** *nocturnal soft-object.* A warm green-black ground, one green
  accent, elevation expressed as light rather than as a line.
- **Signature move:** **the lit object.** The one hero surface per view is a
  soft-edged object floating in a dark room, its silhouette defined by a
  lightness step off the ground plus a tight green bloom at its edge. Because
  elevation is light, the interface needs no hairlines at all.

### Rules that are not negotiable

- **No uppercase text anywhere**, and no eyebrow or kicker labels. Status is
  sentence case, always paired with a word, never colour alone.
- **No border lines anywhere.** Separation comes from lightness steps
  (`--color-surface`, `--color-surface-2`), type, and space.
- **One accent colour only.** `--color-warning` and `--color-error` are
  functional signals and appear only on real warning and error states.
- **Green means you can act on it.** `--color-accent` appears only on
  interactive elements and live interaction states: primary buttons and their
  hover, `aria-pressed` toggles, the active filter pill, the active nav icon,
  link hovers, the profile hover, and the focus ring. Status dots, live pills,
  monograms, the episode numeral, the brand mark, the progress readout, the
  glow, and the scrollbar are all neutral. Status still reads as status because
  the word is always present beside the dot.
- **Forbidden copy.** The words *portals*, *AI*, *application*, *living*, and
  *infrastructure* do not appear in any user-facing string. *Living* is written
  as *live*. A CI grep for these belongs on this directory.

## Typography

| Role | Face | Source |
| --- | --- | --- |
| Display | Bricolage Grotesque (variable, wght 200–800, opsz) | `next/font/google` |
| Body / UI | Hanken Grotesk (variable, wght 100–900) | `next/font/google` |

Chosen for personality, not taste: Bricolage has real personality at display
sizes and a slightly condensed, high-x-height form that reads friendly rather
than corporate. Hanken is soft-terminaled and warm at small sizes. Neither is
Inter, Roboto, Arial, system-ui, or Space Grotesk.

- **Scale:** ratio **1.333** (perfect fourth) off a **16px** base.
  `--text-2xs` 11 / `-xs` 12 / `-sm` 14 / `-base` 16 / `-md` 21.3 / `-lg` 28.4
  / `-xl` 37.9 / `-2xl` 50.6.
- Headings are fluid via `clamp()`, capped at the corresponding scale step.
- Display tracking is `-0.02em` — optically tightened, never destructive.
- 11px is the absolute floor. Body copy is 16px. Interactive labels are 14px.

## Color

Authored in OKLCH. The neutrals sit slightly **cooler** than the accent
(hue 160 vs 152) so the green separates from the ground instead of dissolving
into it.

| Token | Value | Role |
| --- | --- | --- |
| `--color-bg` | `oklch(0.16 0.01 160)` | ground, near-black, green-biased |
| `--color-surface` | `oklch(0.215 0.012 160)` | rail, media ground, cards |
| `--color-surface-2` | `oklch(0.265 0.014 160)` | secondary controls, chips |
| `--color-fg` | `oklch(0.96 0.01 150)` | off-white ink |
| `--color-muted` | `oklch(0.7 0.014 160)` | supporting copy |
| `--color-accent` | `oklch(0.7 0.185 150)` | forest green — interaction only |
| `--color-accent-hover` | `oklch(0.76 0.175 150)` | green, lightened not greyed |
| `--color-accent-fg` | `oklch(0.2 0.045 149)` | text on green |
| `--color-success` | = `--color-accent` | functional only |
| `--color-warning` | `oklch(0.8 0.15 78)` | functional only |
| `--color-error` | `oklch(0.68 0.19 22)` | functional only |

`--color-accent` renders as **`#1ebd5b`**. Text on it 7.3:1; as a focus ring
against the ground 7.8:1, comfortably past the 3:1 that WCAG 2.4.13 needs —
which is why the ring can stay green instead of dropping to `--color-fg`.

**On saturation and hue.** sRGB chroma is not uniform across the green arc.
Measured ceilings at L 0.78: hue 152 → 0.190, hue 146 → 0.220, **hue 143 →
0.241**, hue 140 → 0.232, hue 134 → 0.207, hue 125 → 0.181. Chroma peaks at
hue 143, so a bright, maximally saturated green has to sit there — and hue 143
is a yellow-green. Moving toward forest means trading chroma for darkness and
shifting hue the other way, to 150. The ceiling falls with lightness, so
`oklch(0.7 0.185 150)` is the furthest forest direction that still passes
contrast. Pushing darker than L 0.7 would fail the focus ring's 3:1 against
the near-black ground unless the ring were decoupled from the accent.

Distribution is roughly 85 / 10 / 5 — the accent is deliberately scarce.

## Spacing, radius, shadow

- **Spacing:** 4px base, `--space-1` … `--space-14`. Tight inside a group
  (`--space-5` in the panel stack), generous between regions (`--space-8` in
  the rail, `--space-14` between page sections).
- **Radius — exactly two values.** `--radius: 16px` for media surfaces and
  cards (at the ceiling, not past it — 24px+ is blob-rounding) and
  `--radius-pill: 999px` for controls.
- **Shadow — exactly one approach.** `--glow-card`, a tight, dim green bloom,
  applied to **one hero object per view** and nothing else:
  `0 14px 34px -20px oklch(0.78 0.203 152 / 0.2)`. Repeating it across a card
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
- The feed progress bar is `transform: scaleY()` driven by scroll, with a 90ms
  linear transition because it is a continuous read, not a state change.
- `prefers-reduced-motion: reduce` collapses `--duration` to 1ms and drops the
  `:active` press scale. User-initiated direct feedback is retained; ambient
  motion is not.

## Scrollbars

A transparent gutter is reserved on every scroller
(`scrollbar-gutter: stable`), so laying out on a page that does scroll never
shifts content sideways. `--scrollbar-size: 14px`, of which 2px on each side is the transparent
gutter, leaving a 10px grabbable thumb, thumb
`oklch(0.78 0.203 152 / 0.55)` floating in a transparent track via the
`border: 3px solid transparent` + `background-clip: content-box` trick, with
`scrollbar-color` set for Firefox.

## Craft layer

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
  `--color-surface-2` pill with the accent on the icon.
- **The brand is a caption, not a mark.** The rail has no logo dot. The name
  `channels` is set small and quiet beneath the profile chip at the foot, as a
  caption rather than a lockup, and it is dropped entirely from the mobile
  bottom bar. The rail opens on the navigation.
- **Rail reservation differs by layout, deliberately.** The feed is centred, so
  it reserves only the collapsed width and the drawer may overlay it without
  ever covering anything. `/channels` is left-aligned, so it reserves the
  **expanded** width; a narrower reservation let the open drawer cover the
  heading, the filter row, and the Follow button.
- **Feed.** The scroller is `100dvh` with `scroll-snap-type: y mandatory`; each
  panel is `100dvh` with `scroll-snap-stop: always`. Panel content is one
  column, left-aligned at every level, centred as a group and capped at
  1100px so a large display does not strand the player in a void.
- **The player takes the leftover height.** The column is a full-height flex
  stack: the text blocks are `flex: 0 0 auto` and a `.videoFrame` takes the rest
  with `flex: 1 1 auto; min-height: 0`. Below 641px the frame *is* the player —
  the video fills it and the 16:9 ratio is dropped, so `object-fit: cover`
  crops rather than letterboxes. Above 641px the frame is a grid, which lets
  the video's `height: 100%` resolve against a definite grid area so
  `aspect-ratio: 16 / 9` can derive the width from that height, with
  `justify-self: start` so the player shares the text's left edge. Measured:
  exactly 1.78 at 900, 1024, 1280, 1440 and 1920 wide, filling the frame
  height at every size.
- **Streaming.** Only the panel currently in view mounts a
  `VideoDeliveryPlayer`; offscreen panels render an inert placeholder of the
  same box, so exactly one stream is ever live. `activeIndex` is derived from
  `scrollTop / clientHeight` on a passive scroll listener.
- **Player states.** `loading`, `playing`, `buffering`, `reconnecting`, and
  `error` each render a sentence-case status line on an **opaque**
  `--color-bg` bar, so status text keeps its contrast over arbitrary video
  content. The bar is `role="status"`. The package's held-frame capture handles
  the buffering freeze.
- **Channel room.** The page *is* the channel, so there is no gate: no "enter
  the room" button, no `aria-pressed` toggle, and no primary action anywhere on
  this route. The stage is a presence surface, not an entry point, and its
  caption reports the channel's state ("Broadcasting right now", or the
  schedule line when it is not live). The room also carries a tighter measure
  than the index — `calc(var(--rail-expanded) + 760px)` — because it is one
  column of reading plus one stage rather than a browsing grid. The fake
  running timecode from an earlier pass was removed: a clock that does not tick
  is the same tell as a status dot that does not change.
- **Index.** Hero with the scoped counts, one featured channel on the full
  stage, then a tool row and a card grid. The tool row is a right-aligned
  horizontal grid above the cards: four filters (Live now, Play, Stories,
  Learning) as 44px icon squares with their labels set underneath, then search
  last. There is no "All" filter — a filter is either on or off, and clicking
  an active one clears it. An active filter swaps its category icon for `X`
  and takes the accent, so the state is legible without relying on the icon
  alone. **Search is compressed to a single icon button** that expands into a
  248px field when focused, keeps its "Search" label underneath so the row
  never changes height, and turns into `X` once it holds a value. The
  expand/collapse is a hard swap with an opacity fade rather than a width
  animation. Tracks size to their content so the fixed-width tool cells stay
  in a column while search is free to grow. Both the filter state and the
  hero counts describe the current scope, so the counts move as you filter.
- **Components.** Buttons are ranked by importance: one primary (green filled),
  secondaries are `--color-surface-2`. Press is `scale(0.97)`. Focus is a
  two-tone `box-shadow` ring (`0 0 0 2px bg, 0 0 0 4px accent`) so it works on
  both grounds and follows the pill radius.
- **Follow reads as a badge, not a repaint.** The bell sits inside a 26px
  circular chip and stays the same glyph in both states: the chip turning
  accent and the word changing to "Following" are the whole signal. Swapping
  the icon as well would be a third cue saying the same thing. The word stays
  in normal ink outside the green, and its weight never changes.
- **No label ever changes a control's width.** "Follow"/"Following" and
  "Share"/"Link copied" sit in fixed-width buttons (142px and 150px), sized to
  the longest string each shows, so no state change can reflow the row. The
  share button also reports success honestly: the clipboard rejects in a
  non-secure context, so "Link copied" only appears once the write resolves.
- **Iconography.** lucide-react at one grid (24), one stroke (`strokeWidth`
  1.75), one radius (round caps, matching `--radius-pill`). Share uses lucide's
  `Share` — the arrow-out-of-a-bowl variant that is commonly called ShareArrow.
  `ShareArrow` is not a real lucide icon: it is absent from every published
  version, including 1.48.0, so there is nothing to upgrade to. The rail's
  profile chevron is hand-inlined to the same 1.75 stroke so the set stays
  coherent. Every icon-only control carries an accessible name.
- **Imagery.** There are no thumbnail assets. Media surfaces carry a
  **typographic monogram** — the channel's initial in Bricolage at reduced
  green opacity — and the featured card carries its episode numeral. This is a
  deliberate placeholder device, not stock art, and it should be replaced by
  real stills when they exist.
- **Accessibility.** WCAG 2.2 AA. 44px minimum targets. Feed panels are
  `<section>`s labelled by their channel name, so tabbing moves panel to panel
  and the browser scrolls each into view. Status is never colour alone — the
  status dot always sits beside words. No uppercase, which also removes all-caps
  legibility risk.

## Content

All channel copy, the browse lede, and the stream constant live in
`components/channels/data.ts`. One file, so the forbidden-word rule is
enforceable in one place and the feed and the index can never disagree.

`PLACEHOLDER_STREAM` points at a public HLS test asset so the player is
genuinely live out of the box. **Replace the per-channel `stream` field with
real manifests before this ships.** Nothing else changes when they arrive.

## Slop audit

Scored against `references/slop-checklist.md` on a production build at 1440×900
and 390×844, with screenshots of all three routes.

**Artifact fit:** pass, checked in-browser rather than from source.

**Colour:** pass. Slime green at hue 143, far outside the indigo–violet band. No
gradient text, no cream ground, no even multi-hue spread. The glow was caught
twice: first as too wide (a spotlight haze, a named tell), then as applied to
every grid card (fog). It is now one hero object per view at reduced alpha.

**Typography:** pass. Distinct display and body pair, neither on the ban list.
Ratio stated. No eyebrow, no pill chip above a headline, no full-sentence
display headline — "Pick a room." is three words.

**Layout:** pass. Rendered-page checks pass: **the expanded drawer was covering
page content on `/channels`** and was caught on screenshot; the rail
reservation now differs by layout. No horizontal overflow on any route
(`scrollWidth` 1429 ≤ `clientWidth` 1440). No clipping container around a
popover.

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
