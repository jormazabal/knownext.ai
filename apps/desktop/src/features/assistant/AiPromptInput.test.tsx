import { cleanup, render, screen, waitForElementToBeRemoved } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiPromptInput } from "./AiPromptInput";

afterEach(() => cleanup());

describe("AiPromptInput", () => {
  it("shows applied AI changes as a dismissible floating prompt notice", async () => {
    const onDismissAppliedChange = vi.fn();

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        appliedChangeSummary="Se reemplazó el contenido mínimo por una poesía de 10 líneas."
        onSubmit={vi.fn()}
        onDismissAppliedChange={onDismissAppliedChange}
      />,
    );

    expect(screen.getByText("Se reemplazó el contenido mínimo por una poesía de 10 líneas.")).toBeInTheDocument();
    expect(screen.queryByText("Cambios aplicados por IA")).not.toBeInTheDocument();
    expect(screen.queryByText("Ver conversación")).not.toBeInTheDocument();
    expect(screen.queryByText("Deshacer")).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("Cerrar aviso de cambios IA"));

    expect(onDismissAppliedChange).toHaveBeenCalledTimes(1);
  });

  it("shows a right-aligned waiting bubble while the prompt is processing", async () => {
    let resolveSubmit: () => void = () => undefined;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => {
      resolveSubmit = resolve;
    }));

    render(
      <AiPromptInput
        documentId="doc-1"
        projectId="project-1"
        markdown="Contenido"
        providerReady
        onSubmit={onSubmit}
      />,
    );

    await userEvent.type(screen.getByPlaceholderText(/Pregunta algo sobre este documento/), "Resume este documento");
    await userEvent.click(screen.getByLabelText("Enviar"));

    expect(onSubmit).toHaveBeenCalledWith("Resume este documento");
    expect(screen.getByRole("status")).toHaveTextContent("Esperando respuesta...");

    resolveSubmit();

    await waitForElementToBeRemoved(() => screen.queryByRole("status"));
  });
});
