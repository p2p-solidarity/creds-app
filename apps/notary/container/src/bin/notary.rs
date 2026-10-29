//! creds.id notary verifier (docs/ref/10 §3.1, §3.8): one TLSNotary
//! proxy-mode session per WebSocket on :8080, its witnessed facts on :8081.
//!
//! Holds no keys. It witnesses a session and reports what it saw; the Worker
//! in front re-checks the facts against the shared platform rules and signs.
//! Both ports are reachable only from that Worker's Durable Object
//! (Containers have no public ingress). The Worker passes the one host and
//! request line a session may use; anything else is refused: another server,
//! a private address, more than one request, a partly hidden request, more
//! than one revealed range, an oversized response.
use std::{
    collections::HashMap,
    net::{IpAddr, SocketAddr},
    pin::Pin,
    sync::{Arc, Mutex},
    task::{Context, Poll},
    time::{Duration, Instant},
};

use anyhow::{Result, anyhow, bail, ensure};
use async_tungstenite::{
    tokio::{TokioAdapter, accept_hdr_async},
    tungstenite::handshake::server::{ErrorResponse, Request, Response},
};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, ReadBuf},
    net::{TcpListener, TcpStream},
};
use tokio_util::compat::TokioAsyncReadCompatExt;
use ws_stream_tungstenite::WsStream;

use tlsn::{
    Session,
    config::verifier::VerifierConfig,
    connection::ServerName,
    verifier::VerifierCommitStart,
    webpki::RootCertStore,
};

/// Largest profile page we witness (IG, the biggest measured, is ~0.7 MB).
const MAX_RECV_BYTES: usize = 2 << 20;
const SESSION_TIMEOUT: Duration = Duration::from_secs(60);
/// Facts wait this long for the Worker to pick them up, then are dropped.
const RESULT_TTL: Duration = Duration::from_secs(300);

struct Expect {
    sid: String,
    server: String,
    request: String,
}

struct Facts {
    server: String,
    request: String,
    revealed: String,
}

type Ws = WsStream<TokioAdapter<TcpStream>>;
type Results = Arc<Mutex<HashMap<String, (Instant, Result<Facts, String>)>>>;

#[tokio::main]
async fn main() -> Result<()> {
    let results: Results = Arc::default();
    let sessions = TcpListener::bind("0.0.0.0:8080").await?;
    let facts = TcpListener::bind("0.0.0.0:8081").await?;
    println!("notary listening on :8080 (sessions) and :8081 (facts)");
    tokio::spawn(serve_facts(facts, results.clone()));
    loop {
        let (tcp, _) = sessions.accept().await?;
        let results = results.clone();
        tokio::spawn(async move {
            let Some((ws, expect)) = upgrade(tcp).await else { return };
            let started = Instant::now();
            let outcome = match tokio::time::timeout(SESSION_TIMEOUT, witness(ws, &expect)).await {
                Ok(Ok(facts)) => Ok(facts),
                Ok(Err(e)) => Err(format!("{e:#}")),
                Err(_) => Err("session timed out".into()),
            };
            match &outcome {
                Ok(_) => println!("session ok in {} ms", started.elapsed().as_millis()),
                Err(e) => println!("session failed: {e}"),
            }
            let mut map = results.lock().expect("results lock");
            map.retain(|_, (at, _)| at.elapsed() < RESULT_TTL);
            map.insert(expect.sid, (Instant::now(), outcome));
        });
    }
}

/// WebSocket upgrade; the Durable Object sets the three X-Notary-* headers.
async fn upgrade(tcp: TcpStream) -> Option<(Ws, Expect)> {
    let mut expect = None;
    let callback = |req: &Request, resp: Response| -> Result<Response, ErrorResponse> {
        let header = |name: &str| req.headers().get(name).and_then(|v| v.to_str().ok()).map(str::to_owned);
        match (header("x-notary-sid"), header("x-notary-server"), header("x-notary-request")) {
            (Some(sid), Some(server), Some(request)) => {
                expect = Some(Expect { sid, server, request });
                Ok(resp)
            }
            _ => Err(ErrorResponse::new(Some("missing session headers".into()))),
        }
    };
    let ws = accept_hdr_async(tcp, callback).await.ok()?;
    Some((WsStream::new(ws), expect?))
}

async fn witness(ws: Ws, expect: &Expect) -> Result<Facts> {
    let session = Session::new(ws);
    let (driver, mut handle) = session.split();
    let driver_task = tokio::spawn(driver);

    let verifier = handle.new_verifier(VerifierConfig::builder().root_store(RootCertStore::mozilla()).build()?)?;
    let verifier = match verifier.commit().await? {
        VerifierCommitStart::Proxy(v) => {
            let host = v.config().server_name().to_string();
            ensure!(host == expect.server, "prover committed to another server");
            let server = TcpStream::connect(public_addr(&host).await?).await?;
            v.accept().await?.run(Capped { inner: server, left: MAX_RECV_BYTES }.compat()).await?
        }
        VerifierCommitStart::Mpc(_) => bail!("only proxy mode is supported"),
    };
    let (out, verifier) = verifier.verify().await?.accept().await?;
    verifier.close().await?;
    handle.close();
    driver_task.await??;

    let server = out.server_name.map(|ServerName::Dns(d)| d.as_str().to_string()).unwrap_or_default();
    ensure!(server == expect.server, "server identity was not proven");
    let transcript = out.transcript.ok_or_else(|| anyhow!("nothing was revealed"))?;

    // The request has no secrets (logged out), so all of it must be revealed:
    // one GET for exactly the profile page, to exactly the platform host.
    ensure!(transcript.sent_authed().len() == transcript.len_sent(), "request is not fully revealed");
    let sent = std::str::from_utf8(transcript.sent_unsafe())?;
    ensure!(sent.ends_with("\r\n\r\n") && sent.matches("\r\n\r\n").count() == 1, "more than one request");
    let mut lines = sent.trim_end().split("\r\n");
    ensure!(lines.next() == Some(expect.request.as_str()), "request line is not the profile page");
    let hosts: Vec<&str> = lines
        .filter_map(|l| l.split_once(':'))
        .filter(|(k, _)| k.eq_ignore_ascii_case("host"))
        .map(|(_, v)| v.trim())
        .collect();
    ensure!(hosts == [expect.server.as_str()], "Host header is not the platform host");

    let ranges = transcript.received_authed();
    ensure!(ranges.len_ranges() == 1, "expected exactly one revealed range");
    let range = ranges.iter().next().ok_or_else(|| anyhow!("nothing revealed from the response"))?;
    let revealed = std::str::from_utf8(&transcript.received_unsafe()[range])?.to_string();

    Ok(Facts { server, request: expect.request.clone(), revealed })
}

/// Resolve once and dial only a public address — never the container's own network.
async fn public_addr(host: &str) -> Result<SocketAddr> {
    let addrs: Vec<SocketAddr> = tokio::net::lookup_host((host, 443)).await?.collect();
    ensure!(!addrs.is_empty(), "host does not resolve");
    ensure!(addrs.iter().all(|a| is_public(a.ip())), "host resolves to a private address");
    Ok(addrs[0])
}

fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            let [a, b, ..] = v4.octets();
            !(v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_documentation()
                || v4.is_unspecified()
                || v4.is_multicast()
                || a == 0
                || a >= 240
                || (a == 100 && (64..128).contains(&b))
                || (a == 198 && (18..20).contains(&b))
                || (a == 192 && b == 0 && v4.octets()[2] == 0))
        }
        IpAddr::V6(v6) => {
            if let Some(v4) = v6.to_ipv4_mapped() {
                return is_public(IpAddr::V4(v4));
            }
            let first = v6.segments()[0];
            !(v6.is_loopback()
                || v6.is_unspecified()
                || v6.is_multicast()
                || (first & 0xfe00) == 0xfc00
                || (first & 0xffc0) == 0xfe80
                || (first == 0x2001 && v6.segments()[1] == 0x0db8))
        }
    }
}

/// The server side of the proxied TLS connection, cut off past `left` received bytes.
struct Capped {
    inner: TcpStream,
    left: usize,
}

impl AsyncRead for Capped {
    fn poll_read(mut self: Pin<&mut Self>, cx: &mut Context<'_>, buf: &mut ReadBuf<'_>) -> Poll<std::io::Result<()>> {
        let before = buf.filled().len();
        let poll = Pin::new(&mut self.inner).poll_read(cx, buf);
        let read = buf.filled().len() - before;
        if read > self.left {
            return Poll::Ready(Err(std::io::Error::other("response too large")));
        }
        self.left -= read;
        poll
    }
}

impl AsyncWrite for Capped {
    fn poll_write(mut self: Pin<&mut Self>, cx: &mut Context<'_>, b: &[u8]) -> Poll<std::io::Result<usize>> {
        Pin::new(&mut self.inner).poll_write(cx, b)
    }
    fn poll_flush(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.inner).poll_flush(cx)
    }
    fn poll_shutdown(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<std::io::Result<()>> {
        Pin::new(&mut self.inner).poll_shutdown(cx)
    }
}

/// `GET /facts/<sid>` → 200 facts JSON (once), 422 why the session failed, 404 unknown or not finished.
async fn serve_facts(listener: TcpListener, results: Results) {
    loop {
        let Ok((mut tcp, _)) = listener.accept().await else { continue };
        let results = results.clone();
        tokio::spawn(async move {
            let mut buf = [0u8; 1024];
            let n = tcp.read(&mut buf).await.unwrap_or(0);
            let head = String::from_utf8_lossy(&buf[..n]);
            let path = head.strip_prefix("GET ").and_then(|r| r.split(' ').next()).unwrap_or("");
            let (status, body) = match path.strip_prefix("/facts/") {
                Some(sid) => match results.lock().expect("results lock").remove(sid) {
                    Some((_, Ok(f))) => (
                        "200 OK",
                        serde_json::json!({ "server": f.server, "request": f.request, "revealed": f.revealed }),
                    ),
                    Some((_, Err(e))) => ("422 Unprocessable Entity", serde_json::json!({ "error": e })),
                    None => ("404 Not Found", serde_json::json!({ "error": "not_found" })),
                },
                None if path == "/healthz" => ("200 OK", serde_json::json!({ "ok": true })),
                None => ("404 Not Found", serde_json::json!({ "error": "not_found" })),
            };
            let body = body.to_string();
            let response = format!(
                "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            let _ = tcp.write_all(response.as_bytes()).await;
        });
    }
}
