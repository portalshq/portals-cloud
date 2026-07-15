use tracing_subscriber::{fmt, layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

pub fn init(log_filter: &str) {
    let filter = EnvFilter::try_new(log_filter).unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().with_target(true).with_ansi(true))
        .init();
}

pub fn init_json(log_filter: &str) {
    let filter = EnvFilter::try_new(log_filter).unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(filter)
        .with(fmt::layer().json().with_target(true))
        .init();
}
