# Instruction: move the PX landing page to `../px`, serve it canonically from `portals.works/px`

Execute end-to-end. Two repos, one public URL. Do not stop halfway: a moved page
without the proxy (or a proxy without the canonical flip) splits SEO equity.

## 0. Objective

- **Single source of truth:** the PX landing page lives in the `../px` repo
  (`portalshq/narrativeengine`, sibling of this repo) as a zero-build static
  site in `site/`, deployed to GitHub Pages.
- **Single public URL:** `https://portals.works/px`, served by this repo's
  Next.js app via reverse proxy (rewrite, NOT redirect). Address bar never
  changes; all backlinks keep working with zero hops.
- **Design fidelity:** all styles, themes, fonts, and design language intact.
- **SEO:** every crawler-facing signal (canonical, OG, JSON-LD, sitemap,
  backlinks, image URLs) consolidates on `portals.works/px`. The
  `*.github.io` origin is deployment plumbing and must never appear in any
  public surface.

Non-goals: no visual redesign, no new routes, no CNAME/DNS changes, no custom
domain. No `redirects()` entry for `/px` (a redirect would defeat the proxy).

## 1. Starting state (verify first)

- Working directory for THIS repo: its root (the one containing `frontend/`).
  Confirm `frontend/app/(marketing)/px/page.tsx` exists.
- Sibling checkout `../px` must exist and map to the right remote. Verify:
  `git -C ../px remote -v` shows `portalshq/narrativeengine`, then
  `git -C ../px pull --ff-only origin main`. It already contains `site/` and
  `.github/workflows/pages.yml` from prior work — extend, don't recreate.
- Confirm `frontend/next.config.ts` has `trailingSlash: true` (affects §5).

## 2. Source inventory (this repo → `../px/site/`)

Port exactly this, nothing else:

| Target in `../px/site/` | Source in this repo (`frontend/`) | Notes |
|---|---|---|
| `index.html` | `app/(marketing)/px/page.tsx` (title, description, keywords, JSON-LD) + `src/components/px/PxLandingPage.tsx` with `chrome="standalone"` (brand links to `#top`, NOT `/`; "Explore Portals" footer links to `https://portals.works`) | Copy flattened to static HTML; keep all copy, anchors (`#how-it-works`, `#bears`, `#install`), ARIA roles, `details[open]` on first accordion item |
| `styles.css` | Tokens from `app/globals.css` `@theme` (`--spacing: .0625rem` ⇒ 1 unit = 1px; `--radius-sm: 3px`); `t-*` type rules copied **verbatim** with their fluid `clamp()` vars from compiled `src/saga.css`; sections from `src/components/px/PxLandingPage.module.css` (rename `.page`→`.px-page` etc.); hand-resolved Tailwind utility subset the component uses | Header comment must keep this source-mapping table |
| `script.js` | `src/components/px/PxCodeBlock.tsx` copy-button behavior (clipboard + `execCommand` fallback, "Copied" reverts after 1600ms) | Wire via `data-copy` → `<code id>` |
| `fonts/*.woff2` | `public/fonts/` — copy these 6, renamed: `die_grotesk_b_regular-*.woff2`→`die-grotesk-b-regular.woff2`, `die_grotesk_b_medium-*`→`die-grotesk-b-medium.woff2`, `die_grotesk_c_regular-*`→`die-grotesk-c-regular.woff2`, `aeonikfono_regular-*`→`aeonik-fono-regular.woff2`, `STKBureauSerif_Book-*`→`stk-bureau-book.woff2`, `STKBureauSerif_Light-*`→`stk-bureau-light.woff2` | Keep `public/fonts/` here untouched (rest of marketing site uses them) |
| `favicon.svg` | **Create new** minimal PX mark (yellow `#efdc3d` rounded square, black `px` glyph) | Do NOT reuse `public/favicon.svg` (portals product chrome) |
| `og-image.svg` | Static port of `app/(marketing)/px/opengraph-image.tsx` (1200×630, dark `#0b110d` scene, `PX / BY PORTALS` header, giant `px`, tagline, lime strap line; Arial is fine for crawler rendering) | |
| `.nojekyll` | New, empty | Required so Pages serves files verbatim |
| `README.md` | New: what the export is, the table above, preview via `npx serve site`, deploy via workflow, "update `<code>` blocks when `../px/docs/authored/` changes" | |

Code samples for `#install` must equal `src/lib/px-content.ts`
(`getPxTechnicalContent()`) evaluated against `../px/docs/authored/`:
install = first bash block after `### Installation Script` in
`installation.md`; skills = first bash block after `### Skills Install`;
initialize = `px init bears --provider local` + blank + the two `lonnie`
comment/create lines (hardcoded in that function); representations = first 2
lines of the bash block after `### Scene Clips as Representations` in
`primitives.md`; MCP paragraph = first prose paragraph after `## MCP Server`
in `mcp/overview.md`; TS SDK = `import {repoCreateEntity} from`
`'${name from typescript/px-sdk/package.json}'` + `const lonnie = …`;
Python SDK = `from px_sdk import repo_create_entity` + `lonnie = …`.
HTML-escape code contents.

**Drop with prejudice:** `PxWebGLTheme.tsx` (hooks into this repo's Saga
canvas; nonexistent standalone — replace with nothing), `styles.card` and
`styles.sagaBannerFrame` (referenced in the component but have NO rule in the
CSS module — they render as `undefined` class names today; omitting them is
pixel-identical, document this in the stylesheet).

## 3. Images: source from the portals marketing site

- Binary assets are copied FROM this repo's `frontend/public/` (single origin,
  §2 table). Never invent replacements.
- Every crawler-facing image URL must be absolute on the canonical domain:
  `og:image` / `twitter:image` =
  `https://portals.works/px/og-image.svg` (absolute is required for crawlers).
- In-page assets (`styles.css`, `fonts/`, favicon) stay **relative**
  (`./…`) so they resolve to `portals.works/px/…` through the proxy AND keep
  working on the Pages origin during preview.
- Never publish, link, or hotlink the `*.github.io` origin anywhere (see §6).

## 4. Canonical SEO contract (all in `../px/site/index.html`)

- `<link rel="canonical" href="https://portals.works/px">`
- `og:url` = `https://portals.works/px`; `og:image`/`twitter:image` per §3.
- JSON-LD keeps both nodes from `page.tsx`, repointed:
  `SoftwareApplication.url` → `https://portals.works/px`;
  `BreadcrumbList`: Portals → `https://portals.works`, PX →
  `https://portals.works/px`.
- One `h1` per page (the `px` wordmark). Title/description unchanged.

## 5. Reverse proxy (this repo, `frontend/next.config.ts`)

- Add to `rewrites()` (NOT `redirects()`):
  `{ source: '/px/:path*', destination: 'https://portalshq.github.io/narrativeengine/:path*' }`
- **Delete** `frontend/app/(marketing)/px/` (`page.tsx`,
  `opengraph-image.tsx`): a local route takes precedence over an `afterFiles`
  rewrite and would shadow the proxy. This is a backend change, not a URL
  deletion — do NOT add a `redirects()` entry (AGENTS.md's redirect rule is
  for removed URLs; `/px` stays live).
- Delete now-dead code: `frontend/src/components/px/`,
  `frontend/src/lib/px-content.ts`. Keep `frontend/public/fonts/`.
- Keep the `/px` sitemap entry (URL is still live and canonical). All
  existing internal links to `/px` keep working untouched; they must point at
  `/px` directly, never through to the github.io origin.
- `npm run typecheck` must stay green.

## 6. Public-surface sweep (both repos)

`grep -r "portalshq.github.io\|github.io/narrativeengine"` across both repos
and `../px/docs`, `../px/README.md`, release notes. Every PUBLIC hit
(docs, READMEs, badges, install guides) must link
`https://portals.works/px`. The ONLY allowed github.io references are the
rewrite destination in `next.config.ts`, the workflow's deploy mechanics, and
a one-line note in `../px/site/README.md` naming the origin host.

## 7. Deploy + verify (in order, stop on red)

1. Commit + push `../px/site/` (and workflow if touched); wait for the
   `Deploy site to GitHub Pages` run to succeed. If the run fails on Pages
   enablement, enable via API (`POST repos/portalshq/narrativeengine/pages`,
   `build_type: workflow`) and re-run failed jobs — do not switch to branch
   publishing.
2. Serve locally: every file in §2 table returns 200 (`index.html`,
   `styles.css`, `script.js`, `favicon.svg`, `og-image.svg`, all 6 fonts).
3. Class coverage: every token in `index.html` `class="…"` attributes resolves
   to a rule in `styles.css` (script it; only `group` is intentionally
   rule-less).
4. Deploy this repo's proxy change; then:
   `curl -sI https://portals.works/px` → **200, not 301/308** (a 3xx means a
   redirect leaked in — fix before proceeding).
   `curl -s https://portals.works/px | grep -o '<link rel="canonical"[^>]*>'`
   → exactly `https://portals.works/px`.
5. Browser check: address bar stays `portals.works/px` on load and after
   anchor/copy/accordion interaction; no console 404s (fonts!); copy buttons
   flip to "Copied"; accordions toggle; mobile (≤768px) single-column,
   desktop (≥1024px) multi-column grids; `prefers-reduced-motion` kills the
   scan animation.
6. Validators: OG/Twitter card validator renders `og-image.svg`; JSON-LD
   parses (Rich Results test); confirm no `github.io` URL is indexed or
   linked publicly (§6 grep is clean).

## 8. Definition of done

`../px/site/` is the only page source · proxy serves 200 at the unchanged
URL · canonical/OG/JSON-LD/sitemap all name `portals.works/px` · zero public
github.io references · address bar stable · typecheck green · both Pages and
site workflows green · page visually identical to today's `/px` (hero,
world-art, banners, band, 5 numbered sections, footer).
