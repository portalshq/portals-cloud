//! Control plane observability — OpenTelemetry integration.
//!
//! This crate provides unified telemetry initialization for logs, metrics, and traces.

use std::sync::Arc;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry::trace::TracerProvider as TracerProviderTrait;
use thiserror::Error;
use tracing_subscriber::{fmt::format::FmtSpan, EnvFilter};

#[derive(Debug, Error)]
pub enum ObservabilityError {
    #[error("failed to initialize metrics: {0}")]
    MetricsInitError(String),
    #[error("failed to initialize tracing: {0}")]
    TracingInitError(String),
}

/// Observability configuration.
#[derive(Debug, Clone)]
pub struct ObservabilityConfig {
    pub otlp_endpoint: String,
    pub service_name: String,
    pub environment: String,
}

/// Telemetry handle.
pub struct Telemetry {
    pub tracer: Arc<opentelemetry_sdk::trace::Tracer>,
}

impl Telemetry {
    /// Initialize unified telemetry pipeline.
    pub fn init(service_name: &str, config: &ObservabilityConfig) -> Result<Self, ObservabilityError> {
        // 1. Structured logging to stdout — JSON in prod, pretty in local dev
        let env_filter = EnvFilter::from_default_env();

        tracing_subscriber::fmt()
            .json()
            .with_span_events(FmtSpan::CLOSE)
            .with_env_filter(env_filter)
            .init();

        // 2. Traces → OpenTelemetry → X-Ray (via OTLP → ADOT Collector)
        let tracer = opentelemetry_otlp::new_pipeline()
            .tracing()
            .with_exporter(build_otlp_exporter(&config.otlp_endpoint))
            .install_batch(opentelemetry_sdk::runtime::Tokio)
            .map_err(|e| ObservabilityError::TracingInitError(e.to_string()))?;

        Ok(Self {
            tracer: Arc::new(tracer),
        })
    }

    /// Shutdown telemetry providers.
    pub fn shutdown(self) -> Result<(), ObservabilityError> {
        // Shutdown meter provider
        // Note: In production, this should be called during graceful shutdown
        Ok(())
    }
}

fn build_otlp_exporter(endpoint: &str) -> opentelemetry_otlp::SpanExporterBuilder {
    opentelemetry_otlp::SpanExporterBuilder::Tonic(opentelemetry_otlp::new_exporter()
        .tonic()
        .with_endpoint(endpoint))
}

/// Standard span emitted by every controller reconcile pass.
pub fn reconcile_span(kind: &str, resource_id: &str, version: u64) -> tracing::Span {
    tracing::info_span!(
        "controller.reconcile",
        "resource.kind" = kind,
        "resource.id" = resource_id,
        "resource.version" = version,
        "otel.kind" = "INTERNAL",
    )
}

/// Initialize with just a log filter string (simplified version for main.rs)
pub fn init_with_log_filter(log_filter: &str) -> Result<Telemetry, ObservabilityError> {
    let env_filter = EnvFilter::try_new(log_filter)
        .map_err(|e| ObservabilityError::TracingInitError(e.to_string()))?;

    tracing_subscriber::fmt()
        .json()
        .with_span_events(FmtSpan::CLOSE)
        .with_env_filter(env_filter)
        .init();

    // Create a simple tracer provider without actual export
    let provider = opentelemetry_sdk::trace::TracerProvider::builder()
        .build();
    let tracer = provider.tracer("lorecloud-control-plane");

    Ok(Telemetry {
        tracer: Arc::new(tracer),
    })
}
