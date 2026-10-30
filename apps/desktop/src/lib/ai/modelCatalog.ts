import catalog from "../../../shared/openai-models.json";
import type { AiModelSelectorOption } from "../../components/ai/AiModelSelector";
export { catalog as openAiCatalog };
export function modelOptions(
  capability: string,
  selected?: string,
): AiModelSelectorOption[] {
  const options: AiModelSelectorOption[] = catalog.models
    .filter((m) => m.capabilities.includes(capability))
    .map((m) => ({
      id: m.id,
      name: m.name,
      description: `${m.description}${m.shutdown ? ` · Retirada: ${m.shutdown}` : ""}`,
      inputPrice: m.pricing ? `$${m.pricing.input}` : "Tarifa no disponible",
      outputPrice:
        m.pricing && "output" in m.pricing ? `$${m.pricing.output}` : "",
      priceUnit:
        m.pricing?.unit === "minute"
          ? "USD / minuto"
          : "USD / 1 M tokens · entrada / salida",
      recommended: Object.values(catalog.defaults).includes(m.id),
      tag: {
        label:
          m.status === "retired"
            ? "Retirado"
            : m.status === "deprecated"
              ? "Retirada anunciada"
              : Object.values(catalog.defaults).includes(m.id)
                ? "Recomendado"
                : "Disponible",
        tone: "neutral",
      },
    }));
  if (selected && !options.some((m) => m.id === selected))
    options.unshift({
      id: selected,
      name: selected,
      description:
        "Modelo desconocido. Selecciona uno compatible antes de utilizarlo.",
      inputPrice: "Sin tarifa",
      outputPrice: "",
    });
  return options;
}
