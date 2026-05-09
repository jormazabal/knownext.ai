import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const expectedVersion = fs.readFileSync(path.join(root, "VERSION"), "utf8").trim();

const checks = [
  {
    label: "root package.json",
    file: "package.json",
    read: (contents) => JSON.parse(contents).version,
  },
  {
    label: "desktop package.json",
    file: "apps/desktop/package.json",
    read: (contents) => JSON.parse(contents).version,
  },
  {
    label: "Tauri config",
    file: "apps/desktop/src-tauri/tauri.conf.json",
    read: (contents) => JSON.parse(contents).version,
  },
  {
    label: "Tauri Cargo package",
    file: "apps/desktop/src-tauri/Cargo.toml",
    read: (contents) => contents.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
  },
  {
    label: "backend pyproject",
    file: "backend/pyproject.toml",
    read: (contents) => contents.match(/^version\s*=\s*"([^"]+)"/m)?.[1],
  },
];

const mismatches = checks.flatMap(({ label, file, read }) => {
  const contents = fs.readFileSync(path.join(root, file), "utf8");
  const actualVersion = read(contents);
  return actualVersion === expectedVersion
    ? []
    : [`${label} (${file}) has ${actualVersion ?? "no version"}, expected ${expectedVersion}`];
});

if (mismatches.length > 0) {
  console.error(`Version check failed. VERSION is ${expectedVersion}.`);
  for (const mismatch of mismatches) console.error(`- ${mismatch}`);
  process.exit(1);
}

console.log(`KnowNext.ai version ${expectedVersion} is consistent across release manifests.`);
