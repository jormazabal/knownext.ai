import { describe, it, expect } from "vitest";
import { modelOptions, openAiCatalog } from "./modelCatalog";
describe("shared model catalogue", () => {
  it("uses function-specific defaults and preserves unknown configured ids for correction", () => {
    expect(openAiCatalog.defaults.text).toBe("gpt-6.1-sol");
    expect(openAiCatalog.defaults.vision).toBe("gpt-6.1-terra");
    expect(modelOptions("text", "custom-old")[0].id).toBe("custom-old");
    expect(
      modelOptions("transcription").some((m) => m.id === "gpt-transcribe"),
    ).toBe(true);
    expect(
      modelOptions("image").find((m) => m.id === "gpt-image-1")?.tag?.label,
    ).toBe("Retirado");
  });
  it("has unique ids and dated primary sources", () => {
    const ids = openAiCatalog.models.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      openAiCatalog.models.every((m) =>
        m.source.startsWith("https://developers.openai.com/"),
      ),
    ).toBe(true);
  });
});
