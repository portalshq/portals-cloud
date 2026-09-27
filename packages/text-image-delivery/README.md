# @portalshq/capability-text-image-delivery

**Reusable agent module:** [integration guide](../../docs/package-agents/text-image-delivery.md)

Type surface for sequential text-and-image chapters.

```ts
import { ChapterFeed } from "@portalshq/capability-text-image-delivery";

await new ChapterFeed().listChapters(narrativeRef);
```

## Exported shape

- `Chapter`: `chapterId`, `order`, `title`, `text`, and `imageRefs`.
- `ChapterFeed.getChapter(narrativeRef, chapterId)`.
- `ChapterFeed.listChapters(narrativeRef)`.

## Status: stub

Both `ChapterFeed` methods always throw. The package does not yet connect to `@portalshq/capability-narrative-engine-adapter`, storage, or a content-delivery implementation. Use its types for design work only; do not depend on it at runtime.
