---
name: Portals
description: Production repository for AI-native creative organizations — The Archivist aesthetic
colors:
  bg: "#0c0c0c"
  surface: "#141414"
  surface-variant: "#1e1e1e"
  ink: "#e8e4df"
  muted: "#8a8680"
  primary: "#c4841a"
  primary-foreground: "#ffffff"
  secondary: "#7a9ab5"
  secondary-foreground: "#ffffff"
  destructive: "#d43c2e"
  destructive-foreground: "#ffffff"
  border: "#2a2a2a"
  ring: "#c4841a"
  card: "#111111"
  card-border: "#2a2a2a"
  popover: "#111111"
  popover-border: "#2a2a2a"
  input: "#1e1e1e"
  surface-lowest: "#0a0a0a"
typography:
  display:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(2.5rem, 5vw, 4.5rem)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "clamp(2rem, 4vw, 3rem)"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.08em"
  mono:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  none: "0px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "64px"
  3xl: "96px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-primary-hover:
    backgroundColor: "#a87018"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px 24px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "40px"
  input:
    backgroundColor: "{colors.input}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "12px 16px"
  section-header:
    fontFamily: "JetBrains Mono, monospace"
    fontSize: "0.875rem"
    fontWeight: 500
    letterSpacing: "0.08em"
    textTransform: "uppercase"
---

# Design System: Portals

## 1. Overview

**Creative North Star: "The Production Archive"**

Portals is the memory layer of creative worlds. Its interface should feel like the physical archive of a world-class production studio — calm, precise, and built to outlast the work it preserves. Every surface communicates intentionality: nothing is decorative, nothing is accidental, nothing exists for "vibe." The system earns trust through structural honesty.

This is not a SaaS landing page. Not a DAM. Not a dashboard. The interface sits between Apple's craft precision and Linear's software rigor, with the quiet authority of a Pixar production pipeline. The metaphor is a studio archive — not a filing cabinet, not a command center.

**Key Characteristics:**
- **Brutalist structural honesty.** Zero border-radius, no shadows, 1px borders. Depth through tonal layering and spacing, not decoration.
- **Warmth through type and accent, not surface.** The near-black background is achromatic; all brand warmth lives in the amber primary and the quality of the typography.
- **Monospace as technical authority.** JetBrains Mono carries section headers, metrics, and data — signaling precision without saying "developer tool."
- **Cinematic restraint.** Motion is purposeful and minimal. Every animation earns its place through function, not flourish.
- **Structural hierarchy through borders.** Grids separated by 1px lines at `--border` create clear visual zones without cards, shadows, or rounded containers.

## 2. Colors

The palette is achromatic at its foundation with a warm amber brand anchor and a cool slate secondary for functional contrast. All warmth comes from accent and type, never from the surface.

### Primary
- **Archive Amber** (`#c4841a`): The brand anchor. Used on CTAs, active states, links, and the brand wordmark. Reserved for ≤15% of any screen — its rarity is its authority.

### Secondary
- **Archive Slate** (`#7a9ab5`): Cool counterpart for secondary actions, data labels, and the "With Portals" column highlights. Provides contrast against the warm primary without competing.

### Neutral
- **Void Black** (`#0c0c0c`): The body background. Pure achromatic near-black — no warmth, no cool tint. The stage, not the set.
- **Surface** (`#141414`): Cards, panels, raised containers. One step above void — enough to separate without lifting.
- **Surface Variant** (`#1e1e1e`): Subtle containers, input backgrounds, secondary surfaces. Two steps above void.
- **Surface Lowest** (`#0a0a0a`): Deepest layer — hero backgrounds, footer foundation. Below void.
- **Ink** (`#e8e4df`): Primary body text. Warm off-white with a slight cream cast — readable, comfortable, never stark white.
- **Muted** (`#8a8680`): Secondary text, captions, placeholder copy. Must reach ≥4.5:1 against its background.
- **Border** (`#2a2a2a`): All structural separators, grid lines, card edges. Always 1px.

### Named Rules

**The Archive Amber Rule.** The primary accent is used on ≤15% of any given screen. Its rarity is the point — when amber appears, it means something. Never use it for decorative elements, background tints, or gradient fills.

**The Achromatic Foundation Rule.** The background surface carries zero chroma. All brand warmth lives in the amber primary, the slate secondary, and the quality of the typography. Adding warmth to the surface creates the cream/sand/beige AI default.

## 3. Typography

**Display Font:** Geist (with system-ui, sans-serif fallback)
**Body Font:** Geist (with system-ui, sans-serif fallback)
**Label/Mono Font:** JetBrains Mono (with monospace fallback)

**Character:** Geist is a clean, geometric sans-serif with humanist proportions — technical without being cold, modern without being trendy. Paired with JetBrains Mono for technical labels and data, the pairing signals "production-grade infrastructure" without crossing into developer-tool territory. The mono is never used for body copy.

### Hierarchy
- **Display** (500, clamp(2.5rem, 5vw, 4.5rem), 1.05): Hero headlines. The single largest typographic moment on any page. Tight leading, tight tracking (-0.03em).
- **Headline** (500, clamp(2rem, 4vw, 3rem), 1.1): Section headings. Clear hierarchy below display but commanding.
- **Title** (500, 1.5rem, 1.2): Subsection titles within sections. Supporting the headline.
- **Body** (400, 1rem, 1.6): All running prose. Line length capped at 65–75ch. `text-wrap: pretty` on long paragraphs.
- **Label** (500, 0.75rem, 0.08em tracking, uppercase): Section headers ("THE PROBLEM", "HOW IT WORKS"), eyebrow text, technical labels. JetBrains Mono only.

### Named Rules

**The Mono Authority Rule.** JetBrains Mono appears only where precision is the message: section headers, metrics, data points, code references, the brand wordmark in footer contexts. It never carries body prose or UI labels that don't need technical weight.

**The Display Ceiling Rule.** Display heading size never exceeds 4.5rem (~72px). Above that the page is shouting, not designing. The clamp() max is the hard ceiling.

## 4. Elevation

No shadows. None. The system is structurally flat — all depth is conveyed through tonal layering (surface → surface-variant → surface-lowest) and 1px borders. Shadows would break the brutalist contract and introduce the visual softness the design explicitly rejects.

### Depth Strategy
Depth is communicated through three mechanisms:
1. **Tonal stepping.** Background → surface → surface-variant creates readable layering without lifting.
2. **1px borders.** Every structural separator, grid line, and card edge is a 1px border at `--border`. The grid-gap-px pattern (seen in the comparison table and capability grids) uses borders as the primary organizational tool.
3. **Spacing rhythm.** Vertical spacing increases at section boundaries (py-24) and decreases within sections (gap-4, gap-8), creating implicit depth without visual lifting.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at all times. Shadows never appear — not on hover, not on focus, not on elevation. State changes are communicated through color shift, border emphasis, or tonal stepping.

## 5. Components

### Buttons
- **Shape:** Zero border-radius (0px). Sharp corners, always.
- **Primary:** Archive Amber fill (`--primary`), white text. Padding: 12px 24px. Font: Geist 500. Monospace variant available for CTA contexts.
- **Hover:** Amber deepens to `#a87018`. No transform, no shadow — color shift only.
- **Ghost:** Transparent background, ink text. Used for secondary actions ("Read Docs").
- **Outline:** Transparent background, ink text, 1px border at `--border`. Used for tertiary actions.

### Cards / Containers
- **Corner Style:** Zero radius (0px). Sharp corners, always.
- **Background:** `--card` (`#111111`) for standard cards, `--surface-lowest` (`#0a0a0a`) for hero backgrounds.
- **Shadow Strategy:** None. Depth via tonal stepping and borders only.
- **Border:** 1px solid `--border` (`#2a2a2a`). Always present on cards.
- **Internal Padding:** 40px (standard), 24px (compact), 64px (hero).

### Inputs / Fields
- **Style:** `--input` background (`#1e1e1e`), ink text, zero radius. 1px border at `--border`.
- **Focus:** Border color shifts to `--ring` (Archive Amber). No glow, no shadow.
- **Error:** Border shifts to `--destructive` (red).

### Section Headers
- **Style:** JetBrains Mono, 500 weight, 0.08em tracking, uppercase. Color: Archive Slate (`--secondary`). Always lowercase in the current implementation ("THE PROBLEM", "HOW IT WORKS").

### Grid Separators
- **Pattern:** `gap-px bg-[--border]` on the parent creates 1px grid lines between children. Children carry their own background. This is the primary structural tool for comparison tables, capability grids, and pricing tiers.

### Navigation
- **Style:** Lowercase Geist, ink text. Hover: transitions to white. No active state indicator — navigation relies on scroll position, not visual emphasis.

### Pricing Tiers
- **Popular indicator:** 1px border at Archive Amber (`--secondary` in current code, should be `--primary`). "Most Popular" label in JetBrains Mono uppercase.

## 6. Do's and Don'ts

### Do:
- **Do** use 1px borders as the primary structural tool. Grids, cards, sections, tables — all separated by 1px borders at `--border`.
- **Do** use tonal stepping (background → surface → surface-variant) for depth hierarchy instead of shadows or elevation.
- **Do** use JetBrains Mono for section headers, metrics, and technical labels — it signals precision.
- **Do** keep the Archive Amber accent to ≤15% of any screen. Its rarity communicates authority.
- **Do** use `text-wrap: balance` on h1–h3 for even line lengths. Use `text-wrap: pretty` on long prose.
- **Do** use `clamp()` for responsive display typography. Never exceed 4.5rem.
- **Do** maintain ≥4.5:1 contrast for body text and ≥3:1 for large text. The warm `--ink` on `--background` achieves this.
- **Do** use the grid-gap-px pattern for structured comparisons (comparison tables, capability grids, pricing).
- **Do** keep body line length at 65–75ch maximum.

### Don't:
- **Don't** use border-radius greater than 0px on any element. Zero radius is a structural commitment, not a starting point. Full-pill is acceptable for tags and badges only.
- **Don't** use box-shadow on any element. The system is flat by design.
- **Don't** use gradient text (`background-clip: text`). Decorative, never meaningful.
- **Don't** use side-stripe borders (`border-left` or `border-right` greater than 1px as colored accent). Rewrite with full borders, background tints, or nothing.
- **Don't** use glassmorphism, backdrop-blur, or translucent surfaces. Rare and purposeful, or nothing.
- **Don't** use cream, sand, beige, or warm-tinted backgrounds. The background is pure achromatic near-black. Warmth comes from accent and type only.
- **Don't** use gradient backgrounds. Surfaces are solid colors.
- **Don't** use the hero-metric template (big number + small label + supporting stats + gradient accent). It's a SaaS cliché.
- **Don't** use identical card grids (same-sized cards with icon + heading + text, repeated endlessly). Use the grid-gap-px pattern or varied layouts.
- **Don't** put a tiny uppercase tracked eyebrow above every section. Use it deliberately for key sections, not as universal scaffolding.
- **Don't** use numbered section markers (01 / 02 / 03) as default scaffolding. Numbers earn their place when the section is a real sequence.
- **Don't** use hand-drawn / sketchy SVG illustrations. If you can't render the scene with real assets, ship no illustration.
- **Don't** use `repeating-linear-gradient(...)` stripe backgrounds. Pure decoration.
- **Don't** use decorative grid backgrounds (two-axis CSS grid overlays from `linear-gradient`).
- **Don't** look like generic SaaS landing pages (cream backgrounds, gradient cards, hero-metric templates).
- **Don't** look like traditional DAM/enterprise tools (bureaucratic compliance-software aesthetic).
- **Don't** look like playful AI creativity tools (fun/bubbly AI image generators, neon gradients, "magic" terminology).
- **Don't** look like generic AI infrastructure / developer tooling (terminal screenshots, code-first heroes, benchmark numbers).
- **Don't** look like consumer AI companion / "AI magic" products (chat bubbles, magic wands, sparkles).
- **Don't** look like enterprise workflow software (Jira/Monday.com feel, checklists, status dashboards).
- **Don't** look like stock photography / marketing SaaS aesthetic (people around laptops, "empower your team" copy).
- **Don't** look like NFT / Web3 / ownership aesthetic (blockchain visuals, crypto gradients, token language).
- **Don't** look like overly futuristic sci-fi (holograms, glowing interfaces, cyberpunk, AI brain imagery).
