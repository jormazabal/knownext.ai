import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceControls } from "./WorkspaceControls";

afterEach(cleanup);
const controls=()=>({settings:false,projectName:"Proyecto",navigationOpen:true,contextOpen:false,navigationRef:createRef<HTMLButtonElement>(),contextRef:createRef<HTMLButtonElement>(),onNavigation:vi.fn(),onContext:vi.fn(),onSearch:vi.fn(),onRecordings:vi.fn(),onBack:vi.fn()});
it("puts document tabs between panel controls and keeps only search and recording at their right",()=>{
  const props=controls();
  render(<WorkspaceControls {...props} tabs={<div role="tablist"><button role="tab">Acta.md</button></div>}/>);
  const bar=screen.getByRole("navigation",{name:"Paneles de trabajo"});
  expect(within(bar).getByRole("tab",{name:"Acta.md"})).toBeInTheDocument();
  expect(within(bar).getAllByRole("button").map(button=>button.getAttribute("aria-label"))).toEqual(["Alternar navegación","Acceso rápido","Abrir Grabaciones","Alternar contexto"]);
  fireEvent.click(screen.getByRole("button",{name:"Abrir Grabaciones"}));expect(props.onRecordings).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button",{name:"Acceso rápido"}));expect(props.onSearch).toHaveBeenCalledOnce();
});
it("keeps the same permanent actions when settings replaces the document tabs",()=>{
  const props=controls();const view=render(<WorkspaceControls {...props}/>);
  const actions=()=>screen.getAllByRole("button").filter(button=>button.getAttribute("aria-label")!=="Volver al documento").map(button=>button.getAttribute("aria-label"));
  const before=actions();view.rerender(<WorkspaceControls {...props} settings/>);expect(actions()).toEqual(before);
  fireEvent.click(screen.getByRole("button",{name:"Volver al documento"}));expect(props.onBack).toHaveBeenCalledOnce();
  expect(screen.queryByRole("button",{name:"Papelera del proyecto"})).not.toBeInTheDocument();
});
