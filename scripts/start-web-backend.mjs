import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const appDataRoot = process.env.APPDATA ? join(process.env.APPDATA, "ai.knownext.web") : join(homedir(), ".knownext.ai-web");
mkdirSync(appDataRoot, { recursive: true });

const env = {
  ...process.env,
  KNOWNEXT_APP_DATA_DIR: process.env.KNOWNEXT_APP_DATA_DIR ?? appDataRoot,
  KNOWNEXT_API_HOST: process.env.KNOWNEXT_API_HOST ?? "127.0.0.1",
  KNOWNEXT_API_PORT: process.env.KNOWNEXT_API_PORT ?? "8766",
};

const args = [
  "-m",
  "uvicorn",
  "app.main:app",
  "--reload",
  "--host",
  env.KNOWNEXT_API_HOST,
  "--port",
  env.KNOWNEXT_API_PORT,
];

console.log(`KnowNext.ai web backend: http://${env.KNOWNEXT_API_HOST}:${env.KNOWNEXT_API_PORT}`);
console.log(`KnowNext.ai web data: ${env.KNOWNEXT_APP_DATA_DIR}`);

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
