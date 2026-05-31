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
  { name: "desktop app data path", pattern: /KnowNext\.ai[\\/](projects|drafts|logs)/ },
  { name: "mobile development app data path", pattern: /ai\.knownext\.mobile-dev/ },
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
