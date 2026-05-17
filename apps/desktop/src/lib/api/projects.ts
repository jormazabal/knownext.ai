import { API_BASE_URL, requestFormData, requestJson } from "./client";
import type {
  AssetImportResponse,
  AssetMetadata,
  AssetUsageResponse,
  DocumentMoveImpact,
  DocumentTreeNode,
  FileOperationResult,
  InsertImageReferenceResponse,
  Project,
  ProjectCapabilities,
  ProjectPayload,
  ProjectVersioningStatus,
} from "../../types/domain";

export async function listProjects(): Promise<Project[]> {
  return requestJson<Project[]>("/api/projects");
}

export async function getActiveProject(): Promise<Project> {
  return requestJson<Project>("/api/projects/active");
}

export async function getProjectTree(projectId: string): Promise<DocumentTreeNode[]> {
  return requestJson<DocumentTreeNode[]>(`/api/projects/${projectId}/tree`);
}

export async function getProjectCapabilities(): Promise<ProjectCapabilities> {
  return requestJson<ProjectCapabilities>("/api/projects/capabilities");
}

export async function getProjectVersioningStatus(projectId: string): Promise<ProjectVersioningStatus> {
  return requestJson<ProjectVersioningStatus>(`/api/projects/${projectId}/versioning/status`);
}

export async function pullProject(projectId: string): Promise<{ status: string; message: string }> {
  return requestJson<{ status: string; message: string }>(`/api/projects/${projectId}/sync/pull`, { method: "POST" });
}

export async function pushProject(projectId: string): Promise<{ status: string; message: string }> {
  return requestJson<{ status: string; message: string }>(`/api/projects/${projectId}/sync/push`, { method: "POST" });
}

export async function createFolder(projectId: string, parentId: string | null, name: string): Promise<FileOperationResult> {
  return requestJson<FileOperationResult>(`/api/projects/${projectId}/folders`, {
    method: "POST",
    body: JSON.stringify({ parentId, name }),
  });
}

export async function createProjectDocument(
  projectId: string,
  parentId: string | null,
  name: string,
  markdown: string,
): Promise<FileOperationResult> {
  return requestJson<FileOperationResult>(`/api/projects/${projectId}/documents`, {
    method: "POST",
    body: JSON.stringify({ parentId, name, markdown }),
  });
}

export async function renameTreeNode(projectId: string, nodeId: string, name: string): Promise<FileOperationResult> {
  return requestJson<FileOperationResult>(`/api/projects/${projectId}/nodes/${encodeURIComponent(nodeId)}/rename`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export async function deleteTreeNode(projectId: string, nodeId: string): Promise<FileOperationResult> {
  return requestJson<FileOperationResult>(`/api/projects/${projectId}/nodes/${encodeURIComponent(nodeId)}`, {
    method: "DELETE",
  });
}

export async function duplicateProjectDocument(projectId: string, documentId: string): Promise<FileOperationResult> {
  return requestJson<FileOperationResult>(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/duplicate`, {
    method: "POST",
  });
}

export async function moveTreeNode(
  projectId: string,
  nodeId: string,
  targetFolderId: string | null,
): Promise<FileOperationResult> {
  return requestJson<FileOperationResult>(`/api/projects/${projectId}/nodes/${encodeURIComponent(nodeId)}/move`, {
    method: "PATCH",
    body: JSON.stringify({ targetFolderId }),
  });
}

export async function createProject(payload: ProjectPayload): Promise<Project> {
  return requestJson<Project>("/api/projects", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateProject(projectId: string, payload: ProjectPayload): Promise<Project> {
  return requestJson<Project>(`/api/projects/${projectId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteProject(projectId: string): Promise<Project[]> {
  return requestJson<Project[]>(`/api/projects/${projectId}`, {
    method: "DELETE",
  });
}

export async function setActiveProject(projectId: string): Promise<Project> {
  return requestJson<Project>(`/api/projects/${projectId}/active`, {
    method: "PUT",
  });
}

export async function importProjectImage(projectId: string, parentId: string | null, file: File): Promise<AssetImportResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const params = new URLSearchParams();
  if (parentId) params.set("parentId", parentId);
  const query = params.toString();
  return requestFormData<AssetImportResponse>(`/api/projects/${projectId}/assets/images${query ? `?${query}` : ""}`, formData);
}

export async function importProjectAttachment(projectId: string, parentId: string | null, file: File): Promise<FileOperationResult> {
  const formData = new FormData();
  formData.append("file", file);
  const params = new URLSearchParams();
  if (parentId) params.set("parentId", parentId);
  const query = params.toString();
  return requestFormData<FileOperationResult>(`/api/projects/${projectId}/attachments${query ? `?${query}` : ""}`, formData);
}

export async function getProjectImage(projectId: string, assetId: string): Promise<AssetMetadata> {
  return requestJson<AssetMetadata>(`/api/projects/${projectId}/assets/${encodeURIComponent(assetId)}`);
}

export async function getProjectImageUsage(projectId: string, assetId: string): Promise<AssetUsageResponse> {
  return requestJson<AssetUsageResponse>(`/api/projects/${projectId}/assets/${encodeURIComponent(assetId)}/usage`);
}

export function getProjectImageContentUrl(projectId: string, assetId: string): string {
  return `${API_BASE_URL}/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(assetId)}/content`;
}

export async function buildImageReference(projectId: string, documentId: string, assetId: string, altText?: string | null): Promise<InsertImageReferenceResponse> {
  return requestJson<InsertImageReferenceResponse>(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/image-reference`, {
    method: "POST",
    body: JSON.stringify({ assetId, altText }),
  });
}

export async function getDocumentMoveImpact(projectId: string, documentId: string): Promise<DocumentMoveImpact> {
  return requestJson<DocumentMoveImpact>(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/move-impact`);
}

export async function reindexProjectImages(projectId: string): Promise<{ projectId: string; imageCount: number; indexedImageCount: number; status: string }> {
  return requestJson(`/api/projects/${projectId}/assets/reindex-images`, { method: "POST" });
}
