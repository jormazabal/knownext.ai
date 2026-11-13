import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { ProjectActions } from "./ProjectActions";
import * as aiApi from "../../lib/api/ai";
import { Activity, Trash2 } from "lucide-react";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, "matchMedia");
});
describe("ProjectActions", () => {
  it("keeps workspace actions in the primary account menu and account tools one level below",async()=>{
    const activity=vi.fn(),trash=vi.fn(),settings=vi.fn();
    render(<ProjectActions appVersion="qa" authStatus={{isAuthenticated:false,provider:null,user:null,scopes:[]}} workspaceActions={[{id:"activity",label:"Actividad",icon:Activity,onSelect:activity,badge:"!"},{id:"trash",label:"Papelera del proyecto",icon:Trash2,onSelect:trash}]} orphanDraftCount={0} isCheckingForUpdates={false} onLoginGithub={vi.fn()} onLogout={vi.fn()} onOpenAppSettings={settings} onOpenRecoverableDrafts={vi.fn()} onCheckForUpdates={vi.fn()} onOpenReleaseNotes={vi.fn()}/>);
    await userEvent.click(screen.getByRole("button",{name:/Mi cuenta/i}));
    expect(screen.getByRole("menuitem",{name:/Actividad/})).toBeInTheDocument();
    expect(screen.getByRole("menuitem",{name:"Papelera del proyecto"})).toBeInTheDocument();
    expect(screen.queryByRole("menuitem",{name:"Buscar actualizaciones"})).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem",{name:"Cuenta y aplicación"}));
    expect(screen.getByRole("menuitem",{name:"Buscar actualizaciones"})).toBeInTheDocument();
    await userEvent.click(screen.getByRole("menuitem",{name:"Volver"}));
    await userEvent.click(screen.getByRole("menuitem",{name:"Papelera del proyecto"}));expect(trash).toHaveBeenCalledOnce();
  });
  it("selects a project month and shows unavailable EUR as a gap rather than free usage",async()=>{
    mockNarrowViewport();
    const summary={month:"2026-11",projectId:null,currency:"EUR" as const,estimated:true,totalEstimatedCost:10,generatedAt:"owned",models:[],capabilities:[],availableProjects:[{id:"owned-a",name:"Proyecto A",state:"registered" as const}]};
    const model={model:"owned-model",interactions:1,inputTokens:1,cachedInputTokens:0,outputTokens:0,reasoningTokens:0,embeddingTokens:0,totalTokens:1,estimatedCost:0,currency:"EUR" as const,usageSource:"unknown" as const,unpricedEntries:1};
    const load=vi.spyOn(aiApi,"getAiUsageSummary").mockResolvedValue({...summary,projectId:"owned-a",totalEstimatedCost:0,totalInteractions:1,totalTokens:1,legacyEntries:1,unpricedEntries:0,models:[model],coverage:"retained-local-records"});
    render(<ProjectActions appVersion="qa" authStatus={{isAuthenticated:false,provider:null,user:null,scopes:[]}} aiUsageSummary={summary} orphanDraftCount={0} isCheckingForUpdates={false} onLoginGithub={vi.fn()} onLogout={vi.fn()} onOpenAppSettings={vi.fn()} onOpenRecoverableDrafts={vi.fn()} onCheckForUpdates={vi.fn()} onOpenReleaseNotes={vi.fn()}/>);
    fireEvent.click(screen.getByRole("button",{name:/sin cuenta github/i}));fireEvent.click(screen.getByRole("button",{name:/uso ia/i}));
    fireEvent.change(screen.getByLabelText("Alcance del proyecto"),{target:{value:"owned-a"}});
    expect(await screen.findByText(/1 registro sin importe EUR disponible/)).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);expect(screen.queryByText("Sin uso registrado")).not.toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("2026-11","owned-a");
  });
  it("keeps unavailable usage distinct from a successfully read empty ledger", async () => {
    mockNarrowViewport();
    const props={appVersion:"qa",authStatus:{isAuthenticated:false,provider:null,user:null,scopes:[]},orphanDraftCount:0,isCheckingForUpdates:false,onLoginGithub:vi.fn(),onLogout:vi.fn(),onOpenAppSettings:vi.fn(),onOpenRecoverableDrafts:vi.fn(),onCheckForUpdates:vi.fn(),onOpenReleaseNotes:vi.fn()};
    const view=render(<ProjectActions {...props} aiUsageSummary={null}/>);
    fireEvent.click(screen.getByRole("button",{name:/sin cuenta github/i}));
    fireEvent.click(screen.getByRole("button",{name:/uso ia/i}));
    expect(await screen.findByText("Resumen no disponible")).toBeInTheDocument();
    expect(screen.queryByText("Sin uso registrado")).not.toBeInTheDocument();
    view.rerender(<ProjectActions {...props} aiUsageSummary={{month:"2026-11",currency:"EUR",estimated:true,totalEstimatedCost:0,generatedAt:"now",models:[],capabilities:[]}}/>);
    expect(await screen.findByText("Sin uso registrado")).toBeInTheDocument();
    expect(screen.queryByText("Resumen no disponible")).not.toBeInTheDocument();
  });
  it("matches the document viewer footer height and surface", () => {
    const { container } = render(
      <ProjectActions
        appVersion="0.5.0"
        authStatus={{ isAuthenticated: false, provider: null, user: null, scopes: [] }}
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={vi.fn()}
        onLogout={vi.fn()}
        onOpenAppSettings={vi.fn()}
        onOpenRecoverableDrafts={vi.fn()}
        onCheckForUpdates={vi.fn()}
        onOpenReleaseNotes={vi.fn()}
      />,
    );
    const footer = container.firstElementChild;
    expect(footer).toHaveClass("h-10", "border-t", "border-line", "bg-white", "text-[11px]", "text-ink-secondary");
    expect(screen.queryByRole("button", { name: "Borradores recuperables" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Configuración de la app" })).not.toBeInTheDocument();
  });
  it("starts a manual update check from the account menu", () => {
    const onCheckForUpdates = vi.fn();
    render(
      <ProjectActions
        appVersion="0.5.0"
        authStatus={{ isAuthenticated: false, provider: null, user: null, scopes: [] }}
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={vi.fn()}
        onLogout={vi.fn()}
        onOpenAppSettings={vi.fn()}
        onOpenRecoverableDrafts={vi.fn()}
        onCheckForUpdates={onCheckForUpdates}
        onOpenReleaseNotes={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /sin cuenta github/i }));
    expect(screen.queryByText("GitHub pausado")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Buscar actualizaciones"));
    expect(onCheckForUpdates).toHaveBeenCalledTimes(1);
  });
  it("keeps GitHub account actions in the menu header", () => {
    const onLoginGithub = vi.fn();
    const onLogout = vi.fn();
    render(
      <ProjectActions
        appVersion="0.7.2"
        authStatus={{ isAuthenticated: false, provider: null, user: null, scopes: [] }}
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={onLoginGithub}
        onLogout={onLogout}
        onOpenAppSettings={vi.fn()}
        onOpenRecoverableDrafts={vi.fn()}
        onCheckForUpdates={vi.fn()}
        onOpenReleaseNotes={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /sin cuenta github/i }));
    expect(screen.getByText("v0.7.2")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /conectar github/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /cerrar sesión/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: /conectar github/i }));
    expect(onLoginGithub).toHaveBeenCalledTimes(1);
    expect(onLogout).not.toHaveBeenCalled();
  });
  it("opens release notes from the account menu", () => {
    const onOpenReleaseNotes = vi.fn();
    render(
      <ProjectActions
        appVersion="0.5.0"
        authStatus={{ isAuthenticated: false, provider: null, user: null, scopes: [] }}
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={vi.fn()}
        onLogout={vi.fn()}
        onOpenAppSettings={vi.fn()}
        onOpenRecoverableDrafts={vi.fn()}
        onCheckForUpdates={vi.fn()}
        onOpenReleaseNotes={onOpenReleaseNotes}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /sin cuenta github/i }));
    fireEvent.click(screen.getByText("Notas de release"));
    expect(onOpenReleaseNotes).toHaveBeenCalledTimes(1);
  });
  it("shows AI usage by model from the account menu", async () => {
    render(
      <ProjectActions
        appVersion="0.7.2"
        authStatus={{ isAuthenticated: false, provider: null, user: null, scopes: [] }}
        aiUsageSummary={{
          month: "2026-05",
          currency: "EUR",
          estimated: true,
          totalEstimatedCost: 1.86,
          generatedAt: "2026-05-12T12:00:00Z",
          capabilities: [
            {
              capability: "document_ai",
              label: "IA documental",
              interactions: 32,
              inputTokens: 62000,
              cachedInputTokens: 0,
              outputTokens: 34180,
              reasoningTokens: 0,
              embeddingTokens: 0,
              totalTokens: 96180,
              estimatedCost: 1.86,
              currency: "EUR",
              usageSource: "provider",
            },
            {
              capability: "image_generation",
              label: "Imágenes",
              interactions: 0,
              inputTokens: 0,
              cachedInputTokens: 0,
              outputTokens: 0,
              reasoningTokens: 0,
              embeddingTokens: 0,
              totalTokens: 0,
              estimatedCost: 0,
              currency: "EUR",
              usageSource: "unknown",
            },
          ],
          models: [
            {
              model: "gpt-5.4-mini",
              interactions: 32,
              inputTokens: 62000,
              cachedInputTokens: 0,
              outputTokens: 34180,
              reasoningTokens: 0,
              embeddingTokens: 0,
              totalTokens: 96180,
              estimatedCost: 1.86,
              currency: "EUR",
              usageSource: "provider",
            },
          ],
        }}
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={vi.fn()}
        onLogout={vi.fn()}
        onOpenAppSettings={vi.fn()}
        onOpenRecoverableDrafts={vi.fn()}
        onCheckForUpdates={vi.fn()}
        onOpenReleaseNotes={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /sin cuenta github/i }));
    fireEvent.mouseEnter(screen.getByRole("menuitem", { name: /uso ia/i }));
    await screen.findByText("Mayo");
    expect(screen.getAllByText("Uso IA").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("IA documental")).toBeInTheDocument();
    expect(screen.getAllByText("96.180").length).toBeGreaterThanOrEqual(1);
    fireEvent.click(screen.getByRole("button", { name: /por modelo/i }));
    expect(screen.getByText("gpt-5.4-mini")).toBeInTheDocument();
    expect(screen.getAllByText("96.180").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("32").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/1,86/).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("gpt-5.5")).not.toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.queryByText(/datos ficticios/i)).not.toBeInTheDocument();
  });
  it("uses modal dialogs for account options and AI usage in narrow responsive mode", async () => {
    mockNarrowViewport();
    render(
      <ProjectActions
        appVersion="0.7.2"
        authStatus={{ isAuthenticated: false, provider: null, user: null, scopes: [] }}
        aiUsageSummary={{
          month: "2026-05",
          currency: "EUR",
          estimated: true,
          totalEstimatedCost: 1.86,
          generatedAt: "2026-05-12T12:00:00Z",
          capabilities: [
            {
              capability: "document_ai",
              label: "IA documental",
              interactions: 32,
              inputTokens: 62000,
              cachedInputTokens: 0,
              outputTokens: 34180,
              reasoningTokens: 0,
              embeddingTokens: 0,
              totalTokens: 96180,
              estimatedCost: 1.86,
              currency: "EUR",
              usageSource: "provider",
            },
          ],
          models: [
            {
              model: "gpt-5.4-mini",
              interactions: 32,
              inputTokens: 62000,
              cachedInputTokens: 0,
              outputTokens: 34180,
              reasoningTokens: 0,
              embeddingTokens: 0,
              totalTokens: 96180,
              estimatedCost: 1.86,
              currency: "EUR",
              usageSource: "provider",
            },
          ],
        }}
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={vi.fn()}
        onLogout={vi.fn()}
        onOpenAppSettings={vi.fn()}
        onOpenRecoverableDrafts={vi.fn()}
        onCheckForUpdates={vi.fn()}
        onOpenReleaseNotes={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /sin cuenta github/i }));
    expect(screen.getByRole("dialog", { name: "Opciones de cuenta" })).toBeInTheDocument();
    expect(screen.queryByText("Mayo")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Uso IA" }));
    expect(await screen.findByRole("dialog", { name: "Uso IA" })).toBeInTheDocument();
    expect(screen.getByText("Mayo")).toBeInTheDocument();
    expect(screen.getByText("IA documental")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Por modelo" })).toBeInTheDocument();
  });
  it("opens application settings from the account menu", () => {
    const onOpenAppSettings = vi.fn();
    render(
      <ProjectActions
        appVersion="0.5.0"
        authStatus={{ isAuthenticated: false, provider: null, user: null, scopes: [] }}
        orphanDraftCount={0}
        isCheckingForUpdates={false}
        onLoginGithub={vi.fn()}
        onLogout={vi.fn()}
        onOpenAppSettings={onOpenAppSettings}
        onOpenRecoverableDrafts={vi.fn()}
        onCheckForUpdates={vi.fn()}
        onOpenReleaseNotes={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /sin cuenta github/i }));
    fireEvent.click(screen.getByText("Configuración de la app"));
    expect(onOpenAppSettings).toHaveBeenCalledTimes(1);
  });
});
describe("ProjectActions keyboard and modal ownership", () => {
  const props=()=>({appVersion:"qa",authStatus:{isAuthenticated:false,provider:null,user:null,scopes:[]},orphanDraftCount:0,isCheckingForUpdates:true,onLoginGithub:vi.fn(),onLogout:vi.fn(),onOpenAppSettings:vi.fn(),onOpenRecoverableDrafts:vi.fn(),onCheckForUpdates:vi.fn(),onOpenReleaseNotes:vi.fn()});
  it("opens by arrow, skips disabled items and closes with Tab or Escape", async () => {
    render(<><ProjectActions {...props()}/><button>Después</button></>);
    const opener=screen.getByRole("button",{name:/sin cuenta github/i});
    opener.focus(); await userEvent.keyboard("{ArrowDown}");
    const menu=screen.getByRole("menu",{name:"Opciones de cuenta"});
    const first=within(menu).getByRole("menuitem",{name:"Conectar GitHub"});
    const last=within(menu).getByRole("menuitem",{name:"Notas de release"});
    expect(first).toHaveFocus();
    await userEvent.keyboard("{End}"); expect(last).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}"); expect(first).toHaveFocus();
    await userEvent.keyboard("{ArrowUp}"); expect(last).toHaveFocus();
    await userEvent.keyboard("{Home}"); expect(first).toHaveFocus();
    await userEvent.keyboard("{Escape}"); expect(opener).toHaveFocus();
    await userEvent.keyboard("{ArrowDown}"); await userEvent.tab();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:"Después"})).toHaveFocus();
  });
  it("keeps the account-to-usage modal transition isolated and returns to the account trigger", async () => {
    mockNarrowViewport();
    const {container}=render(<><ProjectActions {...props()} aiUsageSummary={null}/><button>Fondo</button></>);
    const opener=screen.getByRole("button",{name:/sin cuenta github/i});
    await userEvent.click(opener);
    const account=screen.getByRole("dialog",{name:"Opciones de cuenta"});
    expect(within(account).getByRole("button",{name:"Cerrar opciones de cuenta"})).toHaveFocus();
    expect(container.inert).toBe(true);
    await userEvent.click(within(account).getByRole("button",{name:"Uso IA"}));
    const usage=screen.getByRole("dialog",{name:"Uso IA"});
    expect(screen.queryByRole("dialog",{name:"Opciones de cuenta"})).not.toBeInTheDocument();
    const close=within(usage).getByRole("button",{name:"Cerrar uso IA"});
    expect(close).toHaveFocus();
    expect(container.inert).toBe(true);
    await userEvent.tab({shift:true});
    expect(usage).toContainElement(document.activeElement as HTMLElement);
    await userEvent.keyboard("{Escape}");
    expect(opener).toHaveFocus(); expect(container.inert).toBe(false);
  });
  it("makes desktop AI usage clickable and keyboard reachable without a hover timer", async () => {
    render(<ProjectActions {...props()} aiUsageSummary={null}/>);
    await userEvent.click(screen.getByRole("button",{name:/sin cuenta github/i}));
    await userEvent.click(screen.getByRole("menuitem",{name:"Uso IA"}));
    const panel=screen.getByRole("region",{name:"Uso IA"});
    expect(within(panel).getByRole("button",{name:"Cerrar uso IA"})).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("region")).not.toBeInTheDocument();
    expect(screen.getByRole("button",{name:/sin cuenta github/i})).toHaveFocus();
  });
});
function mockNarrowViewport(matches = true) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}
