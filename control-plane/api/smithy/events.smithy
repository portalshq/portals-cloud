//! Event definitions for the control plane event bus.

$version: "2.0"

namespace lorecloud.controlplane.events

use smithy.api#documentation

/// Platform event base.
union PlatformEvent {
    OrganizationCreated: OrganizationCreatedEvent,
    OrganizationDeleted: OrganizationDeletedEvent,
    RepositoryProvisioned: RepositoryProvisionedEvent,
    RepositoryUpdated: RepositoryUpdatedEvent,
    RepositoryDeleted: RepositoryDeletedEvent,
    SessionScheduled: SessionScheduledEvent,
    SessionStarted: SessionStartedEvent,
    SessionDrained: SessionDrainedEvent,
    CapabilityDeployed: CapabilityDeployedEvent,
    BillingAnchored: BillingAnchoredEvent,
    QuotaExceeded: QuotaExceededEvent,
    Audit: AuditEvent,
}

/// Organization created event.
structure OrganizationCreatedEvent {
    @required
    @jsonName("id")
    id: String,
    
    @required
    @jsonName("provisioned_at")
    provisionedAt: Timestamp,
}

/// Organization deleted event.
structure OrganizationDeletedEvent {
    @required
    @jsonName("id")
    id: String,
}

/// Repository provisioned event.
structure RepositoryProvisionedEvent {
    @required
    @jsonName("id")
    id: String,
    
    @required
    @jsonName("provisioned_at")
    provisionedAt: Timestamp,
}

/// Repository updated event.
structure RepositoryUpdatedEvent {
    @required
    @jsonName("id")
    id: String,
}

/// Repository deleted event.
structure RepositoryDeletedEvent {
    @required
    @jsonName("id")
    id: String,
}

/// Session scheduled event.
structure SessionScheduledEvent {
    @required
    @jsonName("session_id")
    sessionId: String,
    
    @required
    @jsonName("channel_id")
    channelId: String,
}

/// Session started event.
structure SessionStartedEvent {
    @required
    @jsonName("session_id")
    sessionId: String,
}

/// Session drained event.
structure SessionDrainedEvent {
    @required
    @jsonName("session_id")
    sessionId: String,
}

/// Capability deployed event.
structure CapabilityDeployedEvent {
    @required
    id: String,
    
    @required
    target: String,
}

/// Billing anchored event.
structure BillingAnchoredEvent {
    @required
    @jsonName("org_id")
    orgId: String,
    
    @required
    @jsonName("billing_plan")
    billingPlan: String,
}

/// Quota exceeded event.
structure QuotaExceededEvent {
    @required
    @jsonName("resource_kind")
    resourceKind: String,
    
    @required
    @jsonName("org_id")
    orgId: String,
    
    @required
    quota: String,
}

/// Audit event.
structure AuditEvent {
    @required
    @jsonName("event_type")
    eventType: String,
    
    @required
    @jsonName("resource_id")
    resourceId: String,
    
    @required
    @jsonName("resource_kind")
    resourceKind: String,
    
    @required
    @jsonName("actor")
    actor: String,
    
    @required
    @jsonName("timestamp")
    timestamp: Timestamp,
    
    @jsonName("context")
    context: Document,
}
