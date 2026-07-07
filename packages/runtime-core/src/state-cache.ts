import { EventEmitter } from "node:events";

export interface CacheEntry<T> {
  value: T;
  updatedAt: number;
}

export type ChangeListener<T> = (
  key: string,
  value: T | undefined,
  previous: T | undefined,
) => void;

/**
 * Generic in-memory, write-through cache keyed by string id (channel id,
 * session id, etc).
 *
 * This deliberately has NO TTL. A TTL shorter than (or close to) your
 * polling/tick interval silently defeats the cache -- every read falls
 * through to the database on every tick, which is exactly the bug this
 * package exists to fix. Entries here are authoritative until a caller
 * explicitly calls `set()` (after a successful durable write) or
 * `invalidate()` (explicit cache-bust, e.g. admin override / process
 * restart warm-up).
 *
 * Swappable: if a single Node process ever stops being enough (horizontal
 * scaling), replace this module with a Redis-backed implementation behind
 * the same get/set/has/invalidate/onChange interface. Nothing upstream
 * needs to change.
 */
export class StateCache<T> {
  private store = new Map<string, CacheEntry<T>>();
  private emitter = new EventEmitter();

  get(key: string): T | undefined {
    return this.store.get(key)?.value;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }

  /** Returns how long ago (ms) this entry was last written, or undefined if absent. */
  age(key: string): number | undefined {
    const entry = this.store.get(key);
    return entry ? Date.now() - entry.updatedAt : undefined;
  }

  set(key: string, value: T): void {
    const previous = this.store.get(key)?.value;
    this.store.set(key, { value, updatedAt: Date.now() });
    this.emitter.emit("change", key, value, previous);
  }

  invalidate(key: string): void {
    const previous = this.store.get(key)?.value;
    if (previous === undefined && !this.store.has(key)) return;
    this.store.delete(key);
    this.emitter.emit("change", key, undefined, previous);
  }

  keys(): string[] {
    return [...this.store.keys()];
  }

  values(): T[] {
    return [...this.store.values()].map((e) => e.value);
  }

  entries(): Array<[string, T]> {
    return [...this.store.entries()].map(([k, e]) => [k, e.value]);
  }

  /** Fires whenever any key changes. Used e.g. to drive an instant-redirect registry. */
  onChange(listener: ChangeListener<T>): () => void {
    this.emitter.on("change", listener);
    return () => this.emitter.off("change", listener);
  }
}
