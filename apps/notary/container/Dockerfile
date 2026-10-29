# creds.id notary verifier image — runs inside a Cloudflare Container behind src/worker.ts.
FROM --platform=linux/amd64 rust:1.95-bookworm AS build
WORKDIR /src
COPY . .
RUN cargo build --release --locked --bin notary && cp target/release/notary /notary

FROM --platform=linux/amd64 debian:bookworm-slim
COPY --from=build /notary /notary
EXPOSE 8080 8081
CMD ["/notary"]
