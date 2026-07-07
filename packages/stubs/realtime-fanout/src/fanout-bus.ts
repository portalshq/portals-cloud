/**
 * The single real-time primitive chat, polls, and lobby controls are all
 * built on. Per the platform economics review: audience-member marginal
 * cost is dominated by fan-out volume, so this stays one mechanism instead
 * of three separately-scaled services.
 *
 * Backed by NATS JetStream in the reference deployment (see
 * infra/k8s/base/nats-jetstream.yaml) — chosen because it's lightweight,
 * self-hostable on Linode/LKE with no managed-service tax, and fits a
 * cloud-agnostic target better than AWS SNS/SQS would.
 */
export interface FanoutBus {
  publish(topic: string, message: unknown): Promise<void>;
  subscribe(topic: string, handler: (message: unknown) => void): Promise<() => void>;
}

export class NatsFanoutBus implements FanoutBus {
  // TODO: wire to NATS JetStream client
  async publish(topic: string, message: unknown): Promise<void> {
    throw new Error("NatsFanoutBus.publish: not yet wired to NATS");
  }
  async subscribe(topic: string, handler: (message: unknown) => void): Promise<() => void> {
    throw new Error("NatsFanoutBus.subscribe: not yet wired to NATS");
  }
}
