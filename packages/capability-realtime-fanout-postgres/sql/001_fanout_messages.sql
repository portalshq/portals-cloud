-- Durable fan-out message log for @portalshq/capability-realtime-fanout-postgres
--
-- Messages are appended per topic and polled by subscribers. Subscribers begin
-- at the current head of the topic, so only newly published rows are delivered.
--
-- Migration: 001_fanout_messages.sql
-- Version: 0.1.0

CREATE TABLE IF NOT EXISTS fanout_messages (
  id bigserial PRIMARY KEY,
  topic text NOT NULL,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fanout_messages_topic_id ON fanout_messages (topic, id);
