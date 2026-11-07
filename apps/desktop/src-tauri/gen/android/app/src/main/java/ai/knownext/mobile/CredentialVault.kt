package ai.knownext.mobile

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Native-only bridge. Never registered as a WebView JavaScript interface. */
object CredentialVault {
    private const val ALIAS = "knownext.credentials.v1"
    private val aad = "knownext-credentials/v1/android-keystore-aes-gcm".toByteArray(Charsets.UTF_8)

    @JvmStatic external fun nativeInstall(): Boolean

    @JvmStatic external fun nativeConfigureProton(path: String)

    @JvmStatic fun install(context: android.content.Context) {
        System.loadLibrary("knownext_ai_desktop_lib")
        nativeInstall()
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            nativeConfigureProton(java.io.File(context.applicationInfo.nativeLibraryDir, "libknownext_proton.so").absolutePath)
        }
    }

    @JvmStatic @Synchronized fun transform(input: ByteArray, protect: Boolean): ByteArray {
        require(input.size <= 1024 * 1024) { "Credential payload exceeds limit" }
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        val existing = store.getKey(ALIAS, null)
        val key = if (existing != null) {
            existing as? SecretKey ?: throw IllegalStateException("Incompatible credential key")
        } else {
            // A missing key must never silently replace the key of an encrypted store.
            check(protect) { "Credential key unavailable; preserve encrypted store" }
            val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            generator.init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setKeySize(256).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true).build())
            generator.generateKey()
        }
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        if (protect) {
            cipher.init(Cipher.ENCRYPT_MODE, key)
            cipher.updateAAD(aad)
            val encrypted = cipher.doFinal(input)
            check(cipher.iv.size == 12) { "Unexpected credential nonce size" }
            return cipher.iv + encrypted
        }
        require(input.size >= 28) { "Invalid protected credential payload" }
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(128, input.copyOfRange(0, 12)))
        cipher.updateAAD(aad)
        return cipher.doFinal(input, 12, input.size - 12)
    }
}
