# @portals/contracts

The schema layer every other package depends on. Nothing here has runtime
behavior — it's types and zod schemas only, so it can be imported by the
registry, the runtime, every capability package, and the SDK without any
of them depending on each other.

If you're adding a new capability type, start here: define what its input/
output/permissions look like before writing the implementation package.
