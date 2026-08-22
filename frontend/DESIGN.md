---
name: Portals
description: Immersive editorial design system for the Portals production repository
sourceOfTruth: "src/pages/vcs-current.tsx"
theme:
  direction: "cinematic, editorial, fluid, immersive"
  foreground: "#ffffff"
  fallbackBackground: "#010528"
  canvas:
    type: "animated WebGL color field"
    baseColors:
      deepIndigo: "#0E115F"
      violet: "#726DD2"
    transitionColors:
      cobalt: "#3A87CB"
      paleBlueGray: "#AAB5C3"
      magenta: "#DD30C9"
      dustyPink: "#C243A7"
      mutedGreen: "#8BBFAF"
  translucentSurface: "rgb(255 255 255 / 0.12)"
  translucentSurfaceHover: "rgb(255 255 255 / 0.30)"
  subtleBorder: "rgb(255 255 255 / 0.10)"
  structuralBorder: "rgb(255 255 255 / 0.20)"
  quoteBorder: "rgb(255 255 255 / 0.30)"
typography:
  displaySans: "DieGroteskC"
  textSans: "DieGroteskB"
  editorialSerif: "StkBureau"
  utilityMono: "AeonikFono"
layout:
  columns: 24
  headerHeight: "78px"
  siteMargin: "clamp(14.74px, calc(9px + 1.79375vw), 54.92px)"
  siteGutter: "clamp(6.74px, calc(1px + 1.79375vw), 46.92px)"
  sectionPadding: "clamp(76px, calc(67.429px + 1.339vw), 106px)"
shape:
  controlRadius: "4px"
  defaultRadius: "0px"
motion:
  standardDuration: "500ms"
  overviewEnter: "1250ms"
  overviewExit: "400ms"
  overviewStagger: "150ms"
---

# Portals Design Language

## 1. Creative direction

Portals is presented as a living creative environment rather than a conventional software interface. The page combines production-system precision with the scale and pacing of an editorial campaign: oversized type, long full-viewport chapters, sparse white UI, and a continuously changing field of color behind the content.

The defining impression is **cinematic continuity**. The background, typography, scroll pacing, and pinned transitions make the page feel like one evolving composition instead of a stack of isolated marketing sections.

The current design language is:

- Immersive rather than card-based.
- Editorial rather than dashboard-like.
- Color-rich rather than achromatic.
- Fluid and responsive rather than governed by a small fixed type scale.
- Mostly flat, with translucent glass used selectively for controls and grouped content.
- Precise in its grid and typography, expressive in its background and motion.

## 2. Canvas and color

### The canvas

The default HTML fallback is deep navy `#010528`. In the full experience, a fixed WebGL layer sits behind the page and supplies the visual atmosphere. Its ramps move through indigo, violet, cobalt, pale blue-gray, magenta, dusty pink, and muted green.

Do not replace this experience with a single near-black surface. Color progression is a core part of the identity and gives each scroll chapter a distinct mood while preserving continuity.

### Foreground

White is the universal foreground:

- Primary text and icons: `#ffffff`
- Secondary table text: white at 80% opacity
- Quiet borders and fills: white at 10–30% opacity

The system does not use a separate brand accent for calls to action. Hierarchy comes from size, font contrast, opacity, layout, and glass treatment.

### Translucency

Translucent white surfaces are intentionally used over the animated canvas:

- CTA fill: `white / 12%`
- CTA border: `white / 10%`
- CTA hover: `white / 30%`
- Overview list items: `white / 10%` with `20px` backdrop blur
- Capability group: `20%` white separators with `12px` backdrop blur
- CTA control: `50px` backdrop blur

These treatments should remain sparse. They are functional lenses over the moving background, not a universal container style.

### Color rules

- Keep text white across all color-ramp states.
- Use opacity, not new hues, for secondary information.
- Preserve enough darkness or saturation behind text to maintain contrast.
- Treat the WebGL palette as a continuous environmental field, not as discrete section background tokens.
- Do not introduce amber, slate, beige, or solid charcoal themes; they are not part of this page.

## 3. Typography

Typography carries most of the hierarchy. Four purpose-built families create a strong editorial contrast.

### Display sans — Die Grotesk C

Used for hero and section-scale statements.

- `t-d1-sans`: fluid `43.8–114.12px`, weight 300, line-height 95%, slightly positive tracking
- `t-d2-sans`: fluid `33.7–107.36px`, weight 300, line-height 100%, slightly positive tracking

The display sans is airy, light, and monumental. Large headings should usually be sentence case or lowercase, constrained by `em`-based max widths, and allowed to establish their own line breaks.

### Editorial serif — STK Bureau

Used inside major statements to change voice and emphasis rather than merely weight.

- `t-d1-serif`: fluid `45.8–116.12px`, weight 400, line-height 95%, tight negative tracking
- `t-d2-serif`: fluid `34.65–109.98px`, weight 400, line-height 100%, tight negative tracking
- `t-p-lg-serif`: fluid `19.69–29.73px`, weight 400, line-height 120%

The serif is the emotional register of the page. Use it for decisive phrases, lead copy, explanatory prose, and quotes.

### Text sans — Die Grotesk B

Used for supporting copy, headings, branding, controls, tables, and lists.

- `t-h3-sans`: fluid `25.48–42.22px`, weight 400, line-height 104%
- `t-p-sans`: fluid `15.69–25.73px`, weight 400, line-height 120%
- `t-button`: `18px`, weight 500
- Global CTA heading: fluid `37.91–104.87px`, weight 300, line-height 100%

### Utility mono — Aeonik Fono

`t-m2` is a fluid `13.74–22.11px`, uppercase, 100% line-height utility style. It is used for:

- Three-digit overview indices
- Problem-card numbers
- Comparison labels
- Pricing periods
- Citations and compact metadata

Utility mono should remain terse. It is not a body or navigation font.
Number markers use single padding: `01`, `02`, `03`, not `001`, `002`, `003`.

### Type rules

- Build hierarchy with font role, scale, and placement—not many weights.
- Use the serif to create tonal shifts inside large sans statements.
- Preserve deliberately tight display leading.
- Keep large copy widths expressed in `em` so measure scales with type.
- Lowercase is a recurring voice choice for the brand, hero, comparison language, and supporting label.
- Avoid generic system fonts, tracked eyebrow labels above every section, and conventional 72px display ceilings; this page intentionally scales beyond them.

## 4. Layout and spatial system

### Grid

The primary layout is a responsive 24-column grid (`ui-grid`). Content frequently spans asymmetric subsets of that grid:

- Lead statement: 20 columns, offset by 2
- Overview: icon in 3 columns, title and copy across the remaining 21
- Workflow: copy on the left, ordered actions beginning around column 13
- Supporting hero label: narrow block offset from the left

Do not collapse desktop compositions into centered single-column containers by default. Offset, asymmetry, and wide negative space are essential.

### Fluid margins

- Site margin: `14.74–54.92px`
- Site gutter: `6.74–46.92px`
- Standard section block padding: `76–106px`
- Common section row gap: `30–52px`

Spacing is continuous across viewport sizes through `clamp()`. Fixed values are used mainly for component internals (`8`, `16`, `18`, `20`, `24`, `34`, and `36px`).

### Vertical pacing

Major chapters use generous vertical duration:

- Hero: at least one viewport high
- Lead, problem, and solution chapters: one viewport on desktop where appropriate
- Overview: a `900vh` desktop scroll stage with a sticky full-screen composition
- Closing CTA: one viewport high

The page should breathe in chapters. Avoid compressing it into a conventional sequence of compact content bands.

### Responsive behavior

Desktop begins at `64rem`.

- Below desktop, complex grids become single-column or two-column arrangements.
- The pinned overview becomes a long vertical list with large gaps (`106–212px`).
- The header is absolute on small screens and fixed from the medium breakpoint.
- Comparison rows stack their metric and both states; contextual column labels appear inside each row.
- Pricing, cards, and audience groups stack to one column.

Mobile is a recomposition of the same narrative, not a miniaturized desktop layout.

## 5. Components and recurring patterns

### Header

The header is `78px` high and overlays the page. It contains only:

- Lowercase `portals` wordmark in the sans heading face
- A single Scope a pilot control

Keep navigation minimal. The moving canvas and hero need visual room.

### CTA button

The primary CTA is a compact glass control:

- Minimum width `220px`
- Height `48px`
- Horizontal padding `18px` left and `12px` right
- `4px` radius
- `1px` white/10 border
- White/12 fill
- `50px` backdrop blur
- White text in medium sans
- 100ms border transition to white on hover

There is no solid accent button, shadow, lift, or transform.

### Number labels

Sequence labels pair:

- An `8px × 8px` solid white square
- A utility-mono number, generally single padded (`01`, `02`, …)
- A wide `32px` horizontal gap in the overview; tighter variants may use `8px`

This square-plus-number construction is the recurring marker language.

### Editorial content groups

Problem cards, audience entries, and pricing tiers rely on shared grid alignment and whitespace rather than independent filled cards. They typically use `24px` internal padding with no background.

Do not automatically add borders around every item. Some groups are intentionally open; separators appear only where the composition needs them.

### Comparison table

The comparison is a typographic three-column matrix:

- Metric
- Without Portals
- With Portals

Rows use white/50 top rules. Desktop columns use white/50 left rules. Secondary content drops to 80% opacity. The table remains visually integrated with the canvas rather than enclosed in a card.

### Capability group

Capabilities form a two-column glass-adjacent grid on desktop:

- `1px` gaps created by a white/20 parent background
- `4px` group radius
- `12px` backdrop blur
- `24px` item padding

Items themselves remain transparent so the animated field reads through.

### Workflow items

Workflow steps are simple bordered rows:

- `1px` inherited white border
- `4px` radius
- `18px` padding
- `8px` vertical separation

The treatment is quieter and more compact than the capability group.

### Quotes

Quotes use a single white left rule with `18px` left padding, large editorial serif copy, and a mono citation below. A side rule is appropriate here because it denotes quotation, not decoration.

### Icons

Overview icons are abstract, geometric SVG line/forms rendered in the current text color. Their width scales fluidly from `44–86px`. Icons are editorial anchors, not small badges inside cards.

## 6. Motion and scroll behavior

Motion is a principal design material.

### Environmental motion

The fixed WebGL layer responds to scroll markers and changes color ramps across the narrative. Page content remains transparent so this background can unify every section.

### Overview chapter

On desktop, the overview is pinned while five concepts advance through scroll:

- Repository
- Identity
- History
- Provenance
- Collaboration

Each state replaces the previous one in place. Content exits with opacity and `10px` blur over `400ms`, then enters over `1250ms` using an expressive ease-out curve. Four content layers stagger by `150ms`: title/icon, first copy column, middle copy/list column, and final statement. A thin horizontal progress line scales from the left.

On mobile, all overview items are visible in sequence and the pinned interaction is removed.

### Interaction motion

- Button hover changes translucent fill over `500ms`.
- Do not add routine card lifts, bounce, parallax text, or shadow animation.
- Preserve `prefers-reduced-motion`: overview transitions are disabled when reduced motion is requested.

## 7. Composition patterns

Use these patterns when extending the page:

1. **Monumental statement:** a light-weight display sans sentence with one strategically chosen serif phrase.
2. **Asymmetric explanation:** title or lead copy occupying 9–16 of the 24 columns, balanced by negative space or supporting content.
3. **Open grid:** repeated content aligned by the parent grid without compulsory card chrome.
4. **Hairline matrix:** comparisons organized with white/20 one-pixel rules.
5. **Glass lens:** a small interactive control or grouped module that lightly blurs the animated canvas.
6. **Full-screen chapter:** one key idea with enough vertical space to feel like a scene rather than a section.
7. **Square and index:** compact sequence metadata paired with the white square marker.

## 8. Do and do not

### Do

- Let the animated color field remain visible through the page.
- Use white as the primary interface color and opacity for secondary hierarchy.
- Pair Die Grotesk and STK Bureau within important statements.
- Use the 24-column grid to create offset and asymmetric compositions.
- Scale typography and spacing fluidly.
- Give major narrative moments viewport-scale breathing room.
- Use translucent blur selectively for CTAs, compact lists, and grouped capability content.
- Use one-pixel white rules for tables and deliberate structural divisions.
- Preserve the sticky overview’s staged blur-and-opacity rhythm.
- Recompose complex interactions for mobile.

### Do not

- Do not restore the previous near-black and amber “archive” palette.
- Do not use Geist or JetBrains Mono; they are not the page’s typefaces.
- Do not describe the system as brutalist, achromatic, or zero-radius.
- Do not prohibit backdrop blur; it is part of the implemented component language.
- Do not place all content on opaque dark cards.
- Do not add shadows or elevation to create hierarchy.
- Do not turn every repeated item into a bordered card.
- Do not add gradients as isolated CSS decoration; color belongs to the shared WebGL environment.
- Do not add a conventional navigation bar full of links.
- Do not standardize all headings into one sans style; serif contrast is fundamental.
- Do not shorten the desktop overview into a static card grid.
- Do not use bright accent colors for individual controls that compete with the canvas.

## 9. Source-of-truth rule

`src/views/vcs-current/a.tsx`, together with `src/saga-repro.css`, `src/saga.css`, and `public/saga-webgl.js`, defines the current design language. This document should follow those implementations. If the page and this document diverge, update this document to describe the page rather than preserving obsolete guidance.
