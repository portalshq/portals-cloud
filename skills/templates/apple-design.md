---
name: apple-design
description: Apply Apple's interaction-design principles to web interfaces: direct manipulation, responsive feedback, physical motion, restraint, and reduced-motion support.
---

# Apple Design for Web

Use this for interactive interfaces, not Apple visual imitation. Preserve the product's existing typography, colors, and brand.

- Make controls respond immediately to touch, pointer, keyboard, and focus. Motion should clarify cause and effect, not decorate static layouts.
- Prefer CSS and platform behavior before JavaScript animation. Use interruptible transforms and opacity; avoid layout animation when it is not necessary.
- Make spatial transitions continuous: sheets come from their trigger, panels retain context, and drag interactions track the pointer directly.
- Use readable hierarchy, generous hit targets, predictable focus, and visible pressed/loading/error states.
- Respect `prefers-reduced-motion`; preserve the state change without the movement.
- Validate desktop and mobile behavior before considering an interaction complete.
