import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { networkInterfaces, homedir } from "node:os";
import { join } from "node:path";

const appDataRoot = process.env.KNOWNEXT_APP_DATA_DIR ?? (process.env.APPDATA ? join(process.env.APPDATA, "ai.knownext.mobile-dev") : join(homedir(), ".knownext.ai-mobile-dev"));
mkdirSync(appDataRoot, { recursive: true });

const bindHost = process.env.KNOWNEXT_API_HOST ?? "0.0.0.0";
const publicHost = process.env.KNOWNEXT_PUBLIC_API_HOST ?? resolveLanAddress();
const port = process.env.KNOWNEXT_API_PORT ?? "8775";

const env = {
  ...process.env,
  KNOWNEXT_APP_DATA_DIR: appDataRoot,
  KNOWNEXT_API_HOST: publicHost,
  KNOWNEXT_API_PORT: String(port),
  KNOWNEXT_RUNTIME_PROFILE: "mobile",
  KNOWNEXT_MANAGED_BY: "manual",
};

const args = [
  "-m",
  "uvicorn",
  "app.main:app",
  "--host",
  bindHost,
  "--port",
  String(port),
];

console.log(`KnowNext.ai mobile backend bind: http://${bindHost}:${port}`);
console.log(`KnowNext.ai mobile backend URL for Android: http://${publicHost}:${port}`);
console.log(`KnowNext.ai mobile data: ${appDataRoot}`);

const child = spawn("python", args, {
  cwd: "backend",
  env,
  shell: process.platform === "win32",
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

function resolveLanAddress() {
  const interfaces = networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) return entry.address;
    }
  }
  return "127.0.0.1";
}
