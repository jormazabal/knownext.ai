import { requestJson } from "./client";
import type { DocumentTreeNode, FileOperationResult, Project, ProjectCapabilities, ProjectPayload, ProjectVersioningStatus } from "../../types/domain";

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
