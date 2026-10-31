package com.margelo.nitro.gg.solidarity.keystone

import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip

import android.app.Activity
import android.util.Base64
import androidx.credentials.CreatePublicKeyCredentialRequest
import androidx.credentials.CreatePublicKeyCredentialResponse
import androidx.credentials.CredentialManager
import androidx.credentials.GetCredentialRequest
import androidx.credentials.GetPublicKeyCredentialOption
import androidx.credentials.PublicKeyCredential
import androidx.credentials.exceptions.CreateCredentialCancellationException
import androidx.credentials.exceptions.CreateCredentialException
import androidx.credentials.exceptions.CreateCredentialUnsupportedException
import androidx.credentials.exceptions.GetCredentialCancellationException
import androidx.credentials.exceptions.GetCredentialException
import androidx.credentials.exceptions.domerrors.InvalidStateError
import androidx.credentials.exceptions.publickeycredential.CreatePublicKeyCredentialDomException
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import java.security.SecureRandom
import org.json.JSONArray
import org.json.JSONObject

@Keep
@DoNotStrip
class HybridPasskeyPrf : HybridPasskeyPrfSpec() {
  override fun isSupported(): Boolean = NitroModules.applicationContext != null

  override fun createCredential(
    rpId: String,
    userName: String,
    userId: String,
    prfInput: String,
    excludeCredentialIds: Array<String>,
  ): Promise<PasskeyPrfResult> = Promise.async {
    if (rpId.isBlank() || userName.isBlank()) {
      throw IllegalArgumentException("passkey_prf_invalid_input")
    }
    val userIdBytes = decodeBase64Url(userId)
    val prfInputBytes = decodeBase64Url(prfInput)
    if (userIdBytes.isEmpty() || prfInputBytes.size != 32) {
      throw IllegalArgumentException("passkey_prf_invalid_input")
    }
    val context = NitroModules.applicationContext
      ?: throw IllegalStateException("passkey_prf_unsupported")
    val activity = context.currentActivity
      ?: throw IllegalStateException("passkey_prf_no_activity")

    val credentialManager = CredentialManager.create(context)
    val response = try {
      credentialManager.createCredential(
        activity,
        CreatePublicKeyCredentialRequest(
          requestJson = registrationJson(rpId, userName, userId, prfInput, excludeCredentialIds),
        ),
      )
    } catch (_: CreateCredentialCancellationException) {
      throw IllegalStateException("passkey_prf_cancelled")
    } catch (error: CreatePublicKeyCredentialDomException) {
      // SecurityError here means Android could not verify this app against
      // the rpId's assetlinks.json (e.g. the Play signing key is not listed).
      throw IllegalStateException(
        if (error.domError is InvalidStateError) "passkey_prf_already_registered"
        else failure("passkey_prf_invalid_credential", error),
      )
    } catch (error: CreateCredentialUnsupportedException) {
      throw IllegalStateException(failure("passkey_prf_unsupported", error))
    } catch (error: Exception) {
      throw IllegalStateException(failure("passkey_prf_invalid_credential", error))
    }

    val publicKey = response as? CreatePublicKeyCredentialResponse
      ?: throw IllegalStateException("passkey_prf_invalid_credential")
    val json = try {
      JSONObject(publicKey.registrationResponseJson)
    } catch (_: Exception) {
      throw IllegalStateException("passkey_prf_invalid_credential")
    }
    val credentialId = json.optString("rawId").ifBlank { json.optString("id") }
    if (decodeBase64Url(credentialId).isEmpty()) {
      throw IllegalStateException("passkey_prf_invalid_credential")
    }
    val prf = json.optJSONObject("clientExtensionResults")?.optJSONObject("prf")
    val prfOutput = prf?.optJSONObject("results")?.optString("first").orEmpty().ifBlank {
      // Evaluating PRF during registration is optional in WebAuthn; some
      // providers only report `enabled` and answer on the first assertion.
      if (prf?.optBoolean("enabled") != true) throw IllegalStateException("passkey_prf_no_prf")
      evaluatePrf(credentialManager, activity, rpId, credentialId, prfInput)
    }
    if (decodeBase64Url(prfOutput).size != 32) {
      throw IllegalStateException("passkey_prf_no_prf")
    }
    PasskeyPrfResult(
      credentialId = credentialId,
      prfOutput = prfOutput,
      attachment = json.optString("authenticatorAttachment").takeIf {
        it == "platform" || it == "cross-platform"
      },
      attestationObject = json.optJSONObject("response")?.optString("attestationObject")
        ?.takeIf { it.isNotBlank() },
    )
  }

  /** One assertion pinned to the credential just created, asking only for its PRF output. */
  private suspend fun evaluatePrf(
    credentialManager: CredentialManager,
    activity: Activity,
    rpId: String,
    credentialId: String,
    prfInput: String,
  ): String {
    val response = try {
      credentialManager.getCredential(
        activity,
        GetCredentialRequest(
          listOf(GetPublicKeyCredentialOption(requestJson = assertionJson(rpId, credentialId, prfInput))),
        ),
      )
    } catch (_: GetCredentialCancellationException) {
      throw IllegalStateException("passkey_prf_cancelled")
    } catch (error: Exception) {
      throw IllegalStateException(failure("passkey_prf_no_prf", error))
    }
    val credential = response.credential as? PublicKeyCredential
      ?: throw IllegalStateException("passkey_prf_no_prf")
    val json = try {
      JSONObject(credential.authenticationResponseJson)
    } catch (_: Exception) {
      throw IllegalStateException("passkey_prf_no_prf")
    }
    // A different credential's PRF output would seal the vault under the
    // wrong locator; the web could never open it.
    val asserted = decodeBase64Url(json.optString("rawId").ifBlank { json.optString("id") })
    if (!asserted.contentEquals(decodeBase64Url(credentialId))) {
      throw IllegalStateException("passkey_prf_invalid_credential")
    }
    return json.optJSONObject("clientExtensionResults")
      ?.optJSONObject("prf")
      ?.optJSONObject("results")
      ?.optString("first")
      .orEmpty()
  }

  private fun assertionJson(rpId: String, credentialId: String, prfInput: String): String {
    val challenge = ByteArray(32).also(SecureRandom()::nextBytes)
    return JSONObject()
      .put("challenge", encodeBase64Url(challenge))
      .put("rpId", rpId)
      .put(
        "allowCredentials",
        JSONArray().put(JSONObject().put("type", "public-key").put("id", credentialId)),
      )
      .put("userVerification", "required")
      .put(
        "extensions",
        JSONObject().put("prf", JSONObject().put("eval", JSONObject().put("first", prfInput))),
      )
      .toString()
  }

  /**
   * `code (Exception: type: provider message)`. JS classifies on the code
   * alone; the rest travels to the error report. Provider messages carry no
   * key material — the PRF output only ever exists in a success response.
   */
  private fun failure(code: String, error: Exception): String {
    val (type, message) = when (error) {
      is CreateCredentialException -> error.type to error.errorMessage?.toString()
      is GetCredentialException -> error.type to error.errorMessage?.toString()
      else -> null to error.message
    }
    return listOfNotNull(error.javaClass.simpleName, type, message)
      .joinToString(": ")
      .let { "$code ($it)" }
      .take(300)
  }

  private fun registrationJson(
    rpId: String,
    userName: String,
    userId: String,
    prfInput: String,
    excludeCredentialIds: Array<String>,
  ): String {
    val challenge = ByteArray(32).also(SecureRandom()::nextBytes)
    return JSONObject()
      .put("challenge", encodeBase64Url(challenge))
      .put("rp", JSONObject().put("id", rpId).put("name", "Solidarity"))
      .put(
        "user",
        JSONObject()
          .put("id", userId)
          .put("name", userName)
          .put("displayName", userName),
      )
      .put(
        "pubKeyCredParams",
        JSONArray()
          .put(JSONObject().put("type", "public-key").put("alg", -7))
          .put(JSONObject().put("type", "public-key").put("alg", -257)),
      )
      .put(
        "authenticatorSelection",
        JSONObject()
          .put("residentKey", "required")
          .put("requireResidentKey", true)
          .put("userVerification", "required"),
      )
      .put("excludeCredentials", JSONArray().also { excluded ->
        excludeCredentialIds.forEach { id ->
          excluded.put(JSONObject().put("type", "public-key").put("id", id))
        }
      })
      .put("attestation", "none")
      .put(
        "extensions",
        JSONObject().put(
          "prf",
          JSONObject().put(
            "eval",
            JSONObject().put("first", prfInput),
          ),
        ),
      )
      .toString()
  }

  private fun decodeBase64Url(value: String): ByteArray = try {
    Base64.decode(value, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
  } catch (_: IllegalArgumentException) {
    ByteArray(0)
  }

  private fun encodeBase64Url(value: ByteArray): String =
    Base64.encodeToString(value, Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP)
}
