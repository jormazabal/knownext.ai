import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalChangesBanner } from "./ExternalChangesBanner";
import type { ExternalChangeSet } from "../../types/domain";

describe("ExternalChangesBanner", () => {
  afterEach(() => {
    cleanup();
  });

  it("does not render when there are no detected changes", () => {
    render(<ExternalChangesBanner changeSet={noChanges} syncState="synced" busy={false} onReview={vi.fn()} onImportSafe={vi.fn()} />);

    expect(screen.queryByText(/Cambios para guardar/)).not.toBeInTheDocument();
  });

  it("allows importing safe detected changes", () => {
    const onReview = vi.fn();
    const onImportSafe = vi.fn();

    render(<ExternalChangesBanner changeSet={safeChanges} syncState="synced" busy={false} onReview={onReview} onImportSafe={onImportSafe} />);

    expect(screen.getByText("Cambios para guardar")).toBeInTheDocument();
    expect(screen.getByText("1 nuevos · 1 modificados · 2 cambios externos")).toBeInTheDocument();
    expect(screen.getByText("Listo")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Revisar" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar recomendados" }));

    expect(onReview).toHaveBeenCalledTimes(1);
    expect(onImportSafe).toHaveBeenCalledTimes(1);
  });

  it("requires review for risky changes and disables automatic import while busy", () => {
    const onReview = vi.fn();
    const onImportSafe = vi.fn();

    render(<ExternalChangesBanner changeSet={reviewChanges} syncState="review-required" busy onReview={onReview} onImportSafe={onImportSafe} />);

    expect(screen.getByText("Cambios para guardar requieren revisión")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar recomendados" })).not.toBeInTheDocument();

    const reviewButton = screen.getByRole("button", { name: "Revisar" });
    expect(reviewButton).toBeDisabled();
    fireEvent.click(reviewButton);

    expect(onReview).not.toHaveBeenCalled();
    expect(onImportSafe).not.toHaveBeenCalled();
  });
});

const summary = {
  total: 0,
  safe: 0,
  review: 0,
  blocked: 0,
  added: 0,
  modified: 0,
  deleted: 0,
  folders: 0,
  documents: 0,
  images: 0,
  attachments: 0,
  omitted: 0,
  totalBytes: 0,
};

const noChanges: ExternalChangeSet = {
  id: "changes-empty",
  projectId: "project-1",
  title: "Sin cambios",
  source: "filesystem",
  status: "none",
  detectedAt: "2026-06-04T10:00:00.000Z",
  requiresReview: false,
  summary,
  items: [],
};

const safeChanges: ExternalChangeSet = {
  ...noChanges,
  id: "changes-safe",
  title: "2 cambios externos",
  status: "safe",
  summary: {
    ...summary,
    total: 2,
    safe: 2,
    added: 1,
    modified: 1,
    documents: 2,
  },
};

const reviewChanges: ExternalChangeSet = {
  ...safeChanges,
  id: "changes-review",
  status: "needs-review",
  requiresReview: true,
  summary: {
    ...safeChanges.summary,
    safe: 1,
    review: 1,
  },
};
