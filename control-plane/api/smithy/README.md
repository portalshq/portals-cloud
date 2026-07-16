# Smithy API Models

This directory contains Smithy IDL definitions for the LoreCloud Control Plane API.

## Structure

- `lorecloud.smithy` — Core resource types, operations, and error models
- `events.smithy` — Event definitions for the event bus

## Building

To generate code from these models, use the Smithy CLI:

```bash
# Generate Rust server code
smithy build --config smithy-build.json

# Generate TypeScript client code
smithy build --config smithy-build-ts.json
```

## Adding New Resources

When adding a new resource type:

1. Add the resource kind to the `ResourceKind` enum in `lorecloud.smithy`
2. Define the resource structure with spec and phase
3. Add the spec structure
4. Add the phase enum
5. Add corresponding events to `events.smithy` if needed

## Versioning

API changes should be versioned by updating the service version in the Smithy models.
