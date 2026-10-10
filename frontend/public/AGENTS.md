# Saga WebGL animation presets

This directory contains `saga-webgl.js`, the source of truth for the animated color field. A preset describes a palette and which scene layers render; the camera and scroll markers continue to control motion. Keep these names and descriptions aligned with the constants and `SECTION_RAMPS` entries in that file.

| Name | Engine state | Appearance and use |
| --- | --- | --- |
| **Electric Bloom** | `DEFAULT_*` | Standard hero and non-overview state: indigo and cobalt flow into violet with pink highlights. Used on the homepage and routes without a theme marker. |
| **Assessment Bloom** | `DEFAULT_*` + assessment markers | Assessment route variant of Electric Bloom: the same indigo, cobalt, violet, and pink palette, framed with UV shift `0.52` and scrubbed from scene position `0` to `0.96`. The distinct name identifies the route's animation configuration; it does not add a separate color palette. |
| **Violet Veil** | `SECTION_RAMPS[0]` | First overview quarter: the standard blue-violet ramps over a brighter violet background. |
| **Orchid Drift** | `SECTION_RAMPS[1]` | Second overview quarter: cobalt grades gradually through purple into orchid pink. |
| **Cobalt Flow** | `SECTION_RAMPS[2]` | Third overview quarter: a deeper cobalt and periwinkle field with restrained magenta accents. |
| **Sea Glass** | `SECTION_RAMPS[3]` | Final overview quarter: cool blue moves through muted mint and green. |
| **Golden Signal** | `PX_*` | Black and warm yellow PX palette. The engine supports `data-webgl-theme="px"` or `window.__sagaPxTheme`; no current page activates it. |
| **Dark Void** | `DARK_VOID_*` | The near-black, deep-navy look in the historical homepage reference. It keeps the background shader's subtle motion and hides the bright mesh. Select with `data-webgl-theme="dark-void"` present when the engine starts; no current page activates it. |

The reference for **Dark Void** came from a failed mesh shader, so the original effect was accidental. The named preset reproduces that restrained appearance with a working shader. The unthemed homepage continues to use **Electric Bloom**. The CSS fallback color `#010528` is separate from these live animation presets.
