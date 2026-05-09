import { documentTree, projects } from "../mockData";
import { mockDelay, requestJson } from "./client";
import type { DocumentTreeNode, FileOperationResult, Project, ProjectPayload } from "../../types/domain";

const USE_BACKEND = import.meta.env.VITE_USE_BACKEND !== "false";

export async function listProjects(): Promise<Project[]> {
  if (USE_BACKEND) {
    return requestJson<Project[]>("/api/projects");
  }
  return mockDelay(projects);
}

export async function getActiveProject(): Promise<Project> {
  if (USE_BACKEND) {
    return requestJson<Project>("/api/projects/active");
  }
  return mockDelay(projects.find((project) => project.active) ?? projects[0]);
}

export async function getProjectTree(projectId: string): Promise<DocumentTreeNode[]> {
  if (USE_BACKEND) {
    return requestJson<DocumentTreeNode[]>(`/api/projects/${projectId}/tree`);
  }
  return mockDelay(documentTree);
}

export async function createFolder(projectId: string, parentId: string | null, name: string): Promise<FileOperationResult> {
  if (USE_BACKEND) {
    return requestJson<FileOperationResult>(`/api/projects/${projectId}/folders`, {
      method: "POST",
      body: JSON.stringify({ parentId, name }),
    });
  }

  return mockDelay({ tree: documentTree, affectedDocuments: [] });
}

export async function createProjectDocument(
  projectId: string,
  parentId: string | null,
  name: string,
  markdown: string,
): Promise<FileOperationResult> {
  if (USE_BACKEND) {
    return requestJson<FileOperationResult>(`/api/projects/${projectId}/documents`, {
      method: "POST",
      body: JSON.stringify({ parentId, name, markdown }),
    });
  }

  return mockDelay({ tree: documentTree, affectedDocuments: [] });
}

export async function renameTreeNode(projectId: string, nodeId: string, name: string): Promise<FileOperationResult> {
  if (USE_BACKEND) {
    return requestJson<FileOperationResult>(`/api/projects/${projectId}/nodes/${encodeURIComponent(nodeId)}/rename`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    });
  }

  return mockDelay({ tree: documentTree, affectedDocuments: [] });
}

export async function deleteTreeNode(projectId: string, nodeId: string): Promise<FileOperationResult> {
  if (USE_BACKEND) {
    return requestJson<FileOperationResult>(`/api/projects/${projectId}/nodes/${encodeURIComponent(nodeId)}`, {
      method: "DELETE",
    });
  }

  return mockDelay({ tree: documentTree, affectedDocuments: [] });
}

export async function duplicateProjectDocument(projectId: string, documentId: string): Promise<FileOperationResult> {
  if (USE_BACKEND) {
    return requestJson<FileOperationResult>(`/api/projects/${projectId}/documents/${encodeURIComponent(documentId)}/duplicate`, {
      method: "POST",
    });
  }

  return mockDelay({ tree: documentTree, affectedDocuments: [] });
}

export async function moveTreeNode(
  projectId: string,
  nodeId: string,
  targetFolderId: string | null,
): Promise<FileOperationResult> {
  if (USE_BACKEND) {
    return requestJson<FileOperationResult>(`/api/projects/${projectId}/nodes/${encodeURIComponent(nodeId)}/move`, {
      method: "PATCH",
      body: JSON.stringify({ targetFolderId }),
    });
  }

  return mockDelay({ tree: documentTree, affectedDocuments: [] });
}

export async function createProject(payload: ProjectPayload): Promise<Project> {
  if (USE_BACKEND) {
    return requestJson<Project>("/api/projects", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  return mockDelay({
    ...payload,
    id: `project-${crypto.randomUUID()}`,
    active: true,
    isGitRepository: false,
  });
}

export async function updateProject(projectId: string, payload: ProjectPayload): Promise<Project> {
  if (USE_BACKEND) {
    return requestJson<Project>(`/api/projects/${projectId}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  const currentProject = projects.find((project) => project.id === projectId);
  return mockDelay({
    ...(currentProject ?? {
      id: projectId,
      active: false,
      isGitRepository: false,
    }),
    ...payload,
  });
}

export async function deleteProject(projectId: string): Promise<Project[]> {
  if (USE_BACKEND) {
    return requestJson<Project[]>(`/api/projects/${projectId}`, {
      method: "DELETE",
    });
  }

  return mockDelay(projects.filter((project) => project.id !== projectId));
}

export async function setActiveProject(projectId: string): Promise<Project> {
  if (USE_BACKEND) {
    return requestJson<Project>(`/api/projects/${projectId}/active`, {
      method: "PUT",
    });
  }

  return mockDelay(projects.find((project) => project.id === projectId) ?? projects[0]);
}
