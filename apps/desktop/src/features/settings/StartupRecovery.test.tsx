import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StartupRecovery } from "./StartupRecovery";
vi.mock("./LocalStateReview",()=>({LocalStateReview:()=> <button>Actualizar revisión</button>}));
afterEach(cleanup);
it("isolates failed startup from the workspace and keeps keyboard focus in recovery", () => {
  const retry=vi.fn();
  const {container,unmount}=render(<><main><button>Documento anterior</button></main><StartupRecovery error="Estado dañado" onRetry={retry}/></>);
  const background=container.querySelector('main')!;
  expect(background.inert).toBe(true);
  expect(screen.getByRole("heading",{name:"Revisemos el inicio"})).toHaveFocus();
  fireEvent.keyDown(screen.getByRole("dialog",{name:"Recuperación del inicio"}),{key:"Escape"});
  expect(retry).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Reintentar inicio"}));
  expect(retry).toHaveBeenCalledOnce();
  unmount(); expect(background.inert).toBe(false);
});
it("prevents repeated startup requests while initialization is pending", () => {
  const retry=vi.fn();render(<StartupRecovery error={null} onRetry={retry}/>);
  fireEvent.click(screen.getByRole("button",{name:"Iniciando…"}));
  expect(screen.getByRole("button",{name:"Iniciando…"})).toBeDisabled();expect(retry).not.toHaveBeenCalled();
});
