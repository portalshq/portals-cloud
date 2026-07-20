---
target: src/pages/vcs.tsx
total_score: 18
p0_count: 2
p1_count: 2
timestamp: 2026-07-18T23-59-02Z
slug: src-pages-vcs-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | Zero feedback. "Request Access" leads nowhere visible. No loading states, no confirmation. Entirely static. |
| 2 | Match System / Real World | 3 | Terminology accurate to domain. Minor: "Five pillars" is internal framing, not user language. |
| 3 | User Control and Freedom | 1 | No skip links, broken anchor nav (#pillars missing), no progressive disclosure, no way to jump to pricing. |
| 4 | Consistency and Standards | 3 | Brutalist system applied rigorously. Deduction: buttons use rounded-md (4px) contradicting zero-radius. "Most Popular" border uses wrong color (slate instead of amber). |
| 5 | Error Prevention | 1 | Footer email input has no validation, no type="email". "Request Access" sets no expectation. |
| 6 | Recognition Rather Than Recall | 3 | Consistent section patterns help. Comparison table is scannable. Deduction: five pillars blur together from identical treatment. |
| 7 | Flexibility and Efficiency | 1 | No shortcuts, no working anchor nav, no progressive disclosure. Demands linear scrolling through 2000+ words. |
| 8 | Aesthetic and Minimalist Design | 2 | Brutalist palette correct. But page is verbose — five pillars × (heading + subtitle + body + why-it-matters + 3 cards) = massive text wall. |
| 9 | Error Recovery | 1 | No forms with validation, no error states, nothing interactive to recover from. |
| 10 | Help and Documentation | 2 | "Read Docs" CTAs exist but point to undefined destinations. No inline help or tooltips. |
| **Total** | | **18/40** | **Poor — significant improvements needed** |

## Anti-Patterns Verdict

**Does it look AI-generated?** Yes. Not overwhelmingly — the voice is strong and the brutalist direction is correct — but several structural choices are template artifacts.

**LLM assessment**: The proof strip (three stats in mono font) is a hero-metric template. Every section opens with the same eyebrow treatment (eight instances). The five pillars use identical two-column layouts. The hero image is unrelated stock photography (glowing blue cybersecurity circuits). The capabilities and ICP grids are identical structures side by side.

**Deterministic scan**: 1 CLI finding — `overused-font` warning on Geist (soft recommendation, not blocking). No false positives.

## Overall Impression

The brand voice and brutalist design system are genuinely strong. The core problem is structural: mechanical repetition (eyebrows, numbered pillars, identical grids), template anti-patterns (hero-metric strip, glassmorphism card, stock photo), and excessive text density without progressive disclosure. The fix is not more words — it's architectural.

## What's Working

### 1. The Copywriting Voice Is Exceptional
"Nobody trusts the version." "Work gets paid for twice." "Not a file store. Not another DAM." Precise, opinionated, memorable. This is rare in landing pages and must be preserved.

### 2. The Brutalist Design System Is Well-Conceived
Zero border-radius, no shadows, 1px borders, tonal layering — a genuine point of view. The gap-px grid separator pattern is elegant and distinctive. The palette (void black + Archive Amber + Archive Slate) is restrained and on-brand.

### 3. The Comparison Table Is the Page's Best Structural Element
Three-column "Without / With" contrast is the most scannable, most persuasive element. It converts abstract value into concrete line-by-line contrast. Should be surfaced higher — above the five pillars.

## Priority Issues

### P0 — The Proof Strip Is a Hero-Metric Template
**What:** Lines 194-209. Three stats in a row: "∞ asset history preserved", "500+ prompts per campaign tracked", "0 minutes spent guessing". Big number + small label, three across.
**Why:** DESIGN.md explicitly bans this. Most identifiable pattern in AI-generated landing pages.
**Fix:** Delete the entire proof strip. If values are worth keeping, fold them into the comparison table or problem section as inline assertions.
**Suggested command:** `$impeccable polish`

### P0 — Hero Card Uses Glassmorphism / Backdrop-Blur
**What:** Lines 174-188. Floating card uses `bg-portals-surface-lowest/90 backdrop-blur-lg`. Translucent background with heavy blur.
**Why:** Two absolute bans violated: glassmorphism and backdrop-blur. DESIGN.md: "Don't use glassmorphism, backdrop-blur, or translucent surfaces."
**Fix:** Replace with solid `bg-portals-surface-lowest` card with 1px border. No transparency, no blur. Solid, opaque, brutalist object.
**Suggested command:** `$impeccable polish`

### P1 — Eyebrow Pattern Applied to Every Section
**What:** Eight instances of `text-lg lowercase tracking-widest text-portals-secondary mb-8`. Every section, no exception.
**Why:** DESIGN.md: "Don't put a tiny uppercase tracked eyebrow above every section." Using it eight times makes it structural wallpaper.
**Fix:** Keep for 2-3 key sections (Problem, Pricing, one other). Remove from Solution, Five Pillars, Comparison, ICPs.
**Suggested command:** `$impeccable quieter`

### P1 — Five Pillars Section Is Fatiguingly Repetitive
**What:** Lines 307-462. Five consecutive identical two-column layouts with numbered markers and three stacked feature cards.
**Why:** "Identical card grids" ban at macro level. By pillar 3, the pattern is exhausting.
**Fix:** Three options: (1) collapse to summary + detail on click, (2) vary the layout across pillars, (3) cut to three and fold the weakest into the rest.
**Suggested command:** `$impeccable distill`

### P2 — Comparison Table Has No Mobile Breakpoint
**What:** Line 478. `grid grid-cols-3` with no responsive variant. Three columns overflow on mobile.
**Why:** Breaks the page on phones — the most persuasive element becomes unreadable.
**Fix:** Add `md:grid-cols-3 grid-cols-1` for mobile-first responsive behavior.
**Suggested command:** `$impeccable adapt`

### P2 — Hero Image Is Unrelated Stock Photography
**What:** Line 165. Unsplash cybersecurity photo (glowing blue digital circuits). Zero relationship to AI creative production.
**Why:** Anti-references ban stock photography. Blue glow clashes with achromatic + amber palette.
**Fix:** Remove entirely. Replace with real product screenshot, real customer asset, or pure typographic hero. The copy is strong enough to carry without an image.
**Suggested command:** `$impeccable polish`

### P2 — Buttons Use rounded-md Contradicting Zero-Radius
**What:** button.tsx line 7. All buttons render with `rounded-md` (4px radius). Design system mandates zero.
**Why:** DESIGN.md: "Zero border-radius (0px). Sharp corners, always."
**Fix:** Remove `rounded-md` from button CVA base classes.
**Suggested command:** `$impeccable polish`

## Persona Red Flags

### Creative Director at an AI Agency (non-technical)
- Five pillars section uses developer-architecture language ("Repository," "Identity," "Provenance") without visual relief. A CD thinks in campaigns and deliverables.
- "Read Docs" is a technical affordance. A CD wants "See it in action" or "Watch a demo."
- Proof strip numbers ("500+ prompts per campaign tracked") require domain interpretation.

### VP of Production at a Game Studio (technical, time-poor)
- 1,500+ words before pricing. No executive summary shortcut.
- No social proof beyond one Variety quote. No customer logos, no case studies.
- "Request Access" implies a waitlist — signals "not ready for production."

### AI Engineer / Technical Lead (evaluating tooling)
- "API-first" mentioned but zero technical detail — no API reference, no example endpoint.
- "Model-agnostic by design" is a claim without proof.
- "Read Docs" link destination undefined.

## Minor Observations

1. Header anchor links broken — `#pillars` links to nothing. Only `#pricing` works.
2. "Most Popular" badge uses wrong color (slate instead of amber).
3. `muted-foreground` at 35% lightness fails WCAG AA (3.8:1 vs 4.5:1 required).
4. Six instances of `text-white` should use `text-foreground` for token consistency.
5. Comparison table lacks semantic `<table>` markup — screen readers can't parse it.
6. Hero background image has no accessible name (no role="img", no aria-label).
7. The `∞` symbol is decorative and meaningless without context.

## Questions to Consider

1. Is the five-pillars structure earning its place, or is it a product spec pasted into a landing page? A single real product screenshot might communicate more than 1,500 words of pillar descriptions.
2. Should the comparison table come BEFORE the pillars? It's the most persuasive element but appears after 460 lines of content.
3. What is the actual conversion path? "Request Access" has no form, no expectation-setting, no confirmation. Waitlist? Demo call? Instant access?
4. The page has no images of the actual product. For a tool that manages visual assets, this is conspicuous.
