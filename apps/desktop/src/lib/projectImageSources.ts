import type { DocumentTreeNode } from "../types/domain";
import { getProjectImageContentUrl } from "./api/projects";

function images(nodes: DocumentTreeNode[]): DocumentTreeNode[] {
  return nodes.flatMap(node => node.type === "image" ? [node] : node.children ? images(node.children) : []);
}

/** View-only URL resolution. Never rewrite the Markdown or access files here. */
export function projectImageSource(source: string, projectId: string, documentPath: string, tree: DocumentTreeNode[]): string {
  if (!projectId || !documentPath || isExternal(source)) return source;
  const path = projectImagePath(source, projectId, documentPath);
  if (!path) return source;
  const image = images(tree).find(node => node.path === path);
  return image ? getProjectImageContentUrl(projectId, image.id)
    : /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(path) ? getProjectImageContentUrl(projectId, `${projectId}::${path}`) : source;
}

export function projectImageAsset(source: string, projectId: string, documentPath: string, tree: DocumentTreeNode[]) {
  const candidates = images(tree);
  const direct = candidates.find(image => source === getProjectImageContentUrl(projectId, image.id));
  if (direct) return direct;
  const path = projectImagePath(source, projectId, documentPath);
  return path ? candidates.find(image => image.path === path) ?? null : null;
}

function isExternal(source: string) { return /^(https?:|data:|knownext-asset:|mailto:|#)/i.test(source); }

function projectImagePath(source: string, projectId: string, documentPath: string): string | null {
  try {
    const legacy = `knownext-asset://${encodeURIComponent(projectId)}/`;
    let assetId: string | null = null;
    if (source.startsWith(legacy)) assetId = decodeURIComponent(source.slice(legacy.length));
    else if (/^https?:/i.test(source)) {
      const url = new URL(source);
      const parts = url.pathname.split("/").filter(Boolean);
      if (url.hostname !== "knownext-asset.localhost" || parts.length !== 2 || decodeURIComponent(parts[0]) !== projectId) return null;
      assetId = decodeURIComponent(parts[1]);
    }
    if (assetId !== null) {
      if (assetId.startsWith(`${projectId}::`)) return assetId.slice(projectId.length + 2);
      if (assetId.startsWith(`${projectId}:`)) return assetId.slice(projectId.length + 1);
      return assetId;
    }
    if (isExternal(source)) return null;
    const path = decodeURIComponent(source.split(/[?#]/, 1)[0]).replace(/\\/g, "/");
    if (!path || path.startsWith("/") || /^[a-z]:/i.test(path)) return null;
    const parts = documentPath.replace(/\\/g, "/").split("/").slice(0, -1);
    for (const part of path.split("/")) {
      if (!part || part === ".") continue;
      if (part === "..") { if (!parts.length) return null; parts.pop(); }
      else parts.push(part);
    }
    return parts.length ? parts.join("/") : null;
  } catch { return null; }
}
