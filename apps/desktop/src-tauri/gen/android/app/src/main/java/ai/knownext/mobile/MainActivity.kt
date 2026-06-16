package ai.knownext.mobile

import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.core.content.FileProvider
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.HttpURLConnection
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.net.URL
import java.nio.charset.StandardCharsets
import java.security.MessageDigest
import kotlin.concurrent.thread
import org.json.JSONObject

private const val MAX_UPDATE_MANIFEST_BYTES = 256 * 1024
private const val MAX_UPDATE_REDIRECTS = 5

class MainActivity : TauriActivity() {
    private var updaterBridge: KnowNextAndroidUpdater? = null

    override fun onWebViewCreate(webView: WebView) {
        super.onWebViewCreate(webView)
        updaterBridge = KnowNextAndroidUpdater(this, webView)
        webView.addJavascriptInterface(updaterBridge!!, "KnownextAndroidUpdater")
    }
}

class KnowNextAndroidUpdater(
    private val activity: MainActivity,
    private val webView: WebView,
) {
    @JavascriptInterface
    fun getPackageInfo(): String {
        val info = currentPackageInfo()
        return JSONObject()
            .put("applicationId", activity.packageName)
            .put("versionName", info.versionName ?: "")
            .put("versionCode", longVersionCode(info))
            .put("supportedAbis", Build.SUPPORTED_ABIS.joinToString(","))
            .toString()
    }

    @JavascriptInterface
    fun fetchUpdateManifest(requestJson: String): String {
        return try {
            val request = JSONObject(requestJson)
            val url = request.getString("url")
            val body = downloadText(url, MAX_UPDATE_MANIFEST_BYTES)
            JSONObject()
                .put("ok", true)
                .put("body", body)
                .toString()
        } catch (error: Exception) {
            JSONObject()
                .put("ok", false)
                .put("message", describeUpdateFetchError(error))
                .toString()
        }
    }

    @JavascriptInterface
    fun canRequestPackageInstalls(): Boolean {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || activity.packageManager.canRequestPackageInstalls()
    }

    @JavascriptInterface
    fun openInstallPermissionSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val intent = Intent(
            Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
            Uri.parse("package:${activity.packageName}"),
        )
        activity.startActivity(intent)
    }

    @JavascriptInterface
    fun downloadAndInstall(requestJson: String): String {
        val request = JSONObject(requestJson)
        val requestId = request.optString("requestId").ifBlank { System.currentTimeMillis().toString() }

        thread(name = "knownext-android-update-$requestId") {
            try {
                downloadValidateAndInstall(requestId, request)
            } catch (error: Exception) {
                emit(requestId, "error", JSONObject().put("message", error.message ?: "Android update failed."))
            }
        }

        return requestId
    }

    private fun downloadText(url: String, maxBytes: Int): String {
        var currentUrl = URL(url)
        repeat(MAX_UPDATE_REDIRECTS + 1) { redirectCount ->
            if (!currentUrl.protocol.equals("https", ignoreCase = true)) {
                throw IllegalArgumentException("Las actualizaciones Android deben consultarse por HTTPS.")
            }

            val connection = (currentUrl.openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 30_000
                instanceFollowRedirects = false
                requestMethod = "GET"
                setRequestProperty("Accept", "application/json")
                setRequestProperty("User-Agent", "KnowNext.ai Android Updater")
            }

            try {
                val responseCode = connection.responseCode
                if (responseCode in 300..399) {
                    val location = connection.getHeaderField("Location")
                        ?: throw IllegalStateException("La actualización Android devolvió una redirección sin destino.")
                    if (redirectCount >= MAX_UPDATE_REDIRECTS) {
                        throw IllegalStateException("La actualización Android devolvió demasiadas redirecciones.")
                    }
                    currentUrl = URL(currentUrl, location)
                    return@repeat
                }

                if (responseCode !in 200..299) {
                    throw IllegalStateException("El servidor devolvió HTTP $responseCode al consultar actualizaciones.")
                }

                val total = connection.contentLengthLong
                if (total > maxBytes) {
                    throw IllegalStateException("La información de actualización Android es demasiado grande.")
                }

                val output = ByteArrayOutputStream()
                var downloaded = 0
                connection.inputStream.use { input ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        downloaded += read
                        if (downloaded > maxBytes) {
                            throw IllegalStateException("La información de actualización Android es demasiado grande.")
                        }
                        output.write(buffer, 0, read)
                    }
                }
                return output.toString(StandardCharsets.UTF_8.name())
            } finally {
                connection.disconnect()
            }
        }

        throw IllegalStateException("La actualización Android devolvió demasiadas redirecciones.")
    }

    private fun downloadValidateAndInstall(requestId: String, request: JSONObject) {
        if (!canRequestPackageInstalls()) {
            emit(requestId, "permission-required", JSONObject().put("message", "Android requiere permitir instalaciones desde KnowNext.ai."))
            return
        }

        val url = request.getString("url")
        val expectedSha256 = normalizeSha256(request.getString("sha256"))
        val expectedApplicationId = request.getString("applicationId")
        val expectedVersionCode = request.getLong("versionCode")
        val fileName = request.optString("fileName").ifBlank { "knownext-update.apk" }
        val safeFileName = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_")
        val updateDir = File(activity.cacheDir, "updates").also { it.mkdirs() }
        val apkFile = File(updateDir, safeFileName)
        if (apkFile.exists()) apkFile.delete()

        emit(requestId, "download-started", JSONObject())
        val actualSha256 = downloadApk(url, apkFile, requestId)
        if (actualSha256 != expectedSha256) {
            apkFile.delete()
            throw IllegalStateException("El APK descargado no coincide con el SHA-256 publicado.")
        }

        validateApk(apkFile, expectedApplicationId, expectedVersionCode)
        emit(requestId, "installing", JSONObject().put("percent", 100))
        openInstaller(apkFile)
        emit(requestId, "installer-opened", JSONObject())
    }

    private fun downloadApk(url: String, output: File, requestId: String): String {
        val connection = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
            instanceFollowRedirects = true
            requestMethod = "GET"
        }
        try {
            val responseCode = connection.responseCode
            if (responseCode !in 200..299) {
                throw IllegalStateException("El servidor devolvió HTTP $responseCode al descargar la actualización.")
            }
            val total = connection.contentLengthLong.takeIf { it > 0 }
            val digest = MessageDigest.getInstance("SHA-256")
            var downloaded = 0L
            var lastProgressAt = 0L
            connection.inputStream.use { input ->
                output.outputStream().use { file ->
                    val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
                    while (true) {
                        val read = input.read(buffer)
                        if (read < 0) break
                        file.write(buffer, 0, read)
                        digest.update(buffer, 0, read)
                        downloaded += read
                        val now = System.currentTimeMillis()
                        if (now - lastProgressAt > 300) {
                            emitProgress(requestId, downloaded, total)
                            lastProgressAt = now
                        }
                    }
                }
            }
            emitProgress(requestId, downloaded, total)
            return digest.digest().joinToString("") { "%02x".format(it) }
        } finally {
            connection.disconnect()
        }
    }

    private fun validateApk(apkFile: File, expectedApplicationId: String, expectedVersionCode: Long) {
        val apkInfo = packageArchiveInfo(apkFile)
            ?: throw IllegalStateException("Android no pudo leer el APK descargado.")
        if (apkInfo.packageName != expectedApplicationId || expectedApplicationId != activity.packageName) {
            throw IllegalStateException("El APK no pertenece a ${activity.packageName}.")
        }
        if (longVersionCode(apkInfo) != expectedVersionCode) {
            throw IllegalStateException("El versionCode del APK no coincide con el manifiesto publicado.")
        }
        if (expectedVersionCode <= longVersionCode(currentPackageInfo())) {
            throw IllegalStateException("Android no permite actualizar a una versión igual o anterior.")
        }
        if (!sameSigningCertificate(currentPackageInfo(), apkInfo)) {
            throw IllegalStateException("El APK no está firmado con el mismo certificado que esta instalación.")
        }
    }

    private fun openInstaller(apkFile: File) {
        val uri = FileProvider.getUriForFile(activity, "${activity.packageName}.fileprovider", apkFile)
        val intent = Intent(Intent.ACTION_INSTALL_PACKAGE).apply {
            data = uri
            putExtra(Intent.EXTRA_NOT_UNKNOWN_SOURCE, true)
            putExtra(Intent.EXTRA_RETURN_RESULT, false)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        activity.startActivity(intent)
    }

    private fun emitProgress(requestId: String, downloadedBytes: Long, contentLength: Long?) {
        val percent = contentLength?.let { ((downloadedBytes * 100) / it).coerceIn(0, 99) }
        val data = JSONObject()
            .put("downloadedBytes", downloadedBytes)
            .put("contentLength", contentLength ?: JSONObject.NULL)
            .put("percent", percent ?: JSONObject.NULL)
        emit(requestId, "download-progress", data)
    }

    private fun emit(requestId: String, event: String, data: JSONObject) {
        val detail = JSONObject()
            .put("requestId", requestId)
            .put("event", event)
            .put("data", data)
            .toString()
        val script = "window.dispatchEvent(new CustomEvent('knownext-android-updater', { detail: $detail }))"
        webView.post { webView.evaluateJavascript(script, null) }
    }

    private fun currentPackageInfo(): PackageInfo {
        val flags = packageInfoFlags()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.packageManager.getPackageInfo(activity.packageName, PackageManager.PackageInfoFlags.of(flags.toLong()))
        } else {
            @Suppress("DEPRECATION")
            activity.packageManager.getPackageInfo(activity.packageName, flags)
        }
    }

    private fun packageArchiveInfo(apkFile: File): PackageInfo? {
        val flags = packageInfoFlags()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.packageManager.getPackageArchiveInfo(apkFile.absolutePath, PackageManager.PackageInfoFlags.of(flags.toLong()))
        } else {
            @Suppress("DEPRECATION")
            activity.packageManager.getPackageArchiveInfo(apkFile.absolutePath, flags)
        }
    }

    private fun packageInfoFlags(): Int {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            PackageManager.GET_SIGNING_CERTIFICATES
        } else {
            @Suppress("DEPRECATION")
            PackageManager.GET_SIGNATURES
        }
    }

    private fun longVersionCode(info: PackageInfo): Long {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else {
            @Suppress("DEPRECATION")
            info.versionCode.toLong()
        }
    }

    private fun sameSigningCertificate(installed: PackageInfo, candidate: PackageInfo): Boolean {
        val installedDigests = signingDigests(installed)
        val candidateDigests = signingDigests(candidate)
        return installedDigests.isNotEmpty() && installedDigests == candidateDigests
    }

    @SuppressLint("PackageManagerGetSignatures")
    private fun signingDigests(info: PackageInfo): Set<String> {
        val signatures = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val signingInfo = info.signingInfo ?: return emptySet()
            signingInfo.apkContentsSigners
        } else {
            @Suppress("DEPRECATION")
            info.signatures
        } ?: return emptySet()

        return signatures.map { signature ->
            MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it) }
        }.toSet()
    }

    private fun describeUpdateFetchError(error: Exception): String {
        return when (error) {
            is UnknownHostException -> "No se pudo conectar para buscar actualizaciones. Revisa la conexión a Internet."
            is SocketTimeoutException -> "La búsqueda de actualizaciones tardó demasiado. Vuelve a intentarlo."
            else -> error.message ?: "No se pudo buscar actualizaciones."
        }
    }

    private fun normalizeSha256(value: String): String = value.lowercase().replace(":", "").trim()
}
