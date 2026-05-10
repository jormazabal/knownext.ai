import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { DocumentTabs } from "./DocumentTabs";

const tabs = [
  { id: "doc-a", name: "Acta.md" },
  { id: "doc-b", name: "Esquemas.md" },
];

describe("DocumentTabs", () => {
  it("shows a compact navigation opener when provided", async () => {
    const onOpenNavigation = vi.fn();

    const { unmount } = render(
      <DocumentTabs
        tabs={tabs}
        activeDocumentId="doc-a"
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
        activeDocumentId="doc-a"
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
});
