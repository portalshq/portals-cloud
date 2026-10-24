<!-- doc-module: realtime-fanout-postgres-agent-guide -->
# Postgres realtime fanout: agent guide
## Load when
Running realtime fan-out across multiple processes, or when messages must survive process restarts.
## Use
Apply `sql/001_fanout_messages.sql`, then pass a caller-owned `pg.Pool` to `createPostgresFanoutBus`. Subscribers start at the current head of a topic; they never replay the backlog.
## Do not assume
Sub-second delivery (the poll interval is 1s), at-most-once delivery (a failed handler causes redelivery), automatic table cleanup, or that `close()` ends the pool.
