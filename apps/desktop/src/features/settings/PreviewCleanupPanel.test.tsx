import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {PreviewCleanupPanel} from "./PreviewCleanupPanel";
import {getPreviewCleanupInventory,cleanupPreviewReceipts} from "../../lib/api/previewCleanup";
import type {PreviewCleanupInventory} from "../../types/previewCleanup";
vi.mock("../../lib/api/previewCleanup",()=>({getPreviewCleanupInventory:vi.fn(),cleanupPreviewReceipts:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();});
const inventory:PreviewCleanupInventory={schemaVersion:1,id:"preview-receipt-cleanup",checkedAt:"2026-11-01T12:00:00Z",scope:"preview-receipts-only",entries:[{id:"preview-owned",revision:"a".repeat(64),projectId:"project-owned",path:"Informes/Documento.pdf",name:"Documento.pdf",bytes:700,generatedAt:"2026-11-01T12:00:00Z"}],skipped:1,limited:false,limits:{entries:256,bytes:16777216,milliseconds:2000,selection:64}};
it("revisa explícitamente, conserva selección sin acuse y concilia sin repetir la eliminación",async()=>{
  vi.mocked(getPreviewCleanupInventory).mockResolvedValue(inventory);vi.mocked(cleanupPreviewReceipts).mockRejectedValue(new Error("Respuesta interrumpida"));
  render(<PreviewCleanupPanel/>);expect(getPreviewCleanupInventory).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Revisar metadatos de vistas"}));const field=await screen.findByRole("checkbox");fireEvent.click(field);
  fireEvent.click(screen.getByRole("button",{name:"Eliminar recibos seleccionados"}));await screen.findByRole("alert");
  expect(field).toBeChecked();expect(screen.getByRole("button",{name:"Eliminar recibos seleccionados"})).toBeDisabled();expect(cleanupPreviewReceipts).toHaveBeenCalledTimes(1);
  expect(cleanupPreviewReceipts).toHaveBeenCalledWith([{id:"preview-owned",revision:"a".repeat(64)}]);
  vi.mocked(getPreviewCleanupInventory).mockResolvedValue({...inventory,entries:[]});fireEvent.click(screen.getByRole("button",{name:"Revisar de nuevo"}));
  await screen.findByText("No hay recibos de vistas aptos en esta revisión.");expect(cleanupPreviewReceipts).toHaveBeenCalledTimes(1);
});
