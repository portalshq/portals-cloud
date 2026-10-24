# @portalshq/capability-realtime-fanout-postgres

PostgreSQL-backed durable fanout bus for Portals applications.

## Overview

This package provides a durable `FanoutBus` implementation backed by PostgreSQL. It offers:
- **Durable message delivery**: Messages survive process restarts
- **Cross-process delivery**: Multiple instances can see the same messages
- **Low-cost durability**: Reuses existing PostgreSQL database
- **Simple polling**: 1-second polling interval (appropriate for current scale)

## Usage

```typescript
import { createPostgresFanoutBus } from '@portalshq/capability-realtime-fanout-postgres';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const bus = createPostgresFanoutBus(pool, { batchSize: 100 });

// Publish messages
await bus.publish('chat', { message: 'Hello, world!' });

// Subscribe to messages
const unsubscribe = await bus.subscribe('chat', (message) => {
  console.log('Received:', message);
});

// Cleanup
unsubscribe();
await bus.close();
```

## Schema

The package requires a `fanout_messages` table. Apply the migration shipped in
[`sql/001_fanout_messages.sql`](./sql/001_fanout_messages.sql):

```sql
CREATE TABLE IF NOT EXISTS fanout_messages (
  id bigserial PRIMARY KEY,
  topic text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fanout_messages_topic_id ON fanout_messages (topic, id);
```

## Configuration

### batchSize (optional)
Maximum number of messages to fetch per poll. Default: 100.

```typescript
const bus = createPostgresFanoutBus(pool, { batchSize: 50 });
```

## Polling vs NOTIFY/LISTEN

This implementation uses polling (1-second interval) because:
- Simple and robust implementation
- No additional infrastructure required
- Appropriate for current traffic levels

NOTIFY/LISTEN could be added in the future for lower latency at higher scale.

## See Also

- `@portalshq/capability-realtime-fanout` - The FanoutBus interface
