import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

const appDataRoot = process.env.APPDATA ? join(process.env.APPDATA, "ai.knownext.web") : join(homedir(), ".knownext.ai-web");
mkdirSync(appDataRoot, { recursive: true });
const host = process.env.KNOWNEXT_API_HOST ?? "127.0.0.1";
const port = process.env.KNOWNEXT_API_PORT ?? await resolveAvailablePort(host, range(8766, 8799));

const env = {
  ...process.env,
  KNOWNEXT_APP_DATA_DIR: appDataRoot,
  KNOWNEXT_API_HOST: host,
  KNOWNEXT_API_PORT: String(port),
  KNOWNEXT_RUNTIME_PROFILE: "web-dev",
  KNOWNEXT_MANAGED_BY: "manual",
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

async function resolveAvailablePort(host, candidates) {
  for (const candidate of candidates) {
    if (await canListen(host, candidate)) return candidate;
  }
  throw new Error(`No hay puertos libres para el backend web en ${host}: ${candidates.join(", ")}`);
}

function canListen(host, port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
