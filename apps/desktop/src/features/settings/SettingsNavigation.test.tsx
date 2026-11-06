import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsNavigation } from "./SettingsNavigation";
import { SettingsContext } from "./SettingsContext";
afterEach(cleanup);

it("moves focus into the destination only on explicit category activation",async()=>{
  render(<><SettingsNavigation language="es" section="summary" onSelectSection={vi.fn()} onNavigate={vi.fn()} onHide={vi.fn()}/><section role="tabpanel" id="app-settings-panel-ai" tabIndex={-1}>Formulario IA</section></>);
  fireEvent.click(screen.getByRole("tab",{name:"IA documental"}));
  await waitFor(()=>expect(screen.getByRole("tabpanel")).toHaveFocus());
});

it("navigates settings with roving focus without closing the navigation on arrow keys",()=>{
  const select=vi.fn(),navigate=vi.fn(),hide=vi.fn();
  const props={language:"es" as const,onSelectSection:select,onNavigate:navigate,onHide:hide};
  const view=render(<SettingsNavigation {...props} section="summary"/>);
  const first=screen.getByRole("tab",{name:"Resumen"});first.focus();fireEvent.keyDown(first,{key:"ArrowDown"});
  expect(select).toHaveBeenLastCalledWith("interface");expect(screen.getByRole("tab",{name:"Interfaz"})).toHaveFocus();expect(navigate).not.toHaveBeenCalled();
  view.rerender(<SettingsNavigation {...props} section="interface"/>);
  fireEvent.keyDown(screen.getByRole("tab",{name:"Interfaz"}),{key:"End"});expect(select).toHaveBeenLastCalledWith("system");
  fireEvent.click(screen.getByRole("tab",{name:"IA documental"}));expect(select).toHaveBeenLastCalledWith("ai");expect(navigate).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button",{name:"Ocultar navegación de configuración"}));expect(hide).toHaveBeenCalledOnce();
});

it("distinguishes device configuration from the selected project's document index",()=>{
  const view=render(<SettingsContext section="ai" language="es" projectName="Documentación QA"/>);
  expect(screen.getByText("Este dispositivo")).toBeInTheDocument();expect(screen.getByText(/El índice mostrado pertenece a Documentación QA/)).toBeInTheDocument();
  view.rerender(<SettingsContext section="export" language="es" projectName="Documentación QA"/>);
  expect(screen.getByText(/no modifica el documento de origen/)).toBeInTheDocument();expect(screen.queryByText("Índice documental")).not.toBeInTheDocument();
});
