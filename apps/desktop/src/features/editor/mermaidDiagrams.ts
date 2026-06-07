export type MermaidDiagramWidth = "compact" | "auto" | "wide" | "full";

export type MermaidDiagramMetadata = {
  caption?: string | null;
  width?: MermaidDiagramWidth | null;
};

export type MermaidDiagramBlock = {
  id: string;
  code: string;
  renderCode: string;
  metadata: MermaidDiagramMetadata;
  startLine: number;
  endLine: number;
};

export type MermaidRenderedAsset = {
  id: string;
  codeHash: string;
  code: string;
  caption?: string | null;
  width?: MermaidDiagramWidth | null;
  svg: string;
  pngDataUrl: string | null;
};

const metadataPrefix = "%% knownext:";
let mermaidInitialized = false;
let mermaidIconPacksRegistered = false;
let mermaidModulePromise: Promise<typeof import("mermaid").default> | null = null;

export const defaultMermaidCode = `flowchart TD
  A["Idea"] --> B["Decision"]
  B --> C["Resultado"]`;

export function buildMermaidMarkdown({
  code,
  caption,
  width = "wide",
}: {
  code: string;
  caption?: string | null;
  width?: MermaidDiagramWidth | null;
}) {
  const normalizedCode = normalizeMermaidCode(stripKnownextDiagramMetadata(code));
  const metadata = buildKnownextDiagramMetadata({ caption, width });
  return `\`\`\`mermaid\n${metadata ? `${metadata}\n` : ""}${normalizedCode}\n\`\`\``;
}

export function normalizeMermaidCode(code: string) {
  return code.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\\n/g, "<br/>").trim();
}

export function extractKnownextDiagramMetadata(code: string): MermaidDiagramMetadata {
  const firstLine = normalizeLineBreaks(code).split("\n").find((line) => line.trim().startsWith(metadataPrefix));
  if (!firstLine) return {};

  const json = firstLine.trim().slice(metadataPrefix.length).trim();
  try {
    const parsed = JSON.parse(json) as MermaidDiagramMetadata;
    return {
      caption: typeof parsed.caption === "string" ? parsed.caption : null,
      width: isMermaidDiagramWidth(parsed.width) ? parsed.width : null,
    };
  } catch {
    return {};
  }
}

export function stripKnownextDiagramMetadata(code: string) {
  return normalizeMermaidCode(
    normalizeLineBreaks(code)
    .split("\n")
    .filter((line) => !line.trim().startsWith(metadataPrefix))
    .join("\n")
  );
}

export async function validateMermaidCode(code: string) {
  const renderCode = stripKnownextDiagramMetadata(code);
  if (!renderCode.trim()) return { valid: false, error: "El diagrama no puede estar vacio." };

  try {
    const mermaid = await ensureMermaidInitialized();
    await mermaid.parse(renderCode);
    return { valid: true, error: null };
  } catch (error) {
    return { valid: false, error: normalizeMermaidError(error) };
  }
}

export async function renderMermaidSvg(code: string, idSeed = "knownext-mermaid") {
  const renderCode = stripKnownextDiagramMetadata(code);
  if (!renderCode.trim()) throw new Error("El diagrama no puede estar vacio.");

  const mermaid = await ensureMermaidInitialized();
  const renderId = `${idSeed}-${stableHash(renderCode)}-${Date.now().toString(36)}`;
  const result = await mermaid.render(renderId, renderCode);
  return result.svg;
}

export async function renderMermaidPngDataUrl(svg: string, scale = 2) {
  if (typeof document === "undefined") return null;

  const image = new Image();
  image.decoding = "async";
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("No se pudo convertir el diagrama a imagen."));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    const width = Math.max(1, Math.ceil((image.naturalWidth || 960) * scale));
    const height = Math.max(1, Math.ceil((image.naturalHeight || 540) * scale));
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.fillStyle = "#FFFFFF";
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function findMermaidDiagramBlocks(markdown: string): MermaidDiagramBlock[] {
  const lines = normalizeLineBreaks(markdown).split("\n");
  const blocks: MermaidDiagramBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const fence = lines[index].match(/^(\s*)(`{3,}|~{3,})\s*([^\s`]*)?.*$/);
    if (!fence) {
      index += 1;
      continue;
    }

    const marker = fence[2][0];
    const length = fence[2].length;
    const language = (fence[3] ?? "").trim().toLowerCase();
    const bodyStart = index + 1;
    let bodyEnd = bodyStart;

    while (bodyEnd < lines.length) {
      const closing = lines[bodyEnd].match(/^(\s*)(`{3,}|~{3,})\s*$/);
      if (closing && closing[2][0] === marker && closing[2].length >= length) break;
      bodyEnd += 1;
    }

    if (language === "mermaid" && bodyEnd < lines.length) {
      const code = lines.slice(bodyStart, bodyEnd).join("\n");
      const metadata = extractKnownextDiagramMetadata(code);
      const renderCode = stripKnownextDiagramMetadata(code);
      const codeHash = stableHash(renderCode);
      blocks.push({
        id: `diagram-${blocks.length + 1}-${codeHash}`,
        code,
        renderCode,
        metadata,
        startLine: index + 1,
        endLine: bodyEnd + 1,
      });
    }

    index = bodyEnd + 1;
  }

  return blocks;
}

export async function prepareMermaidDiagramAssets(markdown: string): Promise<MermaidRenderedAsset[]> {
  const blocks = findMermaidDiagramBlocks(markdown);
  const assets: MermaidRenderedAsset[] = [];

  for (const block of blocks) {
    const svg = await renderMermaidSvg(block.renderCode, block.id);
    const pngDataUrl = await renderMermaidPngDataUrl(svg);
    assets.push({
      id: block.id,
      codeHash: stableHash(block.renderCode),
      code: block.renderCode,
      caption: block.metadata.caption ?? null,
      width: block.metadata.width ?? "wide",
      svg,
      pngDataUrl,
    });
  }

  return assets;
}

export function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

async function ensureMermaidInitialized() {
  const mermaid = await loadMermaid();
  if (mermaidInitialized) return mermaid;
  await registerLocalIconPacks(mermaid);
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    flowchart: {
      htmlLabels: false,
    },
    themeVariables: {
      primaryColor: "#FFF1E8",
      primaryTextColor: "#111827",
      primaryBorderColor: "#F37021",
      lineColor: "#6B7280",
      secondaryColor: "#FAFAFA",
      tertiaryColor: "#FFFFFF",
      noteBkgColor: "#FFF7ED",
      noteTextColor: "#111827",
      noteBorderColor: "#FED7AA",
      edgeLabelBackground: "#FFFFFF",
      clusterBkg: "#FAFAFA",
      clusterBorder: "#E5E7EB",
      titleColor: "#111827",
    },
  });
  mermaidInitialized = true;
  return mermaid;
}

async function registerLocalIconPacks(mermaid: typeof import("mermaid").default) {
  if (mermaidIconPacksRegistered) return;
  mermaidIconPacksRegistered = true;
  const mermaidWithIcons = mermaid as unknown as {
    registerIconPacks?: (packs: Array<{ name: string; loader: () => Promise<unknown> }>) => void;
  };
  if (typeof mermaidWithIcons.registerIconPacks !== "function") return;
  mermaidWithIcons.registerIconPacks([
    {
      name: "lucide",
      loader: async () => {
        const icons = await import("@iconify-json/lucide/icons.json");
        return icons.default;
      },
    },
  ]);
}

function loadMermaid() {
  if (!mermaidModulePromise) {
    mermaidModulePromise = import("mermaid").then((module) => module.default);
  }
  return mermaidModulePromise;
}

function buildKnownextDiagramMetadata(metadata: MermaidDiagramMetadata) {
  const cleanMetadata: MermaidDiagramMetadata = {};
  if (metadata.caption?.trim()) cleanMetadata.caption = metadata.caption.trim();
  if (metadata.width && metadata.width !== "auto") cleanMetadata.width = metadata.width;
  if (Object.keys(cleanMetadata).length === 0) return "";
  return `${metadataPrefix} ${JSON.stringify(cleanMetadata)}`;
}

function normalizeLineBreaks(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function isMermaidDiagramWidth(value: unknown): value is MermaidDiagramWidth {
  return value === "compact" || value === "auto" || value === "wide" || value === "full";
}

function normalizeMermaidError(error: unknown) {
  if (error instanceof Error && error.message) return trimMermaidError(error.message);
  if (typeof error === "string" && error.trim()) return trimMermaidError(error);
  return "No se pudo validar el diagrama Mermaid.";
}

function trimMermaidError(message: string) {
  return message.replace(/\s+/g, " ").trim().slice(0, 360);
}
