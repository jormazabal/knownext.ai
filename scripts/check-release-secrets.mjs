const requiredSecrets = [
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "KNOWNEXT_GITHUB_CLIENT_ID",
  "ANDROID_KEYSTORE_PASSWORD",
  "ANDROID_KEY_ALIAS",
  "ANDROID_KEY_PASSWORD",
];

const hasAndroidKeystore =
  Boolean(process.env.ANDROID_KEYSTORE_PATH?.trim()) ||
  Boolean(process.env.ANDROID_KEYSTORE_BASE64?.trim());

const missing = requiredSecrets.filter((name) => !process.env[name]?.trim());
if (!hasAndroidKeystore) {
  missing.push("ANDROID_KEYSTORE_PATH or ANDROID_KEYSTORE_BASE64");
}

if (missing.length > 0) {
  console.error("Release signing preflight failed. Missing required signing inputs:");
  for (const name of missing) console.error(`- ${name}`);
  process.exit(1);
}

console.log("Release signing preflight passed.");
