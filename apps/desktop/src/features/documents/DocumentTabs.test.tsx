import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentTabs } from "./DocumentTabs";

const tabs = [
  { kind: "document" as const, id: "doc-a", name: "Acta.md" },
  { kind: "document" as const, id: "doc-b", name: "Esquemas.md" },
];

describe("DocumentTabs", () => {
  it("shows a compact navigation opener when provided", async () => {
    const onOpenNavigation = vi.fn();

    const { unmount } = render(
      <DocumentTabs
        tabs={tabs}
        activeTabId="doc-a"
        dirtyDocumentIds={[]}
        onOpenNavigation={onOpenNavigation}
        onSelectTab={vi.fn()}
        onCloseTab={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByLabelText("Abrir panel de documentos"));

    expect(onOpenNavigation).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("shows an orange dirty marker instead of the close icon on any dirty tab", async () => {
    const onCloseTab = vi.fn();

    render(
      <DocumentTabs
        tabs={tabs}
        activeTabId="doc-a"
        dirtyDocumentIds={["doc-b"]}
        onSelectTab={vi.fn()}
        onCloseTab={onCloseTab}
      />,
    );

    const dirtyCloseTarget = screen.getByLabelText("Cerrar Esquemas.md, con cambios sin guardar");
    expect(dirtyCloseTarget.querySelector(".bg-brand-orange")).toBeInTheDocument();
    expect(dirtyCloseTarget.querySelector(".lucide-x")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Cerrar Acta.md").querySelector(".lucide-x")).toBeInTheDocument();

    await userEvent.click(dirtyCloseTarget);

    expect(onCloseTab).toHaveBeenCalledWith("doc-b");
  });

  it("shows and closes release notes without a dirty marker", async () => {
    const onCloseTab = vi.fn();

    render(
      <DocumentTabs
        tabs={[...tabs, { kind: "release-notes", id: "app-release-notes", name: "Notas de release", utilityTabId: "release-notes", readonly: true }]}
        activeTabId="app-release-notes"
        dirtyDocumentIds={["app-release-notes"]}
        onSelectTab={vi.fn()}
        onCloseTab={onCloseTab}
      />,
    );

    expect(screen.getByText("Notas de release")).toBeInTheDocument();
    expect(screen.getByLabelText("Cerrar Notas de release").querySelector(".bg-brand-orange")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Cerrar Notas de release"));

    expect(onCloseTab).toHaveBeenCalledWith("app-release-notes");
  });
});
