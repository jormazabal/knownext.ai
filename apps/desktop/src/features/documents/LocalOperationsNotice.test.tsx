import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {LocalOperationsNotice} from "./LocalOperationsNotice";
const state=vi.hoisted(()=>({continuity:null as boolean|null,entries:[] as unknown[],cancel:vi.fn(),refresh:vi.fn(),dismiss:vi.fn()}));
vi.mock("../../lib/runtime/localOperations",()=>({getRuntimeContinuity:()=>state.continuity,getLocalOperations:()=>state.entries,subscribeLocalOperations:()=>()=>{},cancelLocalOperation:state.cancel,refreshLocalOperations:state.refresh,dismissLocalOperation:state.dismiss}));
afterEach(()=>{cleanup();state.entries=[];state.continuity=null;vi.clearAllMocks();});
it("opens activity from the account menu without adding another toolbar button",()=>{
  const close=vi.fn(),attention=vi.fn();state.continuity=false;
  const view=render(<LocalOperationsNotice open={false} onClose={close} onAttentionChange={attention}/>);
  expect(screen.queryByRole("button",{name:"Actividad"})).toBeNull();expect(attention).toHaveBeenLastCalledWith(true);
  view.rerender(<LocalOperationsNotice open onClose={close} onAttentionChange={attention}/>);
  expect(screen.getByRole("dialog",{name:"Actividad"})).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Cerrar actividad"}));expect(close).toHaveBeenCalledOnce();
});
it("keeps one permanent activity control and closes its overlay with Escape",()=>{
  render(<LocalOperationsNotice/>);const trigger=screen.getByRole("button",{name:"Actividad"});
  expect(trigger).toHaveAttribute("aria-expanded","false");
  fireEvent.click(trigger);expect(screen.getByLabelText("Operaciones del espacio")).toHaveFocus();
  fireEvent.keyDown(screen.getByLabelText("Operaciones del espacio"),{key:"Escape"});
  expect(screen.queryByLabelText("Operaciones del espacio")).toBeNull();expect(trigger).toHaveFocus();
});
it("keeps ordinary editing quiet and shows uncertainty with explicit observation and queued cancellation",async()=>{
 const {rerender}=render(<LocalOperationsNotice/>);expect(screen.queryByLabelText("Operaciones del espacio")).toBeNull();
 state.entries=[{id:"operation-1234567890",phase:"queued",label:"Guardado",unconfirmed:true,native:true,cancellable:true,startedAt:0},{id:"operation-finished-12345",phase:"succeeded",label:"Consulta secundaria",unconfirmed:false,native:true,cancellable:false,startedAt:0}];state.refresh.mockResolvedValue(undefined);state.cancel.mockResolvedValue(false);rerender(<LocalOperationsNotice/>);
 fireEvent.click(screen.getByRole("button",{name:"Actividad"}));expect(screen.queryByText("Consulta secundaria")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Ver finalizadas (1)"}));expect(screen.getByText("Consulta secundaria")).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Ocultar finalizadas"}));expect(screen.getByText(/Revisa el resultado en su documento/)).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Cancelar en espera"}));await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("no admite detención"));
 fireEvent.click(screen.getByRole("button",{name:"Comprobar estado"}));await waitFor(()=>expect(state.refresh.mock.calls.length).toBeGreaterThan(1));expect(state.cancel).toHaveBeenCalledTimes(1);
});

it("labels a running stop as a request and shows recovered uncertainty without replay controls",async()=>{state.entries=[{id:"operation-running-owned-1234",phase:"running",label:"Acceso",unconfirmed:true,native:true,cancellable:false,cancelRequested:true,stage:"waiting-remote",startedAt:0},{id:"operation-recovered-owned-1234",phase:"unknown",label:"Sesión anterior · revisa su resultado",unconfirmed:true,native:true,cancellable:false,recovered:true,startedAt:0}];render(<LocalOperationsNotice/>);fireEvent.click(screen.getByRole("button",{name:"Actividad"}));expect(screen.getByText(/Detención solicitada · esperando punto seguro/)).toBeInTheDocument();expect(screen.getByText("Sesión anterior · revisa su resultado")).toBeInTheDocument();expect(screen.queryByRole("button",{name:/Repetir|Reanudar|Solicitar detención/})).not.toBeInTheDocument();});
it("keeps a journal failure visible without blocking document work",()=>{state.continuity=false;render(<LocalOperationsNotice/>);fireEvent.click(screen.getByRole("button",{name:"Actividad"}));expect(screen.getAllByText(/registro entre sesiones no está disponible/)[0]).toBeInTheDocument();expect(state.cancel).not.toHaveBeenCalled();});
