import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(process.argv[2] ?? "apps/desktop/dist");

const forbiddenFilenames = new Set([
  "projects.json",
  "config.json",
  "credentials.json",
  "notes.json",
  "activity.json",
  "ai-pending-deletes.json",
  "ai-pending-intents.json",
]);

const forbiddenContent = [
  { name: "OpenAI API key", pattern: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: "OPENAI_API_KEY", pattern: /OPENAI_API_KEY/ },
  { name: "VITE_OPENAI", pattern: /VITE_OPENAI/ },
  { name: "seed project Proyecto Alpha", pattern: /Proyecto Alpha/ },
  { name: "seed project Proyecto Beta", pattern: /Proyecto Beta/ },
  { name: "seed project Proyecto Gamma", pattern: /Proyecto Gamma/ },
  { name: "mock GitHub user login", pattern: /knownext-dev/ },
  { name: "mock GitHub user name", pattern: /KnowNext Dev/ },
  { name: "development GitHub login copy", pattern: /Modo desarrollo/ },
  { name: "GitHub OAuth development env marker", pattern: /KNOWNEXT_GITHUB_CLIENT_ID/ },
  { name: "desktop app data path", pattern: /KnowNext\.ai[\\/](projects|drafts|logs)/ },
  { name: "mobile development app data path", pattern: /ai\.knownext\.mobile-dev/ },
  { name: "removed runtime marker A", pattern: removedRuntimePattern(["F", "a", "s", "t", "A", "P", "I"]) },
  { name: "removed runtime marker B", pattern: removedRuntimePattern(["u", "v", "i", "c", "o", "r", "n"]) },
  { name: "removed runtime marker C", pattern: removedRuntimePattern(["k", "n", "o", "w", "n", "e", "x", "t", "-", "b", "a", "c", "k", "e", "n", "d"]) },
  { name: "removed runtime marker D", pattern: removedRuntimePattern(["V", "I", "T", "E", "_", "A", "P", "I", "_", "B", "A", "S", "E", "_", "U", "R", "L"]) },
  { name: "removed runtime marker E", pattern: removedRuntimePattern(["b", "a", "c", "k", "e", "n", "d", " ", "s", "i", "d", "e", "c", "a", "r"], "i") },
];

for (const file of walkFiles(root)) {
  if (forbiddenFilenames.has(basename(file))) {
    throw new Error(`Client bundle contains runtime data file: ${file}`);
  }

  const content = readFileSync(file, "utf8");
  for (const { name, pattern } of forbiddenContent) {
    if (pattern.test(content)) {
      throw new Error(`Client bundle contains forbidden ${name}: ${file}`);
    }
  }
}

console.log(`Client bundle clean: ${root}`);

function* walkFiles(directory) {
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      yield* walkFiles(fullPath);
    } else if (stats.isFile()) {
      yield fullPath;
    }
  }
}

function removedRuntimePattern(parts, flags = "") {
  return new RegExp(parts.join(""), flags);
}
