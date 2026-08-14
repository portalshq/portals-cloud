mod config;
mod jwt;
mod oauth;
mod proto;
mod service;
mod store;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    if std::env::args().nth(1).as_deref() == Some("healthcheck") {
        let endpoint = std::env::var("AUTH_GATEWAY_HEALTHCHECK_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:8085/healthz".to_owned());
        let response = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(4))
            .build()?
            .get(endpoint)
            .send()
            .await?;
        anyhow::ensure!(response.status().is_success(), "gateway is not ready");
        return Ok(());
    }
    service::run(config::GatewayConfig::from_env()?).await
}
