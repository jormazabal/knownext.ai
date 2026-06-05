import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReadonlyMarkdownViewer } from "./ReadonlyMarkdownViewer";

const milkdownMocks = vi.hoisted(() => {
  const crepeInstances: Array<{
    config: Record<string, unknown>;
    setReadonly: ReturnType<typeof vi.fn>;
    use: ReturnType<typeof vi.fn>;
  }> = [];

  return { crepeInstances };
});

vi.mock("@milkdown/react", () => ({
  Milkdown: () => <div data-testid="milkdown-root" />,
  MilkdownProvider: ({ children }: { children: React.ReactNode }) => <div data-testid="milkdown-provider">{children}</div>,
  useEditor: (factory: (root: HTMLElement) => unknown) => {
    factory(document.createElement("div"));
    return { loading: false, get: () => null };
  },
}));

vi.mock("@milkdown/crepe", () => ({
  Crepe: class MockCrepe {
    static Feature = {
      BlockEdit: "block-edit",
      LinkTooltip: "link-tooltip",
      Toolbar: "toolbar",
    };

    editor = {
      config: vi.fn(),
      use: vi.fn(() => this.editor),
    };

    setReadonly = vi.fn();

    constructor(config: Record<string, unknown>) {
      milkdownMocks.crepeInstances.push({
        config,
        setReadonly: this.setReadonly,
        use: this.editor.use,
      });
    }
  },
}));

describe("ReadonlyMarkdownViewer", () => {
  beforeEach(() => {
    milkdownMocks.crepeInstances.length = 0;
  });

  it("shows the configured empty state without mounting Milkdown", () => {
    render(<ReadonlyMarkdownViewer markdown="  " ariaLabel="Vista previa" emptyMessage="Sin contenido." zoomPercent={125} />);

    expect(screen.getByLabelText("Vista previa")).toBeInTheDocument();
    expect(screen.getByText("Sin contenido.")).toBeInTheDocument();
    expect(screen.queryByTestId("milkdown-provider")).not.toBeInTheDocument();
    expect(screen.getByText("Sin contenido.").parentElement).toHaveStyle({ "--knownext-markdown-zoom": "1.25" });
  });

  it("mounts Milkdown as a readonly viewer for Markdown content", () => {
    render(<ReadonlyMarkdownViewer markdown={"# Release\n\nContenido"} ariaLabel="Notas de release" emptyMessage="Sin notas." zoomPercent={90} />);

    expect(screen.getByLabelText("Notas de release")).toBeInTheDocument();
    expect(screen.getByTestId("milkdown-root")).toBeInTheDocument();
    expect(screen.queryByText("Sin notas.")).not.toBeInTheDocument();
    expect(milkdownMocks.crepeInstances).toHaveLength(1);
    expect(milkdownMocks.crepeInstances[0]?.config).toMatchObject({
      defaultValue: "# Release\n\nContenido",
      features: {
        "block-edit": false,
        "link-tooltip": false,
        toolbar: false,
      },
    });
    expect(milkdownMocks.crepeInstances[0]?.setReadonly).toHaveBeenCalledWith(true);
  });
});
