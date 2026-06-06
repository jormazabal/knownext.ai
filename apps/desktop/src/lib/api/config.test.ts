import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "./client";
import {
  defaultAiConfig,
  defaultAppearanceConfig,
  defaultExportTemplateConfig,
  getAppConfig,
  getAiConfig,
  getExportTemplate,
  readLocalAppPreferences,
  updateAiConfig,
  writeLocalAppPreferences,
} from "./config";
import type { AiConfig, AppConfig, ExportTemplateConfig } from "../../types/domain";

vi.mock("./client", () => ({
  requestJson: vi.fn(),
}));

describe("app configuration contracts", () => {
  beforeEach(() => {
    vi.mocked(requestJson).mockReset();
    window.localStorage.clear();
  });

  it("normalizes persisted app config from Rust before the UI consumes it", async () => {
    vi.mocked(requestJson).mockResolvedValue({
      schemaVersion: 1,
      layout: { sidebarWidth: 420, historyWidth: 360 },
      appearance: {
        language: "fr",
        zoomPercent: 500,
        markdownExtendedUnderlineEnabled: undefined,
        themeMode: "sepia",
        primaryColor: "purple",
      },
      diagnostics: { traceLoggingEnabled: 1 },
      ai: minimalLegacyAiConfig({
      model: "gpt-5-mini" as never,
      transcription: {
        enabled: true,
        model: "gpt-realtime-whisper" as never,
        defaultTarget: "document",
        defaultLanguage: "eu",
        favoriteLanguages: ["eu", "es", "eu", "bad-language"] as never,
      },
      }),
      tabsByProject: {
        "project-1": {
          openTabs: [{ id: "doc-1", name: "Doc.md" }],
          activeDocumentId: "doc-1",
        },
      },
      treeOpenPathsByProject: {
        "project-1": [" docs\\Legal ", "../private", "docs/Legal", "docs/AI"],
        "project-2": ["", "./bad"],
      },
      openUtilityTabs: ["notes", "release-notes", "unsupported"],
      activeUtilityTab: "notes",
      updatedAt: "2026-06-04T20:00:00.000Z",
    } as unknown as AppConfig);

    const config = await getAppConfig();

    expect(config.schemaVersion).toBe(3);
    expect(config.appearance).toEqual({
      ...defaultAppearanceConfig,
      zoomPercent: 125,
    });
    expect(config.diagnostics.traceLoggingEnabled).toBe(true);
    expect(config.ai.model).toBe("gpt-5.4-mini");
    expect(config.ai.transcription).toEqual({
      enabled: true,
      model: "gpt-4o-mini-transcribe",
      defaultTarget: "document",
      defaultLanguage: "eu",
      favoriteLanguages: ["eu", "es"],
    });
    expect(config.tabsByProject["project-1"]?.activeDocumentId).toBe("doc-1");
    expect(config.treeOpenPathsByProject).toEqual({
      "project-1": ["docs/AI", "docs/Legal"],
    });
    expect(config.openUtilityTabs).toEqual(["release-notes"]);
    expect(config.activeUtilityTab).toBe("notes");
  });

  it("keeps local browser preferences normalized and scoped to supported fields", () => {
    writeLocalAppPreferences({
      appearance: {
        language: "en",
        zoomPercent: 20,
        markdownExtendedUnderlineEnabled: false,
        themeMode: "dark",
        primaryColor: "wine",
      },
      diagnostics: { traceLoggingEnabled: true },
      ai: minimalLegacyAiConfig({
        model: "gpt-5" as never,
        imageGeneration: {
          ...defaultAiConfig.imageGeneration,
          enabled: true,
          customFolderPath: "/absolute/path",
          maxImagesPerPrompt: 12,
        },
        permissions: {
          ...defaultAiConfig.permissions,
          generateImages: true,
          createImageAssets: true,
          insertImagesIntoDocuments: true,
          useDocumentContextForImageGeneration: true,
        },
        rag: {
          ...defaultAiConfig.rag,
          enabled: true,
          vectorStoreId: "vs_legacy",
          status: "updated",
        },
        agentic: {
          ...defaultAiConfig.agentic,
          depth: "bounded_autonomous",
          webResearchEnabled: true,
          maxSteps: 99,
          maxEstimatedCostEur: 0,
        },
      }),
    });

    const preferences = readLocalAppPreferences();

    expect(preferences.appearance).toEqual({
      language: "en",
      zoomPercent: 85,
      markdownExtendedUnderlineEnabled: false,
      themeMode: "dark",
      primaryColor: "wine",
    });
    expect(preferences.diagnostics).toEqual({ traceLoggingEnabled: true });
    expect(preferences.ai?.model).toBe("gpt-5.4");
    expect(preferences.ai?.permissions.generateImages).toBe(true);
    expect(preferences.ai?.permissions.createImageAssets).toBe(true);
    expect(preferences.ai?.permissions.insertImagesIntoDocuments).toBe(true);
    expect(preferences.ai?.permissions.useDocumentContextForImageGeneration).toBe(true);
    expect(preferences.ai?.rag.enabled).toBe(true);
    expect(preferences.ai?.rag.vectorStoreId).toBe("vs_legacy");
    expect(preferences.ai?.rag.status).toBe("updated");
    expect(preferences.ai?.imageGeneration.enabled).toBe(true);
    expect(preferences.ai?.imageGeneration.customFolderPath).toBe(defaultAiConfig.imageGeneration.customFolderPath);
    expect(preferences.ai?.imageGeneration.maxImagesPerPrompt).toBe(4);
    expect(preferences.ai?.agentic.depth).toBe("bounded_autonomous");
    expect(preferences.ai?.agentic.webResearchEnabled).toBe(false);
    expect(preferences.ai?.agentic.maxSteps).toBe(12);
    expect(preferences.ai?.agentic.maxEstimatedCostEur).toBe(0.1);
  });

  it("normalizes AI config status returned by the Rust runtime", async () => {
    vi.mocked(requestJson).mockResolvedValue({
      ...minimalLegacyAiConfig({
        model: "gpt-5" as never,
        imageGeneration: {
          ...defaultAiConfig.imageGeneration,
          model: "gpt-image-2" as never,
          size: "3840x2160",
          customFolderPath: "../bad",
        },
        rag: {
          ...defaultAiConfig.rag,
          status: "ready" as never,
        },
      }),
      openaiKeyConfigured: 1,
      openaiKeyPreview: "sk-...abcd",
    });

    const ai = await getAiConfig();

    expect(ai.model).toBe("gpt-5.4");
    expect(ai.imageGeneration.model).toBe("gpt-image-2");
    expect(ai.imageGeneration.size).toBe("3840x2160");
    expect(ai.imageGeneration.customFolderPath).toBe(defaultAiConfig.imageGeneration.customFolderPath);
    expect(ai.rag.status).toBe("updated");
    expect(ai.openaiKeyConfigured).toBe(true);
    expect(ai.openaiKeyPreview).toBe("sk-...abcd");
  });

  it("downgrades gpt-image-2-only sizes when an older image model is configured", async () => {
    vi.mocked(requestJson).mockResolvedValue(minimalLegacyAiConfig({
      imageGeneration: {
        ...defaultAiConfig.imageGeneration,
        model: "gpt-image-1.5",
        size: "3840x2160",
      },
    }));

    const ai = await getAiConfig();

    expect(ai.imageGeneration.model).toBe("gpt-image-1.5");
    expect(ai.imageGeneration.size).toBe("auto");
  });

  it("normalizes AI config status after updates", async () => {
    vi.mocked(requestJson).mockResolvedValue({
      ...minimalLegacyAiConfig({
        vision: {
          ...defaultAiConfig.vision,
          model: "gpt-5-nano" as never,
        },
      }),
      openaiKeyConfigured: false,
      openaiKeyPreview: "",
    });

    const ai = await updateAiConfig(defaultAiConfig);

    expect(requestJson).toHaveBeenCalledWith("/api/config/ai", {
      method: "PUT",
      body: JSON.stringify(defaultAiConfig),
    });
    expect(ai.vision.model).toBe(defaultAiConfig.vision.model);
    expect(ai.openaiKeyPreview).toBeNull();
  });

  it("normalizes export templates returned by the Rust runtime", async () => {
    vi.mocked(requestJson).mockResolvedValue({
      schemaVersion: 1,
      name: "legacy",
      page: {
        size: "Legal",
        margins: {
          topMm: 1,
          rightMm: 80,
          bottomMm: Number.NaN,
          leftMm: 25,
        },
      },
      normal: {
        fontFamily: "Papyrus",
        fontSizePt: 100,
        color: "orange",
        textFormat: "italic",
      },
      headingFontFamily: "Georgia",
      headings: {
        h1: {
          fontFamily: "Verdana",
          fontSizePt: 4,
          color: "#f37021",
          textFormat: "bold_underline",
        },
      },
      code: {
        fontFamily: "Consolas",
        fontSizePt: 5,
        color: "#111827",
        textFormat: "underline",
      },
      paragraph: {
        lineSpacing: 9,
        spaceAfterPt: -5,
      },
      document: {
        includeTitle: true,
        linkColor: "#123456",
        horizontalRuleColor: "bad",
      },
      updatedAt: "2026-06-04T20:00:00.000Z",
    } as unknown as ExportTemplateConfig);

    const template = await getExportTemplate();

    expect(template.schemaVersion).toBe(2);
    expect(template.name).toBe("basic");
    expect(template.page.size).toBe("A4");
    expect(template.page.margins).toEqual({
      topMm: 5,
      rightMm: 50,
      bottomMm: defaultExportTemplateConfig.page.margins.bottomMm,
      leftMm: 25,
    });
    expect(template.normal).toEqual({
      fontFamily: defaultExportTemplateConfig.normal.fontFamily,
      fontSizePt: 60,
      color: defaultExportTemplateConfig.normal.color,
      textFormat: defaultExportTemplateConfig.normal.textFormat,
    });
    expect(template.headingFontFamily).toBe("Georgia");
    expect(template.headings.h1).toEqual({
      fontFamily: "Verdana",
      fontSizePt: 6,
      color: "#f37021",
      textFormat: "bold_underline",
    });
    expect(template.code.fontSizePt).toBe(6);
    expect(template.paragraph).toEqual({ lineSpacing: 2.5, spaceAfterPt: 0 });
    expect(template.document).toEqual({
      includeTitle: false,
      linkColor: "#123456",
      horizontalRuleColor: defaultExportTemplateConfig.document.horizontalRuleColor,
    });
  });
});

function minimalLegacyAiConfig(overrides: Partial<AiConfig> = {}): AiConfig {
  return {
    ...defaultAiConfig,
    permissions: { ...defaultAiConfig.permissions, ...overrides.permissions },
    rag: { ...defaultAiConfig.rag, ...overrides.rag },
    vision: { ...defaultAiConfig.vision, ...overrides.vision },
    imageGeneration: { ...defaultAiConfig.imageGeneration, ...overrides.imageGeneration },
    agentic: { ...defaultAiConfig.agentic, ...overrides.agentic },
    transcription: { ...defaultAiConfig.transcription, ...overrides.transcription },
    provider: overrides.provider ?? defaultAiConfig.provider,
    model: overrides.model ?? defaultAiConfig.model,
  };
}
