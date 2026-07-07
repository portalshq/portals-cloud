# @portals/capability-narrative-engine-adapter

Same posture as `@portals/resolver`: this does not reimplement the Narrative
Engine. It exists so the proven v0 engine (already running in studio-app
and 25thChapter) is reachable through the standard capability contract,
which is what lets `realtime-fanout`, `video-delivery`, and
`text-image-delivery` all branch on narrative state without each
implementing their own integration with the engine.
