import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

val fontLicenseAssets = layout.buildDirectory.dir("generated/knownext-font-licenses")
val prepareBundledFontLicense = tasks.register<Copy>("prepareBundledFontLicense") {
    from("../../../crates/knownext-docs/assets/fonts/OFL.txt")
    into(fontLicenseAssets.map { it.dir("licenses") })
    rename("OFL.txt", "Noto-OFL.txt")
}
val protonLicenseAssets = layout.buildDirectory.dir("generated/knownext-proton-licenses")
val prepareProtonLicenses = tasks.register<Copy>("prepareProtonLicenses") {
    from("../../../resources/proton/android-notices")
    into(protonLicenseAssets.map { it.dir("licenses/proton") })
}

fun releaseVersionName(): String {
    return tauriProperties.getProperty("tauri.android.versionName")
        ?: file("../../../../../../VERSION").readText().trim()
}

fun releaseVersionCode(versionName: String): Int {
    return tauriProperties.getProperty("tauri.android.versionCode")?.toInt()
        ?: versionName.split(".").map { it.toIntOrNull() ?: 0 }.let { parts ->
            (parts.getOrElse(0) { 0 } * 1_000_000) +
                (parts.getOrElse(1) { 0 } * 1_000) +
                parts.getOrElse(2) { 0 }
        }
}

android {
    compileSdk = 36
    namespace = "ai.knownext.mobile"
    packaging { jniLibs.useLegacyPackaging = true }
    sourceSets.getByName("main").jniLibs.srcDir("../../../resources/proton/android")

    signingConfigs {
        create("knownextRelease") {
            val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH")
            if (!keystorePath.isNullOrBlank()) {
                storeFile = file(keystorePath)
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_KEY_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
    }
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "true"
        applicationId = "ai.knownext.mobile"
        minSdk = 24
        targetSdk = 36
        versionName = releaseVersionName()
        versionCode = releaseVersionCode(versionName!!)
    }
    buildTypes {
        getByName("debug") {
            if (providers.gradleProperty("knownextQa").orNull == "true") {
                applicationIdSuffix = ".v3qa"
                resValue("string", "app_name", "KnowNext.ai QA")
                resValue("string", "main_activity_title", "KnowNext.ai QA")
            }
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            signingConfig = signingConfigs.getByName("knownextRelease")
            isMinifyEnabled = true
            // Release scripts strip and hash these five exact staged binaries.
            // Avoid a second Gradle transformation invalidating that provenance.
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/libknownext_ai_desktop_lib.so")
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/libknownext_proton.so")
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/libproton_crypto.so")
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/libcrypto.so")
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/libssl.so")
            }
            proguardFiles(
                *fileTree(".") { include("**/*.pro") }
                    .plus(getDefaultProguardFile("proguard-android-optimize.txt"))
                    .toList().toTypedArray()
            )
        }
    }
    kotlinOptions {
        jvmTarget = "1.8"
    }
    buildFeatures {
        buildConfig = true
    }
    sourceSets.getByName("main").assets.srcDir(fontLicenseAssets)
    sourceSets.getByName("main").assets.srcDir(protonLicenseAssets)
}

tasks.named("preBuild").configure { dependsOn(prepareBundledFontLicense) }
tasks.named("preBuild").configure { dependsOn(prepareProtonLicenses) }

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.work:work-runtime-ktx:2.10.1")
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = "tauri.build.gradle.kts")
