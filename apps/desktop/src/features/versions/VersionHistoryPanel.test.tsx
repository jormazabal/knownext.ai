import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDocumentVersions, getVersionContent } from "../../lib/api/versions";
import { VersionHistoryPanel } from "./VersionHistoryPanel";
import type { VersionRecord } from "../../types/domain";

vi.mock("../../lib/api/versions", () => ({
  getDocumentVersions: vi.fn(),
  getVersionContent: vi.fn(),
}));

const getDocumentVersionsMock = vi.mocked(getDocumentVersions);
const getVersionContentMock = vi.mocked(getVersionContent);

describe("VersionHistoryPanel", () => {
  beforeEach(() => {
    getDocumentVersionsMock.mockReset();
    getVersionContentMock.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it("loads document history and previews a selected previous version", async () => {
    const versions: VersionRecord[] = [
      version("current", "abc1234", "Guardado actual", true),
      version("previous", "def5678", "Antes de cambios", false),
    ];
    const onPreviewChange = vi.fn();
    getDocumentVersionsMock.mockResolvedValue(versions);
    getVersionContentMock.mockResolvedValue({
      documentId: "doc-1",
      versionId: "previous",
      markdown: "# Version anterior",
    });

    render(
      <VersionHistoryPanel
        documentId="doc-1"
        documentName="Notas.md"
        activePreviewVersionId={null}
        onPreviewChange={onPreviewChange}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText("Historial")).toBeInTheDocument();
    expect(screen.getByText("Notas.md")).toBeInTheDocument();
    expect(await screen.findByText("Guardado actual")).toBeInTheDocument();
    expect(screen.getByText("Antes de cambios")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Antes de cambios"));

    await waitFor(() => {
      expect(getVersionContentMock).toHaveBeenCalledWith("doc-1", "previous");
      expect(onPreviewChange).toHaveBeenLastCalledWith({
        documentId: "doc-1",
        version: versions[1],
        markdown: "# Version anterior",
        mode: "diff",
      });
    });
  });

  it("returns to the live document when the current version is selected", async () => {
    const versions: VersionRecord[] = [
      version("current", "abc1234", "Guardado actual", true),
      version("previous", "def5678", "Antes de cambios", false),
    ];
    const onPreviewChange = vi.fn();
    getDocumentVersionsMock.mockResolvedValue(versions);

    render(
      <VersionHistoryPanel
        documentId="doc-1"
        documentName="Notas.md"
        activePreviewVersionId="previous"
        onPreviewChange={onPreviewChange}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByText("Guardado actual"));

    expect(onPreviewChange).toHaveBeenLastCalledWith(null);
    expect(getVersionContentMock).not.toHaveBeenCalled();
  });
});

function version(id: string, hash: string, title: string, current: boolean): VersionRecord {
  return {
    id,
    hash,
    title,
    author: "KnowNext",
    authorInitials: "KN",
    createdAt: "2026-06-04T10:00:00.000Z",
    relativeTime: "hace un momento",
    current,
  };
}
