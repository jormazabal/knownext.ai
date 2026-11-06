import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
const{getAiBudget,setAiBudget,refreshAiExchangeRate}=vi.hoisted(()=>({getAiBudget:vi.fn(),setAiBudget:vi.fn(),refreshAiExchangeRate:vi.fn()}));
vi.mock("../../lib/api/aiBudget",()=>({getAiBudget,setAiBudget,refreshAiExchangeRate}));
import {AiBudgetControls} from "./AiBudgetControls";
const initial={schemaVersion:1,revision:"owned-old",month:"2026-11",projectId:"owned-project",rule:null,checks:[],checkedAt:"2026-11-01T12:00:00Z",basis:"local-recorded-estimates",exchangeRateAvailable:true};
afterEach(()=>{cleanup();vi.resetAllMocks();});
it("keeps edited fields after unknown acknowledgement and observes without replay",async()=>{
  getAiBudget.mockResolvedValueOnce(initial).mockResolvedValueOnce({...initial,revision:"owned-new",rule:{month:"2026-11",projectId:"owned-project",limitEur:12.5,mode:"stop-new"}});
  setAiBudget.mockRejectedValueOnce(Error("ACK sin confirmar; comprueba estado"));
  render(<AiBudgetControls month="2026-11" projectId="owned-project"/>);
  expect(getAiBudget).not.toHaveBeenCalled();fireEvent.click(screen.getByText("Presupuesto de IA · proyecto elegido"));
  fireEvent.click(screen.getByRole("button",{name:"Consultar presupuesto"}));
  fireEvent.change(await screen.findByLabelText("Importe mensual (EUR)"),{target:{value:"12,50"}});fireEvent.change(screen.getByLabelText("Al llegar al límite"),{target:{value:"stop-new"}});
  fireEvent.click(screen.getByRole("button",{name:"Guardar límite"}));expect(await screen.findByRole("alert")).toHaveTextContent("ACK sin confirmar");
  expect(screen.getByLabelText("Importe mensual (EUR)")).toHaveValue("12,50");expect(screen.getByRole("button",{name:"Guardar límite"})).toBeDisabled();
  fireEvent.click(screen.getByRole("button",{name:"Comprobar estado"}));await screen.findByText(/Confirmado: 12.50 EUR/);
  expect(setAiBudget).toHaveBeenCalledTimes(1);expect(getAiBudget).toHaveBeenCalledTimes(2);expect(screen.getByLabelText("Importe mensual (EUR)")).toHaveValue("12,50");
});
it("does not attribute a delayed project response to another scope",async()=>{
  let resolve!:(value:unknown)=>void;getAiBudget.mockImplementationOnce(()=>new Promise(done=>{resolve=done;})).mockResolvedValueOnce({...initial,projectId:"other-project"});
  const view=render(<AiBudgetControls key="owned" month="2026-11" projectId="owned-project"/>);fireEvent.click(screen.getByText("Presupuesto de IA · proyecto elegido"));fireEvent.click(screen.getByRole("button",{name:"Consultar presupuesto"}));
  view.rerender(<AiBudgetControls key="other" month="2026-11" projectId="other-project"/>);await act(async()=>resolve({...initial,rule:{limitEur:999,mode:"notice"}}));
  expect(screen.queryByText(/999/)).not.toBeInTheDocument();expect(screen.queryByLabelText("Importe mensual (EUR)")).not.toBeInTheDocument();expect(setAiBudget).not.toHaveBeenCalled();
});
it("keeps the budget draft when an explicit exchange refresh fails",async()=>{
  getAiBudget.mockResolvedValueOnce({...initial,exchangeRateAvailable:false});refreshAiExchangeRate.mockRejectedValueOnce(Error("BCE no disponible; referencia conservada"));
  render(<AiBudgetControls month="2026-11" projectId="owned-project"/>);fireEvent.click(screen.getByText("Presupuesto de IA · proyecto elegido"));fireEvent.click(screen.getByRole("button",{name:"Consultar presupuesto"}));
  fireEvent.change(await screen.findByLabelText("Importe mensual (EUR)"),{target:{value:"15,00"}});fireEvent.click(screen.getByRole("button",{name:"Actualizar cambio BCE"}));
  expect(await screen.findByRole("alert")).toHaveTextContent("referencia conservada");expect(screen.getByLabelText("Importe mensual (EUR)")).toHaveValue("15,00");expect(setAiBudget).not.toHaveBeenCalled();
});
