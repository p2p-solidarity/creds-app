//! Dev CLI prover for the notary E2E (scripts/e2e.ts drives it). Proxy-mode
//! TLSNotary through the deployed notary: reveals the whole request and only
//! the owner field of the response (from `FIND` up to the `FIND_END` byte).
//! The app prover (P2b) does the same from a Nitro module.
//!
//!   NOTARY_URL=wss://…/v1/session?… NOTARY_AUTH='Nostr …' \
//!   TARGET_HOST=x.com TARGET_PATH=/alice FIND='<meta name="description" content="' \
//!     cargo run --release --bin prove
use std::{env, future::IntoFuture, time::Instant};

use anyhow::{Result, anyhow};
use async_tungstenite::tungstenite::client::IntoClientRequest;
use http_body_util::{BodyExt, Empty};
use hyper::{Request, body::Bytes};
use hyper_util::rt::TokioIo;
use tokio_util::compat::FuturesAsyncReadCompatExt;
use ws_stream_tungstenite::WsStream;

use tlsn::{
    Session,
    config::{prove::ProveConfig, prover::ProverConfig, tls::TlsClientConfig, tls_commit::proxy::ProxyTlsConfig},
    connection::{DnsName, ServerName},
    webpki::RootCertStore,
};

const UA: &str = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

fn var(name: &str) -> Result<String> {
    env::var(name).map_err(|_| anyhow!("{name} required"))
}

#[tokio::main]
async fn main() -> Result<()> {
    let host = var("TARGET_HOST")?;
    let path = var("TARGET_PATH")?;
    let find = var("FIND")?;
    let stop = env::var("FIND_END").map(|e| e.as_bytes()[0]).unwrap_or(b'"');

    let t0 = Instant::now();
    let mut req = var("NOTARY_URL")?.into_client_request()?;
    req.headers_mut().insert("Authorization", var("NOTARY_AUTH")?.parse()?);
    let (ws, _) = async_tungstenite::tokio::connect_async(req).await?;
    let session = Session::new(WsStream::new(ws));
    let (driver, mut handle) = session.split();
    let driver_task = tokio::spawn(driver);

    let prover = handle
        .new_prover(ProverConfig::builder().build()?)?
        .commit(ProxyTlsConfig::builder().server_name(DnsName::try_from(host.as_str())?).build()?)
        .await?;
    let (tls, prover) = prover.connect(
        TlsClientConfig::builder()
            .server_name(ServerName::Dns(host.as_str().try_into()?))
            .root_store(RootCertStore::mozilla())
            .build()?,
    )?;
    let prover_task = tokio::spawn(prover.into_future());

    let (mut sender, conn) = hyper::client::conn::http1::handshake(TokioIo::new(tls.compat())).await?;
    tokio::spawn(conn);
    let request = Request::builder()
        .uri(path.as_str())
        .header("Host", host.as_str())
        .header("User-Agent", UA)
        .header("Accept", "text/html")
        .header("Accept-Language", "en")
        .header("Connection", "close")
        .method("GET")
        .body(Empty::<Bytes>::new())?;
    let response = sender.send_request(request).await?;
    let status = response.status().as_u16();
    let _ = response.into_body().collect().await?;

    let mut prover = prover_task.await??;
    let recv = prover.transcript().received().to_vec();
    let sent_len = prover.transcript().sent().len();
    let start = recv
        .windows(find.len())
        .position(|w| w == find.as_bytes())
        .ok_or_else(|| anyhow!("owner field not in the response (status {status})"))?;
    let end = recv[start + find.len()..]
        .iter()
        .position(|&c| c == stop)
        .map(|e| start + find.len() + e)
        .ok_or_else(|| anyhow!("owner field is not terminated"))?;

    let mut config = ProveConfig::builder(prover.transcript());
    config.server_identity();
    config.reveal_sent(&(0..sent_len))?;
    config.reveal_recv(&(start..end))?;
    prover.prove(&config.build()?).await?;
    prover.close().await?;
    handle.close();
    driver_task.await??;

    println!(
        "{}",
        serde_json::json!({ "status": status, "recvBytes": recv.len(), "revealedBytes": end - start, "ms": t0.elapsed().as_millis() })
    );
    Ok(())
}
