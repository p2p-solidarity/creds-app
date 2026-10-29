//! Notary E2E prover CLI (apps/notary/scripts/e2e.ts drives it): the same
//! code path as the app's prover, reading the request JSON from stdin and
//! printing the result JSON.
//!
//!   echo '{"notaryUrl":"wss://…","authorization":"Nostr …","host":"t.me","path":"/durov",
//!          "fieldStart":"<meta property=\"og:description\" content=\"","fieldStop":"\""}' \
//!     | cargo run --release --bin prove
use std::io::Read;

fn main() {
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).expect("stdin");
    let output = creds_zktls::prove_json(&input);
    println!("{output}");
    let ok = output.starts_with(r#"{"ok":true"#);
    std::process::exit(if ok { 0 } else { 1 });
}
