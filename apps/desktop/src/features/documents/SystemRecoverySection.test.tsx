import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
const{getSystemRecovery,reviewSystemRecovery,exportSystemRecovery}=vi.hoisted(()=>({getSystemRecovery:vi.fn(),reviewSystemRecovery:vi.fn(),exportSystemRecovery:vi.fn()}));
vi.mock("../../lib/api/systemRecovery",()=>({getSystemRecovery,reviewSystemRecovery,exportSystemRecovery}));
import {SystemRecoverySection} from "./SystemRecoverySection";
afterEach(()=>{cleanup();vi.resetAllMocks();});
const copy={id:"owned-copy",group:"usage",groupLabel:"Consumo de IA",name:"legacy-owned.json",byteLength:100,modifiedAt:"2026-11-01T12:00:00Z",canReview:true};
const inventory={items:[copy],warnings:[],limited:false,entryLimit:1000,fileLimit:32*1024*1024,queriedAt:"2026-11-01T12:00:00Z"};
const review={id:copy.id,fingerprint:"owned-fingerprint",byteLength:100,name:copy.name,groupLabel:copy.groupLabel,provenance:"verified-filename-digest",summary:{format:"usage",message:"Copia anterior. No debe sustituir recibos posteriores.",entries:20},canExport:true,canRestore:false,checkedAt:inventory.queriedAt};
it("keeps the reviewed copy after an uncertain delivery and never restores or replays automatically",async()=>{
  getSystemRecovery.mockResolvedValue(inventory);reviewSystemRecovery.mockResolvedValue(review);exportSystemRecovery.mockRejectedValueOnce(Error("Entrega sin confirmar. Comprueba el destino.")).mockResolvedValueOnce({status:"cancelled"});
  render(<SystemRecoverySection/>);fireEvent.click(await screen.findByRole("button",{name:"Revisar copia"}));
  fireEvent.click(await screen.findByRole("button",{name:"Conservar copia externa"}));expect(await screen.findByRole("alert")).toHaveTextContent("Comprueba el destino");expect(exportSystemRecovery).toHaveBeenCalledTimes(1);expect(exportSystemRecovery).toHaveBeenCalledWith(copy.id,review.fingerprint);
  expect(screen.getByText("20 registros conservados en esta copia.")).toBeInTheDocument();expect(screen.queryByRole("button",{name:/Restaurar/})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:"Conservar copia externa"}));expect(await screen.findByText("Destino cancelado. La copia original permanece en su lugar.")).toHaveAttribute("role","status");
});
it("retains the previous inventory on refresh failure and does not claim it is currently empty",async()=>{
  getSystemRecovery.mockResolvedValueOnce(inventory).mockRejectedValueOnce(Error("Origen temporalmente inaccesible"));
  render(<SystemRecoverySection/>);await screen.findByRole("button",{name:"Revisar copia"});fireEvent.click(screen.getByRole("button",{name:"Actualizar copias"}));expect(await screen.findByRole("alert")).toHaveTextContent("inventario anterior; el estado actual no está confirmado");expect(screen.getByText(copy.name)).toBeInTheDocument();expect(screen.queryByText(/No se han encontrado copias/)).not.toBeInTheDocument();expect(exportSystemRecovery).not.toHaveBeenCalled();
});
it("opens the specific cohort review without restoring from a raw original",async()=>{
  getSystemRecovery.mockResolvedValue(inventory);reviewSystemRecovery.mockResolvedValue({...review,relatedRecoveryId:"migration-owned",provenance:"copy-fingerprint-only"});
  const onReviewCohort=vi.fn();render(<SystemRecoverySection onReviewCohort={onReviewCohort}/>);fireEvent.click(await screen.findByRole("button",{name:"Revisar copia"}));fireEvent.click(await screen.findByRole("button",{name:"Revisar punto de recuperación"}));expect(onReviewCohort).toHaveBeenCalledWith("migration-owned");expect(exportSystemRecovery).not.toHaveBeenCalled();
});
