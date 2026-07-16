//! LoreCloud Control Plane API — Smithy IDL definitions.
//!
//! This file defines the API surface for the control plane, including
//! resource types, operations, and error models.

$version: "2.0"

namespace lorecloud.controlplane

use smithy.api#documentation
use smithy.api#error
use smithy.api#http
use smithy.api#httpHeader
use smithy.api#httpLabel
use smithy.api#httpQuery
use smithy.api#httpStatusCode
use smithy.api#jsonName

/// Resource identifier — opaque string identifier for all resources.
@string(length: [1, 256])
@pattern("^[a-zA-Z0-9-]+$")
string ResourceId

/// Resource kind enumeration.
enum ResourceKind {
    Organization
    Repository
    StorageAllocation
    ComputeInstance
    Namespace
    Endpoint
    Secret
    Channel
    World
    Session
    CapabilityDeployment
    NAPResolver
    AudienceSession
    RuntimeScheduling
    BillingAnchor
    QuotaState
    AuditLog
}

/// Owner reference for garbage collection.
structure OwnerReference {
    @required
    id: ResourceId,
    
    @required
    kind: ResourceKind,
}

/// Base resource structure.
structure Resource {
    @required
    id: ResourceId,
    
    @required
    version: Integer,
    
    @required
    @httpLabel("kind")
    kind: ResourceKind,
    
    @required
    finalizers: List<String>,
    
    @required
    deletionRequested: Boolean,
    
    @required
    ownerRefs: List<OwnerReference>,
    
    @required
    createdAt: Timestamp,
    
    @required
    updatedAt: Timestamp,
}

/// Organization resource.
structure Organization {
    @required
    id: ResourceId,
    
    @required
    version: Integer,
    
    @required
    kind: ResourceKind,
    
    @required
    finalizers: List<String>,
    
    @required
    deletionRequested: Boolean,
    
    @required
    ownerRefs: List<OwnerReference>,
    
    @required
    createdAt: Timestamp,
    
    @required
    updatedAt: Timestamp,
    
    @required
    @jsonName("spec")
    spec: OrganizationSpec,
    
    @required
    @jsonName("phase")
    phase: OrganizationPhase,
}

/// Organization specification.
structure OrganizationSpec {
    @required
    name: String,
    
    @required
    @jsonName("display_name")
    displayName: String,
    
    @required
    @jsonName("billing_plan")
    billingPlan: String,
}

/// Organization phase.
enum OrganizationPhase {
    Pending
    Provisioning
    Ready
    Failed
    Deleting
}

/// Repository resource.
structure Repository {
    @required
    id: ResourceId,
    
    @required
    version: Integer,
    
    @required
    kind: ResourceKind,
    
    @required
    finalizers: List<String>,
    
    @required
    deletionRequested: Boolean,
    
    @required
    ownerRefs: List<OwnerReference>,
    
    @required
    createdAt: Timestamp,
    
    @required
    updatedAt: Timestamp,
    
    @required
    @jsonName("spec")
    spec: RepositorySpec,
    
    @required
    @jsonName("phase")
    phase: RepositoryPhase,
    
    handle: RepositoryHandle,
}

/// Repository specification.
structure RepositorySpec {
    @required
    name: String,
    
    @required
    @jsonName("organization_id")
    organizationId: ResourceId,
    
    @required
    @jsonName("storage_class")
    storageClass: String,
    
    @required
    region: String,
    
    tags: Map<String, String>,
}

/// Repository phase.
enum RepositoryPhase {
    Pending
    Provisioning
    Ready
    Updating
    Failed
    Deleting
}

/// Repository handle from provider.
structure RepositoryHandle {
    @required
    id: ResourceId,
    
    @required
    @jsonName("bucket_name")
    bucketName: String,
    
    @required
    region: String,
    
    @required
    arn: String,
    
    @required
    @jsonName("created_at")
    createdAt: Timestamp,
}

/// Session resource.
structure Session {
    @required
    id: ResourceId,
    
    @required
    version: Integer,
    
    @required
    kind: ResourceKind,
    
    @required
    finalizers: List<String>,
    
    @required
    deletionRequested: Boolean,
    
    @required
    ownerRefs: List<OwnerReference>,
    
    @required
    createdAt: Timestamp,
    
    @required
    updatedAt: Timestamp,
    
    @required
    @jsonName("spec")
    spec: SessionSpec,
    
    @required
    @jsonName("phase")
    phase: SessionPhase,
}

/// Session specification.
structure SessionSpec {
    @required
    @jsonName("channel_id")
    channelId: ResourceId,
    
    @required
    @jsonName("scheduled_start")
    scheduledStart: Timestamp,
    
    @required
    @jsonName("scheduled_end")
    scheduledEnd: Timestamp,
    
    @required
    @jsonName("max_audience")
    maxAudience: Integer,
}

/// Session phase.
enum SessionPhase {
    Scheduled
    Starting
    Running
    Draining
    Terminated
    Failed
}

/// Channel resource.
structure Channel {
    @required
    id: ResourceId,
    
    @required
    version: Integer,
    
    @required
    kind: ResourceKind,
    
    @required
    finalizers: List<String>,
    
    @required
    deletionRequested: Boolean,
    
    @required
    ownerRefs: List<OwnerReference>,
    
    @required
    createdAt: Timestamp,
    
    @required
    updatedAt: Timestamp,
    
    @required
    @jsonName("spec")
    spec: ChannelSpec,
    
    @required
    @jsonName("phase")
    phase: ChannelPhase,
}

/// Channel specification.
structure ChannelSpec {
    @required
    name: String,
    
    @required
    capabilities: List<ResourceId>,
    
    @required
    @jsonName("composition_graph")
    compositionGraph: Document,
}

/// Channel phase.
enum ChannelPhase {
    Pending
    Composed
    Failed
}

/// Create resource request.
structure CreateResourceRequest {
    @required
    kind: ResourceKind,
    
    @required
    spec: Document,
    
    @jsonName("owner_refs")
    ownerRefs: List<OwnerReference>,
}

/// Create resource response.
structure CreateResourceResponse {
    @required
    resource: Document,
}

/// Get resource request.
structure GetResourceRequest {
    @required
    @httpLabel("id")
    id: ResourceId,
    
    @required
    @httpLabel("kind")
    kind: ResourceKind,
}

/// Get resource response.
structure GetResourceResponse {
    @required
    resource: Document,
}

/// List resources request.
structure ListResourcesRequest {
    @required
    @httpLabel("kind")
    kind: ResourceKind,
    
    @httpQuery("page_token")
    pageToken: String,
    
    @httpQuery("page_size")
    pageSize: Integer,
}

/// List resources response.
structure ListResourcesResponse {
    @required
    resources: List<Document>,
    
    @httpHeader("x-next-page-token")
    @jsonName("next_page_token")
    nextToken: String,
}

/// Delete resource request.
structure DeleteResourceRequest {
    @required
    @httpLabel("id")
    id: ResourceId,
    
    @required
    @httpLabel("kind")
    kind: ResourceKind,
    
    @httpQuery("version")
    version: Integer,
}

/// Delete resource response.
structure DeleteResourceResponse {
}

/// Resource not found error.
@error("client")
@httpError(404)
structure ResourceNotFoundError {
    @required
    message: String,
    
    @required
    @jsonName("resource_id")
    resourceId: ResourceId,
    
    @required
    kind: ResourceKind,
}

/// Conflict error (version mismatch).
@error("client")
@httpError(409)
structure ConflictError {
    @required
    message: String,
    
    @required
    @jsonName("resource_id")
    resourceId: ResourceId,
    
    @required
    @jsonName("expected_version")
    expectedVersion: Integer,
    
    @required
    @jsonName("actual_version")
    actualVersion: Integer,
}

/// Invalid request error.
@error("client")
@httpError(400)
structure InvalidRequestError {
    @required
    message: String,
    
    @jsonName("field")
    field: String,
}

/// Internal server error.
@error("server")
@httpError(500)
structure InternalServerError {
    @required
    message: String,
}

/// Control Plane API service.
@http(uri: "https://api.lorecloud.com/v1", methods: ["GET", "POST", "PUT", "DELETE"])
service ControlPlane {
    version: "2024-01-01",
    
    operations: [
        CreateResource,
        GetResource,
        ListResources,
        DeleteResource,
    ]
}

/// Create resource operation.
@http(method: "POST", uri: "/resources", code: 201)
operation CreateResource {
    input: CreateResourceRequest,
    output: CreateResourceResponse,
    errors: [
        InvalidRequestError,
        InternalServerError,
    ]
}

/// Get resource operation.
@http(method: "GET", uri: "/resources/{kind}/{id}", code: 200)
operation GetResource {
    input: GetResourceRequest,
    output: GetResourceResponse,
    errors: [
        ResourceNotFoundError,
        InternalServerError,
    ]
}

/// List resources operation.
@http(method: "GET", uri: "/resources/{kind}", code: 200)
operation ListResources {
    input: ListResourcesRequest,
    output: ListResourcesResponse,
    errors: [
        InvalidRequestError,
        InternalServerError,
    ]
}

/// Delete resource operation.
@http(method: "DELETE", uri: "/resources/{kind}/{id}", code: 204)
operation DeleteResource {
    input: DeleteResourceRequest,
    output: DeleteResourceResponse,
    errors: [
        ResourceNotFoundError,
        ConflictError,
        InternalServerError,
    ]
}
