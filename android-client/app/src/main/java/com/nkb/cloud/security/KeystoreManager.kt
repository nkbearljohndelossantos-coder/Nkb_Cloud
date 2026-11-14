package com.nkb.cloud.security

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.PublicKey
import java.util.Base64

/**
 * KeystoreManager: Hardware-backed Android Keystore credential & asymmetric key management.
 * Protects mobile device credentials, JWT tokens, and device-isolated authentication keys.
 */
class KeystoreManager(context: Context) {

    private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    private val keyAlias = "nkb_device_auth_key"

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val securePrefs = EncryptedSharedPreferences.create(
        context,
        "nkb_secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    /**
     * Generates or retrieves a device-isolated RSA/EC keypair in the hardware Keystore
     */
    fun getOrCreateDeviceKeyPair(): KeyPair {
        if (!keyStore.containsAlias(keyAlias)) {
            val kpg = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_EC,
                "AndroidKeyStore"
            )
            val parameterSpec = KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY
            )
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setUserAuthenticationRequired(false)
                .build()
            kpg.initialize(parameterSpec)
            return kpg.generateKeyPair()
        }

        val entry = keyStore.getEntry(keyAlias, null) as KeyStore.PrivateKeyEntry
        return KeyPair(entry.certificate.publicKey, entry.privateKey)
    }

    /**
     * Returns the device public key exported as a PEM-formatted string
     */
    fun getPublicKeyPem(): String {
        val pubKey = getOrCreateDeviceKeyPair().public
        val encoded = Base64.getEncoder().encodeToString(pubKey.encoded)
        return "-----BEGIN PUBLIC KEY-----\n$encoded\n-----END PUBLIC KEY-----\n"
    }

    // Token & Session Storage in EncryptedSharedPreferences
    fun saveAuthToken(token: String) = securePrefs.edit().putString("jwt_token", token).apply()
    fun getAuthToken(): String? = securePrefs.getString("jwt_token", null)

    fun saveAgentId(agentId: String) = securePrefs.edit().putString("agent_id", agentId).apply()
    fun getAgentId(): String? = securePrefs.getString("agent_id", null)

    fun saveAgentToken(agentToken: String) = securePrefs.edit().putString("agent_token", agentToken).apply()
    fun getAgentToken(): String? = securePrefs.getString("agent_token", null)

    fun clearAll() = securePrefs.edit().clear().apply()
}
