import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiModelSelector } from "./AiModelSelector";
import type { AiModelSelectorOption } from "./AiModelSelector";

describe("AiModelSelector", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens model choices, filters recommended models and saves the selected model", () => {
    const onChange = vi.fn();
    const onOpenGuide = vi.fn();

    render(
      <AiModelSelector
        value="balanced"
        options={modelOptions}
        onChange={onChange}
        onOpenGuide={onOpenGuide}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /balanced/ }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /reasoning/ })).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Solo mostrar recomendados"));
    expect(screen.queryByRole("option", { name: /reasoning/ })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: /balanced/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Ver guía de modelos/ }));
    expect(onOpenGuide).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("Solo mostrar recomendados"));
    fireEvent.click(screen.getByRole("option", { name: /reasoning/ }));

    expect(onChange).toHaveBeenCalledWith("reasoning");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("uses one enriched layout with model description, metrics, price and guide access", () => {
    const onChange = vi.fn();
    const onOpenGuide = vi.fn();

    render(
      <AiModelSelector
        value="cheap"
        options={modelOptions}
        onChange={onChange}
        onOpenGuide={onOpenGuide}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cheap/ }));

    expect(screen.getByRole("button", { name: /cheap/ })).toHaveTextContent("Económico");
    expect(screen.getAllByText("Capacidad").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Coste").length).toBeGreaterThan(0);
    expect(screen.getAllByText("$0.15 / $0.60").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /Ver guía de modelos/ }));
    expect(onOpenGuide).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("option", { name: /balanced/ }));
    expect(onChange).toHaveBeenCalledWith("balanced");
  });
});

const modelOptions: Array<AiModelSelectorOption<"balanced" | "reasoning" | "cheap">> = [
  {
    id: "balanced",
    name: "Equilibrado",
    description: "Modelo general para documentación",
    capability: 4,
    cost: 3,
    inputPrice: "$1.25",
    outputPrice: "$10.00",
    recommended: true,
    tag: { label: "Recomendado", tone: "recommended" },
  },
  {
    id: "reasoning",
    name: "Razonamiento",
    description: "Modelo para análisis complejo",
    capability: 6,
    cost: 5,
    inputPrice: "$5.00",
    outputPrice: "$25.00",
    recommended: false,
    tag: { label: "Avanzado", tone: "advanced" },
  },
  {
    id: "cheap",
    name: "Económico",
    description: "Modelo de bajo coste",
    capability: 3,
    cost: 1,
    inputPrice: "$0.15",
    outputPrice: "$0.60",
    recommended: true,
    tag: { label: "Bajo coste", tone: "economy" },
  },
];
