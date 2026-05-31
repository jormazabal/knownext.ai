import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const apkPath = args.get("--apk");
const outputPath = args.get("--out") ?? "output/android-latest.json";
const versionName = args.get("--version") ?? readFileSync("VERSION", "utf8").trim();
const versionCode = args.has("--version-code") ? Number(args.get("--version-code")) : androidVersionCode(versionName);
const applicationId = args.get("--application-id") ?? "ai.knownext.mobile";
const channel = args.get("--channel") ?? "private-stable";
const abi = args.get("--abi") ?? "arm64-v8a";
const url = args.get("--url");
const notesUrl = args.get("--notes-url");

if (!apkPath) throw new Error("Missing --apk <path>.");
if (!Number.isInteger(versionCode) || versionCode <= 0) throw new Error("Missing valid --version-code <number>.");
if (!url?.startsWith("https://")) throw new Error("Missing HTTPS --url for the APK artifact.");

const absoluteApkPath = resolve(apkPath);
const apk = readFileSync(absoluteApkPath);
const stats = statSync(absoluteApkPath);
const manifest = {
  schemaVersion: 1,
  channel,
  applicationId,
  versionName,
  versionCode,
  minSupportedVersionCode: 21000,
  publishedAt: new Date().toISOString(),
  mandatory: false,
  notesUrl,
  artifacts: [
    {
      abi,
      url,
      sha256: createHash("sha256").update(apk).digest("hex"),
      size: stats.size,
      fileName: basename(absoluteApkPath),
    },
  ],
};

writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Android update manifest: ${outputPath}`);

function androidVersionCode(version) {
  const [major = 0, minor = 0, patch = 0] = version.split(".").map((part) => Number.parseInt(part, 10) || 0);
  return major * 1_000_000 + minor * 1_000 + patch;
}
