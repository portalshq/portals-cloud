use clap::Parser;
use std::net::SocketAddr;

#[derive(Parser, Debug, Clone)]
#[command(name = "lorecloud-control-plane", about = "Lore Cloud Control Plane")]
pub struct AppConfig {
    #[arg(long, env = "DATABASE_URL", hide_env_values = true)]
    pub database_url: String,

    #[arg(long, env = "LISTEN_ADDR", default_value = "0.0.0.0:8083")]
    pub listen_addr: SocketAddr,

    #[arg(long, env = "OUTBOX_POLL_INTERVAL_MS", default_value = "1000")]
    pub outbox_poll_interval_ms: u64,

    #[arg(long, env = "RECONCILER_SWEEP_INTERVAL_MS", default_value = "5000")]
    pub reconciler_sweep_interval_ms: u64,

    #[arg(long, env = "S3_ENDPOINT", default_value = "http://localhost:9002")]
    pub s3_endpoint: String,

    #[arg(long, env = "S3_ACCESS_KEY")]
    pub s3_access_key: String,

    #[arg(long, env = "S3_SECRET_KEY", hide_env_values = true)]
    pub s3_secret_key: String,

    #[arg(long, env = "S3_REGION", default_value = "us-east-1")]
    pub s3_region: String,

    #[arg(long, env = "S3_BUCKET_CHUNKS", default_value = "lore-chunks")]
    pub s3_bucket_chunks: String,

    #[arg(long, env = "ED25519_SIGNING_KEY", hide_env_values = true)]
    pub ed25519_signing_key: String,

    #[arg(long, env = "DP_TOKEN_EXPIRY_SECS", default_value = "3600")]
    pub dp_token_expiry_secs: u64,

    #[arg(long, env = "EVENT_BRIDGE_ENDPOINT", default_value = "")]
    pub event_bridge_endpoint: String,

    #[arg(long, env = "SQS_QUEUE_URL", default_value = "")]
    pub sqs_queue_url: String,

    #[arg(long, env = "RUST_LOG", default_value = "info,lorecloud_control_plane=debug,sqlx=warn")]
    pub log_filter: String,

    /// Comma-separated list of allowed CORS origins. Use "*" for all origins (dev only).
    #[arg(long, env = "CORS_ALLOWED_ORIGINS", default_value = "*")]
    pub cors_allowed_origins: String,

    #[arg(long, env = "METRICS_ENABLED", default_value = "true")]
    pub metrics_enabled: bool,

    #[arg(long, env = "JWT_AUTH_ENABLED", default_value = "false")]
    pub jwt_auth_enabled: bool,

    #[arg(long, env = "IDEMPOTENCY_ENABLED", default_value = "true")]
    pub idempotency_enabled: bool,

    #[arg(long, env = "REDIS_URL", default_value = "")]
    pub redis_url: String,

    #[arg(long, env = "PROVIDER_TYPE", default_value = "aws")]
    pub provider_type: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();
        Self::parse()
    }

    pub fn s3_force_path_style(&self) -> bool {
        self.s3_endpoint.contains("localhost") || self.s3_endpoint.contains("minio")
    }
}
