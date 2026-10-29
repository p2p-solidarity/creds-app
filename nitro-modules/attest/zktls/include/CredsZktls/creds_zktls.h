// C ABI of the creds-zktls staticlib (src/lib.rs). JSON in, JSON out.
#pragma once

#ifdef __cplusplus
extern "C" {
#endif

/// Blocks for the whole proof; call off the main thread. Free the result with creds_zktls_free.
char *creds_zktls_prove(const char *request_json);
void creds_zktls_free(char *result);

#ifdef __cplusplus
}
#endif
