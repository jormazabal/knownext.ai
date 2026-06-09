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
    vi.useRealTimers();
    cleanup();
  });

  it("loads document history and previews a selected previous version", async () => {
    const versions: VersionRecord[] = [
      version("previous", "def5678", "Antes de cambios", false, "2026-06-04T10:00:00.000Z"),
      version("current", "abc1234", "Guardado actual", true, "2026-06-04T10:05:00.000Z"),
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
    expect(await screen.findByText("abc1234")).toBeInTheDocument();
    expect(screen.getByText("def5678")).toBeInTheDocument();
    expect(screen.queryByText("Guardado actual")).not.toBeInTheDocument();
    expect(screen.queryByText("Antes de cambios")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("def5678"));

    await waitFor(() => {
      expect(getVersionContentMock).toHaveBeenCalledWith("doc-1", "previous");
      expect(onPreviewChange).toHaveBeenLastCalledWith({
        documentId: "doc-1",
        version: versions[0],
        markdown: "# Version anterior",
        mode: "diff",
      });
    });
  });

  it("returns to the live document when the current version is selected", async () => {
    const versions: VersionRecord[] = [
      version("previous", "def5678", "Antes de cambios", false, "2026-06-04T10:00:00.000Z"),
      version("current", "abc1234", "Guardado actual", true, "2026-06-04T10:05:00.000Z"),
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

    fireEvent.click(await screen.findByText("abc1234"));

    expect(onPreviewChange).toHaveBeenLastCalledWith(null);
    expect(getVersionContentMock).not.toHaveBeenCalled();
  });

  it("orders versions descending and reveals older batches with ver mas", async () => {
    const versions = Array.from({ length: 25 }, (_, index) => {
      const number = String(index + 1).padStart(2, "0");
      return version(
        `version-${number}`,
        `hash${number}`,
        `Version ${number}`,
        index === 24,
        `2026-06-04T10:${number}:00.000Z`,
      );
    });
    getDocumentVersionsMock.mockResolvedValue(versions);

    const { container } = render(
      <VersionHistoryPanel
        documentId="doc-1"
        documentName="Notas.md"
        activePreviewVersionId={null}
        onPreviewChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText("hash25")).toBeInTheDocument();
    expect(screen.getByText("hash06")).toBeInTheDocument();
    expect(screen.queryByText("hash05")).not.toBeInTheDocument();
    expect(container.textContent?.indexOf("hash25")).toBeLessThan(container.textContent?.indexOf("hash24") ?? 0);

    fireEvent.click(screen.getByRole("button", { name: "Ver más" }));

    expect(screen.getByText("hash05")).toBeInTheDocument();
    expect(screen.getByText("hash01")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ver más" })).not.toBeInTheDocument();
  });

  it("groups versions by relative ranges and shows long date plus time per row", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-06-10T12:00:00.000Z"));
    getDocumentVersionsMock.mockResolvedValue([
      version("may", "hashmay", "Mayo", false, "2026-05-20T17:26:00.000"),
      version("last-week", "hashlast", "Semana pasada", false, "2026-06-01T09:15:00.000"),
      version("this-week", "hashweek", "Esta semana", false, "2026-06-08T11:10:00.000"),
      version("yesterday", "hashayer", "Ayer", false, "2026-06-09T08:05:00.000"),
      version("today", "hashhoy", "Hoy", true, "2026-06-10T17:26:00.000"),
    ]);

    render(
      <VersionHistoryPanel
        documentId="doc-1"
        documentName="Notas.md"
        activePreviewVersionId={null}
        onPreviewChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(await screen.findByText("Hoy")).toBeInTheDocument();
    expect(screen.getByText("Ayer")).toBeInTheDocument();
    expect(screen.getByText("Esta semana")).toBeInTheDocument();
    expect(screen.getByText("Semana pasada")).toBeInTheDocument();
    expect(screen.getByText("mayo 2026")).toBeInTheDocument();
    expect(screen.getByText(/miércoles, 10 de junio de 2026 · 17:26/)).toBeInTheDocument();
    expect(screen.getByText(/miércoles, 20 de mayo de 2026 · 17:26/)).toBeInTheDocument();
  });
});

function version(id: string, hash: string, title: string, current: boolean, createdAt = "2026-06-04T10:00:00.000Z"): VersionRecord {
  return {
    id,
    hash,
    title,
    author: "KnowNext",
    authorInitials: "KN",
    createdAt,
    relativeTime: "hace un momento",
    current,
  };
}
