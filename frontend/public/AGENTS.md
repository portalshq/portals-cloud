# Saga WebGL animation presets

This directory contains `saga-webgl.js`, the source of truth for the animated color field. A preset describes a palette and which scene layers render; the camera and scroll markers continue to control motion. Keep these names and descriptions aligned with the constants and `SECTION_RAMPS` entries in that file.

| Name | Engine state | Appearance and use |
| --- | --- | --- |
| **Electric Bloom** | `DEFAULT_*` | Standard hero treatment: indigo and cobalt flow into violet with pink highlights. Used before the homepage's post-Overview transition and on routes without a more specific preset. |
| **Post Overview Flow** | `DEFAULT_*` + `uFlowMix = 1` + scene position `0.96` | The homepage treatment after the first viewport beyond Overview: seamless moving blobs without the bright cyan paint, over the default indigo, cobalt, and violet field. Use on `/production-memory`, `/use-cases` and its detail pages, and `/blog` and its article pages. The footer retains its shared blur treatment. |
| **Assessment Flow** | `DEFAULT_*` + assessment markers + `uFlowMix = 1` | The `/assessment` route uses the seamless flowing blob geometry with the standard indigo, cobalt, violet, and pink ramps. It starts in this treatment, without the bright cyan paint. Its markers frame the scene with UV shift `0.52` and scrub position `0` to `0.96`. |
| **Violet Veil** | `SECTION_RAMPS[0]` | First overview quarter: the standard blue-violet ramps over a brighter violet background. |
| **Orchid Drift** | `SECTION_RAMPS[1]` | Second overview quarter: cobalt grades gradually through purple into orchid pink. |
| **Cobalt Flow** | `SECTION_RAMPS[2]` | Third overview quarter: a deeper cobalt and periwinkle field with restrained magenta accents. |
| **Sea Glass** | `SECTION_RAMPS[3]` | Final overview quarter: cool blue moves through muted mint and green. |
| **Golden Signal** | `PX_*` | Black and warm yellow PX palette. The engine supports `data-webgl-theme="px"` or `window.__sagaPxTheme`; no current page activates it. |
| **Dark Void** | `DARK_VOID_*` | The near-black, deep-navy look in the historical homepage reference. It keeps the background shader's subtle motion and hides the bright mesh. Select with `data-webgl-theme="dark-void"` present when the engine starts; no current page activates it. |

The homepage fades from its bright treatment into Post Overview Flow over the first viewport after the Overview boundary. That geometry samples the active section ramps and wraps its horizontal noise at the mesh edge so no vertical seam appears. On `/assessment`, it uses the default ramps from the start. The UV shift is updated when the route changes, so moving between `/` and `/assessment` retains each page's framing. Privacy Policy, Terms of Service, and Contact use the same default ramps and scene at position `0.96` and omit the poster image while WebGL loads; they do not use the flowing blob geometry.

The reference for **Dark Void** came from a failed mesh shader, so the original effect was accidental. The named preset reproduces that restrained appearance with a working shader. The unthemed homepage continues to use **Electric Bloom**. The CSS fallback color `#010528` is separate from these live animation presets.
