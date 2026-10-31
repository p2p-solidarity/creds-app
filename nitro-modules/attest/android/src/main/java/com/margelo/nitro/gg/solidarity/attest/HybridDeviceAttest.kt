/*
 * HybridDeviceAttest.kt
 * @solidarity/nitro-attest (Android)
 *
 * Android Key Attestation device keys (docs/ref/10 §3.11 tier 3): an EC
 * P-256 AndroidKeyStore key whose certificate chain (to Google's attestation
 * root) carries our challenge, package and boot state. StrongBox when the
 * device has it, TEE otherwise; a software-only keystore is reported as
 * unsupported by the verifier, not here (the chain says so).
 *
 * `keyRef` is the KeyStore alias. A fresh key per call: RKP certificates are
 * short-lived, so the caller re-attests rather than reusing old chains.
 */
package com.margelo.nitro.gg.solidarity.attest

import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import androidx.annotation.Keep
import com.facebook.proguard.annotations.DoNotStrip
import com.margelo.nitro.NitroModules
import com.margelo.nitro.core.Promise
import org.json.JSONArray
import org.json.JSONObject
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.Signature
import java.security.spec.ECGenParameterSpec

@Keep
@DoNotStrip
class HybridDeviceAttest : HybridDeviceAttestSpec() {
  override val isSupported: Boolean
    get() {
      // Every Android 10+ device with a TEE attests; the flag only exists
      // from Android 12. The verifier still checks the chain's security level.
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
      val pm = NitroModules.applicationContext?.packageManager ?: return false
      return pm.hasSystemFeature(PackageManager.FEATURE_HARDWARE_KEYSTORE)
    }

  override fun createAttestedKey(alias: String, challengeB64: String): Promise<String> {
    val challenge = decode(challengeB64)
    return Promise.async {
      if (challenge == null || challenge.size != 32) return@async failure("failed", "challenge must be 32 bytes")
      try {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        if (keyStore.containsAlias(alias)) keyStore.deleteEntry(alias)
        generate(alias, challenge, strongBox = isStrongBoxDevice())
        val chain = keyStore.getCertificateChain(alias)
          ?: return@async failure("unsupported", "no attestation chain")
        val encoded = JSONArray()
        chain.forEach { encoded.put(Base64.encodeToString(it.encoded, Base64.NO_WRAP)) }
        success(JSONObject().put("platform", "android").put("keyRef", alias).put("chain", encoded))
      } catch (e: Exception) {
        failure("failed", e.javaClass.simpleName)
      }
    }
  }

  override fun sign(keyRef: String, dataB64: String): Promise<String> {
    val data = decode(dataB64)
    return Promise.async {
      if (data == null) return@async failure("failed", "data is not base64")
      try {
        val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        val key = keyStore.getKey(keyRef, null) as? PrivateKey
          ?: return@async failure("invalidKey", "")
        val signer = Signature.getInstance("SHA256withECDSA").apply {
          initSign(key)
          update(data)
        }
        success(JSONObject().put("signature", Base64.encodeToString(signer.sign(), Base64.NO_WRAP)))
      } catch (e: Exception) {
        failure("failed", e.javaClass.simpleName)
      }
    }
  }

  private fun generate(alias: String, challenge: ByteArray, strongBox: Boolean) {
    val spec = KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_SIGN)
      .setAlgorithmParameterSpec(ECGenParameterSpec("secp256r1"))
      .setDigests(KeyProperties.DIGEST_SHA256)
      .setAttestationChallenge(challenge)
    if (strongBox && Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) spec.setIsStrongBoxBacked(true)
    val generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, KEYSTORE)
    try {
      generator.initialize(spec.build())
      generator.generateKeyPair()
    } catch (e: StrongBoxUnavailableException) {
      generate(alias, challenge, strongBox = false)
    }
  }

  private fun isStrongBoxDevice(): Boolean =
    Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
      NitroModules.applicationContext?.packageManager?.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE) == true

  private fun decode(b64: String): ByteArray? = try {
    Base64.decode(b64, Base64.DEFAULT)
  } catch (e: IllegalArgumentException) {
    null
  }

  private fun success(value: JSONObject): String = JSONObject().put("ok", true).put("value", value).toString()

  private fun failure(code: String, detail: String): String =
    JSONObject().put("ok", false).put("error", code).put("detail", detail).toString()

  companion object {
    private const val KEYSTORE = "AndroidKeyStore"
  }
}
