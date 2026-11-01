export type Value = string | number | boolean | null;
export type Properties = Readonly<Record<string, Value>>;
export type PropertyRule = { type: "number" | "boolean" } | { type: "enum"; values: readonly string[] } | { type: "string"; maxLength: number; pattern: string };
export interface EventDefinition {
  name: string;
  purpose: string;
  version: number;
  properties: Readonly<Record<string, PropertyRule>>;
}
export interface Identity { anonymousId?: string; userId?: string }
/** Supplied by the trusted application or source integration. */
export interface Attribution { tenantId: string; appId: string }
export interface Observation {
  id: string;
  name: string;
  version: number;
  occurredAt: string;
  provenance: "client" | "server";
  properties: Properties;
  identity?: Identity;
  attribution?: Attribution;
}
export interface Sink {
  send(events: readonly Observation[]): Promise<void>;
  identify?(identity: Identity): Promise<void>;
  reset?(): void | Promise<void>;
}

export class Registry {
  private definitions = new Map<string, EventDefinition>();
  registerCustom(definition: EventDefinition): void {
    if (!/^custom\.[a-z][a-z0-9_.]{0,79}$/.test(definition.name)) throw new Error("Custom events require a custom. namespace");
    if (!definition.purpose.trim() || !Number.isInteger(definition.version) || definition.version < 1 || this.definitions.has(definition.name)) throw new Error("Invalid or duplicate event definition");
    for (const [key, rule] of Object.entries(definition.properties)) {
      if (!/^[a-z][a-z0-9_]{0,63}$/.test(key)) throw new Error("Invalid property definition");
      if (rule.type === "enum" && (!rule.values.length || rule.values.some(v => !/^[a-z0-9_.-]{1,64}$/.test(v)))) throw new Error("Invalid enum definition");
      if (rule.type === "string") {
        if (!Number.isInteger(rule.maxLength) || rule.maxLength < 1 || rule.maxLength > 128 || rule.pattern.length > 128) throw new Error("Invalid string definition");
        new RegExp(rule.pattern);
      }
    }
    this.definitions.set(definition.name, structuredClone(definition));
  }
  validate(name: string, properties: Properties): EventDefinition {
    const definition = this.definitions.get(name);
    if (!definition) throw new Error("Unregistered event");
    for (const key of Object.keys(definition.properties)) {
      if (!Object.hasOwn(properties, key)) throw new Error(`Missing property: ${key}`);
    }
    for (const [key, value] of Object.entries(properties)) {
      const rule = definition.properties[key];
      const valid = rule && (rule.type === "enum" ? typeof value === "string" && rule.values.includes(value) : rule.type === "string" ? typeof value === "string" && value.length <= rule.maxLength && new RegExp(rule.pattern).test(value) : typeof value === rule.type && (typeof value !== "number" || Number.isFinite(value)));
      if (!valid) throw new Error(`Invalid property: ${key}`);
    }
    return definition;
  }
}
