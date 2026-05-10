import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MarkdownToolbar } from "./MarkdownToolbar";

describe("MarkdownToolbar", () => {
  it("marks active editor formats and keeps toolbar actions available", async () => {
    const onRunEditorAction = vi.fn();

    render(
      <MarkdownToolbar
        historyOpen={false}
        historyEnabled
        historyDisabledReason="Historial no disponible"
        editorReady
        activeActions={{
          "heading-2": true,
          bold: true,
          "bullet-list": true,
        }}
        onRunEditorAction={onRunEditorAction}
        onToggleHistory={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "H2" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "H2" })).toHaveClass("toolbar-button-active");
    expect(screen.getByRole("button", { name: "Negrita" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Lista con viñetas" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Texto normal" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "Lista con viñetas" }));

    expect(onRunEditorAction).toHaveBeenCalledWith("bullet-list");
  });
});
