import { chmodSync, copyFileSync, mkdirSync, rmSync, readFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const version = readFileSync(join(repoRoot, "VERSION"), "utf8").trim();
const sdkRoot = process.env.ANDROID_HOME ?? join(process.env.LOCALAPPDATA ?? "", "Android", "Sdk");
const ndkHome = process.env.NDK_HOME ?? join(sdkRoot, "ndk", "28.2.13676358");
const javaHome = process.env.JAVA_HOME ?? "C:\\Program Files\\Android\\Android Studio\\jbr";
const abi = process.env.KNOWNEXT_ANDROID_ABI ?? "arm64";
const androidApiLevel = process.env.KNOWNEXT_ANDROID_API_LEVEL ?? "35";
const llvmBin = join(ndkHome, "toolchains", "llvm", "prebuilt", process.platform === "win32" ? "windows-x86_64" : "linux-x86_64", "bin");
const commandExtension = process.platform === "win32" ? ".cmd" : "";

const targets = {
  arm64: {
    manifestAbi: "arm64-v8a",
    rustTarget: "aarch64-linux-android",
    linker: `aarch64-linux-android${androidApiLevel}-clang${commandExtension}`,
    jniFolder: "arm64-v8a",
    gradleTask: ":app:assembleArm64Release",
    apkPath: ["arm64", "release", "app-arm64-release.apk"],
    outputName: `KnowNext.ai-android-arm64-v${version}.apk`,
  },
};

const target = targets[abi];
if (!target) {
  throw new Error(`Unsupported KNOWNEXT_ANDROID_ABI=${abi}. Use one of: ${Object.keys(targets).join(", ")}`);
}

assertAndroidSigningEnvironment();

const env = {
  ...process.env,
  JAVA_HOME: javaHome,
  ANDROID_HOME: sdkRoot,
  NDK_HOME: ndkHome,
  VITE_EXPECTED_BACKEND_PROFILE: process.env.VITE_EXPECTED_BACKEND_PROFILE ?? "mobile",
  PATH: [
    join(javaHome, "bin"),
    join(sdkRoot, "cmdline-tools", "latest", "bin"),
    join(sdkRoot, "platform-tools"),
    llvmBin,
    process.env.PATH ?? "",
  ].join(delimiter),
};

env[`CARGO_TARGET_${target.rustTarget.toUpperCase().replaceAll("-", "_")}_LINKER`] = join(llvmBin, target.linker);

console.log(`KnowNext.ai Android release build`);
console.log(`Version: ${version}`);
console.log(`ABI: ${abi}`);

assertNoClientSecretEnvironment(env);
run("pnpm", ["build"], repoRoot, env);
run("node", ["scripts/check-client-bundle-clean.mjs", "apps/desktop/dist"], repoRoot, env);
run(
  "cargo",
  ["build", "--target", target.rustTarget, "--features", "custom-protocol", "--release"],
  join(repoRoot, "apps", "desktop", "src-tauri"),
  env,
);

const sourceLibrary = join(repoRoot, "apps", "desktop", "src-tauri", "target", target.rustTarget, "release", "libknownext_ai_desktop_lib.so");
const jniDir = join(repoRoot, "apps", "desktop", "src-tauri", "gen", "android", "app", "src", "main", "jniLibs", target.jniFolder);
const jniLibrary = join(jniDir, "libknownext_ai_desktop_lib.so");
mkdirSync(jniDir, { recursive: true });
copyFileSync(sourceLibrary, jniLibrary);

try {
  const gradleWrapper = join(repoRoot, "apps", "desktop", "src-tauri", "gen", "android", process.platform === "win32" ? "gradlew.bat" : "gradlew");
  if (process.platform !== "win32") chmodSync(gradleWrapper, 0o755);
  run(
    process.platform === "win32" ? "gradlew.bat" : "./gradlew",
    [target.gradleTask, "-x", target.gradleTask.replace("assemble", "rustBuild")],
    join(repoRoot, "apps", "desktop", "src-tauri", "gen", "android"),
    env,
  );

  const apk = join(repoRoot, "apps", "desktop", "src-tauri", "gen", "android", "app", "build", "outputs", "apk", ...target.apkPath);
  const output = join(repoRoot, "output", target.outputName);
  mkdirSync(dirname(output), { recursive: true });
  copyFileSync(apk, output);
  console.log(`APK: ${output}`);
} finally {
  rmSync(jniLibrary, { force: true });
}

function run(command, args, cwd, env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    shell: process.platform === "win32",
    stdio: "inherit",
  });
  if (result.status !== 0) {
    const reason = result.error?.message ?? result.signal ?? result.status;
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${reason}`);
  }
}

function assertAndroidSigningEnvironment() {
  const required = ["ANDROID_KEYSTORE_PATH", "ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD"];
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Android release builds require signing environment variables: ${missing.join(", ")}`);
  }
}

function assertNoClientSecretEnvironment(env) {
  const unsafeKeys = Object.keys(env).filter((key) => {
    const normalized = key.toUpperCase();
    return normalized.startsWith("VITE_OPENAI") || (normalized.startsWith("VITE_") && normalized.includes("API_KEY"));
  });
  if (unsafeKeys.length > 0) {
    throw new Error(`Refusing to build Android with client-exposed secret variables: ${unsafeKeys.join(", ")}`);
  }

  for (const [key, value] of Object.entries(env)) {
    if (!key.toUpperCase().startsWith("VITE_") || typeof value !== "string") continue;
    if (/sk-[A-Za-z0-9_-]{20,}/.test(value)) {
      throw new Error(`Refusing to build Android because ${key} looks like an OpenAI API key.`);
    }
  }
}
