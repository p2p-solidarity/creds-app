//! creds.id on-device zkTLS prover (docs/ref/10 §2 step ③, §3.1).
//!
//! Proxy-mode TLSNotary through the creds.id notary: the notary dials the
//! platform and forwards ciphertext, the phone holds the TLS keys and reveals
//! the whole request plus only the owner field of the response (from
//! `field_start` up to the first `field_stop` byte — the first unescaped one
//! when the field is a JS string literal, and the first such range that holds
//! `field_contains` when given). Everything else in the page stays hidden from
//! the notary.
//!
//! The caller (the attest Nitro module) passes the NIP-98 `Authorization`
//! header it already signed; this crate never sees a key. The C ABI is one
//! blocking call taking and returning JSON, so Swift and Kotlin need no
//! generated bindings.
use std::{
    ffi::{CStr, CString, c_char},
    future::IntoFuture,
    time::Instant,
};

use async_tungstenite::tungstenite::client::IntoClientRequest;
use http_body_util::{BodyExt, Empty};
use hyper::{Request, body::Bytes};
use hyper_util::rt::TokioIo;
use serde::{Deserialize, Serialize};
use tokio_util::compat::FuturesAsyncReadCompatExt;
use ws_stream_tungstenite::WsStream;

use tlsn::{
    Session,
    config::{prove::ProveConfig, prover::ProverConfig, tls::TlsClientConfig, tls_commit::proxy::ProxyTlsConfig},
    connection::{DnsName, ServerName},
    webpki::RootCertStore,
};

const UA: &str = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProveRequest {
    /// `wss://…/v1/session?…` — the exact URL the authorization signs.
    pub notary_url: String,
    pub authorization: String,
    pub host: String,
    pub path: String,
    pub field_start: String,
    pub field_stop: String,
    /// The field is a JS string literal: skip `\`-escaped bytes when looking for the stop.
    #[serde(default)]
    pub field_stop_unescaped: bool,
    /// Pick the first occurrence of the field whose range contains this (e.g. the marker).
    #[serde(default)]
    pub field_contains: Option<String>,
}

/// The revealed range in `recv`: an occurrence of `start`, through to (not including)
/// its `stop` byte. With `unescaped`, a stop byte right after a `\` escape does not
/// count. With `contains`, occurrences whose range lacks it are skipped.
pub fn field_range(
    recv: &[u8],
    start: &[u8],
    stop: u8,
    unescaped: bool,
    contains: Option<&[u8]>,
) -> Option<std::ops::Range<usize>> {
    if start.is_empty() {
        return None;
    }
    let mut from = 0;
    while let Some(at) = recv.get(from..)?.windows(start.len()).position(|w| w == start) {
        let begin = from + at;
        let mut i = begin + start.len();
        let end = loop {
            match recv.get(i) {
                None => return None,
                Some(b'\\') if unescaped => i += 2,
                Some(&c) if c == stop => break i,
                Some(_) => i += 1,
            }
        };
        let held = match contains {
            Some(needle) if !needle.is_empty() => recv[begin..end].windows(needle.len()).any(|w| w == needle),
            _ => true,
        };
        if held {
            return Some(begin..end);
        }
        from = end;
    }
    None
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Proved {
    pub status: u16,
    pub response_bytes: usize,
    pub revealed_bytes: usize,
    pub ms: u128,
}

/// Why a proof did not happen, in terms the app can act on.
#[derive(Debug)]
pub enum ProveError {
    /// The notary refused or could not be reached (auth, rate limit, outage).
    Notary(String),
    /// The platform answered with a non-200 status (404 = no such handle, 403/429 = blocked).
    Status(u16),
    /// 200, but the owner field is not in the page (login wall, markup change).
    FieldMissing,
    /// TLS / MPC / transport failure while proving.
    Failed(String),
}

impl ProveError {
    fn code(&self) -> &'static str {
        match self {
            ProveError::Notary(_) => "notary",
            ProveError::Status(_) => "status",
            ProveError::FieldMissing => "fieldMissing",
            ProveError::Failed(_) => "failed",
        }
    }
}

fn failed(e: impl std::fmt::Display) -> ProveError {
    ProveError::Failed(format!("{e:#}"))
}

pub async fn prove(req: &ProveRequest) -> Result<Proved, ProveError> {
    let stop = *req.field_stop.as_bytes().first().ok_or_else(|| failed("empty field_stop"))?;
    let t0 = Instant::now();
    let mut ws_req = req.notary_url.as_str().into_client_request().map_err(failed)?;
    ws_req.headers_mut().insert("Authorization", req.authorization.parse().map_err(failed)?);
    let (ws, _) = async_tungstenite::tokio::connect_async(ws_req)
        .await
        .map_err(|e| ProveError::Notary(e.to_string()))?;
    let session = Session::new(WsStream::new(ws));
    let (driver, mut handle) = session.split();
    let driver_task = tokio::spawn(driver);

    let host = req.host.as_str();
    let prover = handle
        .new_prover(ProverConfig::builder().build().map_err(failed)?)
        .map_err(failed)?
        .commit(
            ProxyTlsConfig::builder()
                .server_name(DnsName::try_from(host).map_err(failed)?)
                .build()
                .map_err(failed)?,
        )
        .await
        .map_err(failed)?;
    let (tls, prover) = prover
        .connect(
            TlsClientConfig::builder()
                .server_name(ServerName::Dns(host.try_into().map_err(failed)?))
                .root_store(RootCertStore::mozilla())
                .build()
                .map_err(failed)?,
        )
        .map_err(failed)?;
    let prover_task = tokio::spawn(prover.into_future());

    let (mut sender, conn) = hyper::client::conn::http1::handshake(TokioIo::new(tls.compat()))
        .await
        .map_err(failed)?;
    tokio::spawn(conn);
    let request = Request::builder()
        .uri(req.path.as_str())
        .header("Host", host)
        .header("User-Agent", UA)
        .header("Accept", "text/html")
        .header("Accept-Language", "en")
        .header("Connection", "close")
        .method("GET")
        .body(Empty::<Bytes>::new())
        .map_err(failed)?;
    let response = sender.send_request(request).await.map_err(failed)?;
    let status = response.status().as_u16();
    let _ = response.into_body().collect().await.map_err(failed)?;

    let mut prover = prover_task.await.map_err(failed)?.map_err(failed)?;
    if status != 200 {
        return Err(ProveError::Status(status));
    }
    let recv = prover.transcript().received().to_vec();
    let sent_len = prover.transcript().sent().len();
    let range = field_range(
        &recv,
        req.field_start.as_bytes(),
        stop,
        req.field_stop_unescaped,
        req.field_contains.as_deref().map(str::as_bytes),
    )
    .ok_or(ProveError::FieldMissing)?;
    let (start, end) = (range.start, range.end);

    let mut config = ProveConfig::builder(prover.transcript());
    config.server_identity();
    config.reveal_sent(&(0..sent_len)).map_err(failed)?;
    config.reveal_recv(&(start..end)).map_err(failed)?;
    prover.prove(&config.build().map_err(failed)?).await.map_err(failed)?;
    prover.close().await.map_err(failed)?;
    handle.close();
    driver_task.await.map_err(failed)?.map_err(failed)?;

    Ok(Proved { status, response_bytes: recv.len(), revealed_bytes: end - start, ms: t0.elapsed().as_millis() })
}

/// Blocking JSON-in/JSON-out entry for the C ABI and the CLI.
pub fn prove_json(request: &str) -> String {
    let outcome = serde_json::from_str::<ProveRequest>(request)
        .map_err(failed)
        .and_then(|req| {
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .enable_all()
                .build()
                .map_err(failed)?
                .block_on(prove(&req))
        });
    match outcome {
        Ok(p) => serde_json::json!({ "ok": true, "value": p }).to_string(),
        Err(e) => {
            let detail = match &e {
                ProveError::Notary(m) | ProveError::Failed(m) => m.clone(),
                ProveError::Status(s) => s.to_string(),
                ProveError::FieldMissing => String::new(),
            };
            serde_json::json!({ "ok": false, "error": e.code(), "detail": detail }).to_string()
        }
    }
}

/// # Safety
/// `request` must be a valid NUL-terminated UTF-8 string. The result must be
/// released with `creds_zktls_free`. Blocks the calling thread for the whole
/// proof — call it off the main thread.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn creds_zktls_prove(request: *const c_char) -> *mut c_char {
    let input = if request.is_null() { "" } else { unsafe { CStr::from_ptr(request) }.to_str().unwrap_or("") };
    let output = std::panic::catch_unwind(|| prove_json(input))
        .unwrap_or_else(|_| r#"{"ok":false,"error":"failed","detail":"prover panicked"}"#.to_string());
    CString::new(output).map(CString::into_raw).unwrap_or(std::ptr::null_mut())
}

/// # Safety
/// `s` must come from `creds_zktls_prove` and be freed once.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn creds_zktls_free(s: *mut c_char) {
    if !s.is_null() {
        drop(unsafe { CString::from_raw(s) });
    }
}

#[cfg(test)]
mod tests {
    use super::field_range;

    const META: &[u8] = br##"<meta name="description" content=""##;

    #[test]
    fn plain_field_stops_at_the_first_stop_byte() {
        let page = br##"<head><meta name="description" content="hi creds.id/@a"/>"##;
        let r = field_range(page, META, b'"', false, None).unwrap();
        assert_eq!(&page[r], br##"<meta name="description" content="hi creds.id/@a"##);
    }

    #[test]
    fn js_string_field_skips_escaped_quotes() {
        let page = br#"value:"{\"data\":{\"x\":\"a\\\"}"},next"#;
        let r = field_range(page, br#"{\"data\":"#, b'"', true, None).unwrap();
        assert_eq!(&page[r], br#"{\"data\":{\"x\":\"a\\\"}"#);
    }

    #[test]
    fn picks_the_first_occurrence_that_holds_the_needle() {
        let page = br#"v:"{\"data\":1,\"bio\":\"x\"}",v:"{\"data\":2,\"url\":\"creds.id/@a\"}","#;
        let r = field_range(page, br#"{\"data\":"#, b'"', true, Some(b"creds.id/@a")).unwrap();
        assert_eq!(&page[r], br#"{\"data\":2,\"url\":\"creds.id/@a\"}"#);
        assert!(field_range(page, br#"{\"data\":"#, b'"', true, Some(b"creds.id/@b")).is_none());
    }

    #[test]
    fn an_unterminated_field_is_missing() {
        assert!(field_range(br##"<meta name="description" content="no end"##, META, b'"', false, None).is_none());
        assert!(field_range(br#"v:"{\"data\":\"#, br#"{\"data\":"#, b'"', true, None).is_none());
    }
}
