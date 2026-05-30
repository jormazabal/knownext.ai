import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentTabs } from "./DocumentTabs";

const tabs = [
  { kind: "document" as const, id: "doc-a", name: "Acta.md" },
  { kind: "document" as const, id: "doc-b", name: "Esquemas.md" },
];

describe("DocumentTabs", () => {
  afterEach(() => cleanup());

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

  it("shows fixed utility tabs as icon-only tabs without close controls", () => {
    const onCloseTab = vi.fn();

    const { container } = render(
      <DocumentTabs
        tabs={[
          { kind: "ai-conversation", id: "project-ai-conversation", name: "IA", readonly: true },
          { kind: "notes", id: "user-notes", name: "Notas", utilityTabId: "notes" },
          ...tabs,
        ]}
        activeTabId="user-notes"
        dirtyDocumentIds={["user-notes"]}
        onSelectTab={vi.fn()}
        onCloseTab={onCloseTab}
      />,
    );

    expect(screen.getByLabelText("IA")).toHaveTextContent("");
    expect(screen.getByLabelText("IA")).toHaveAttribute("data-tooltip", "IA");
    expect(screen.getByLabelText("Notas")).toHaveTextContent("");
    expect(screen.getByLabelText("Notas")).toHaveAttribute("data-tooltip", "Notas");
    expect(screen.queryByLabelText("Cerrar Notas")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cerrar IA")).not.toBeInTheDocument();
    expect(container.querySelector(".overflow-x-hidden [aria-label='IA']")).not.toBeInTheDocument();
    expect(container.querySelector(".overflow-x-hidden [aria-label='Notas']")).not.toBeInTheDocument();
    expect(onCloseTab).not.toHaveBeenCalled();
  });

  it("shows reference documents as closable read-only tabs", async () => {
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();

    render(
      <DocumentTabs
        tabs={[...tabs, { kind: "reference-document", id: "ref-budget", name: "Presupuesto.xlsx", path: "Presupuesto.xlsx", format: "xlsx", readonly: true }]}
        activeTabId="ref-budget"
        dirtyDocumentIds={["ref-budget"]}
        onSelectTab={onSelectTab}
        onCloseTab={onCloseTab}
      />,
    );

    await userEvent.click(screen.getByText("Presupuesto.xlsx"));

    expect(onSelectTab).toHaveBeenCalledWith("ref-budget");
    expect(screen.getByLabelText("Cerrar Presupuesto.xlsx").querySelector(".bg-brand-orange")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Cerrar Presupuesto.xlsx"));

    expect(onCloseTab).toHaveBeenCalledWith("ref-budget");
  });

  it("reorders document tabs with drag and drop without making fixed tabs draggable", () => {
    const onReorderDocumentTabs = vi.fn();
    const dataTransfer = createDataTransfer();
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 160,
      bottom: 36,
      width: 160,
      height: 36,
      toJSON: () => ({}),
    });

    try {
      render(
        <DocumentTabs
          tabs={[
            { kind: "ai-conversation", id: "project-ai-conversation", name: "IA", readonly: true },
            { kind: "notes", id: "user-notes", name: "Notas", utilityTabId: "notes" },
            ...tabs,
          ]}
          activeTabId="doc-a"
          dirtyDocumentIds={[]}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onReorderDocumentTabs={onReorderDocumentTabs}
        />,
      );

      expect(screen.getByLabelText("IA")).toHaveAttribute("draggable", "false");
      expect(screen.getByLabelText("Notas")).toHaveAttribute("draggable", "false");
      expect(screen.getByLabelText("Acta.md")).toHaveAttribute("draggable", "true");

      fireEvent.dragStart(screen.getByLabelText("Esquemas.md"), { dataTransfer });
      fireEvent.dragOver(screen.getByLabelText("Acta.md"), { dataTransfer, clientX: 120 });
      fireEvent.drop(screen.getByLabelText("Acta.md"), { dataTransfer, clientX: 120 });

      expect(onReorderDocumentTabs).toHaveBeenCalledWith("doc-b", "doc-a", "after");
    } finally {
      rectSpy.mockRestore();
    }
  });

  it("shows overflow controls and a vertical tab list when open tabs do not fit", async () => {
    const scrollWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollWidth");
    const clientWidthDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "clientWidth");
    Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
      configurable: true,
      get() {
        return String(this.className).includes("overflow-x-hidden") ? 1200 : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientWidth", {
      configurable: true,
      get() {
        return String(this.className).includes("overflow-x-hidden") ? 320 : 0;
      },
    });

    try {
      const onSelectTab = vi.fn();
      render(
        <DocumentTabs
          tabs={[
            ...tabs,
            { kind: "document", id: "doc-c", name: "API publica.md" },
            { kind: "reference-document", id: "ref-xlsx", name: "Datos.xlsx", path: "Datos.xlsx", format: "xlsx", readonly: true },
            { kind: "reference-document", id: "ref-docx", name: "Informe.docx", path: "Informe.docx", format: "docx", readonly: true },
          ]}
          activeTabId="doc-c"
          dirtyDocumentIds={[]}
          onSelectTab={onSelectTab}
          onCloseTab={vi.fn()}
        />,
      );

      expect(screen.getByLabelText("Mostrar pestañas abiertas")).toBeInTheDocument();
      expect(screen.getByLabelText("Pestaña anterior")).toBeInTheDocument();
      expect(screen.getByLabelText("Pestaña siguiente")).toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Pestaña siguiente"));
      await userEvent.click(screen.getByLabelText("Pestaña anterior"));

      expect(onSelectTab).toHaveBeenNthCalledWith(1, "ref-xlsx");
      expect(onSelectTab).toHaveBeenNthCalledWith(2, "doc-b");

      await userEvent.click(screen.getByLabelText("Mostrar pestañas abiertas"));

      expect(screen.getAllByText("Datos.xlsx").length).toBeGreaterThan(1);
      expect(screen.getAllByText("Informe.docx").length).toBeGreaterThan(1);
    } finally {
      if (scrollWidthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "scrollWidth", scrollWidthDescriptor);
      }
      if (clientWidthDescriptor) {
        Object.defineProperty(HTMLElement.prototype, "clientWidth", clientWidthDescriptor);
      }
    }
  });
});

function createDataTransfer() {
  const data = new Map<string, string>();
  return {
    effectAllowed: "",
    dropEffect: "",
    getData: vi.fn((type: string) => data.get(type) ?? ""),
    setData: vi.fn((type: string, value: string) => {
      data.set(type, value);
    }),
  } as unknown as DataTransfer;
}
