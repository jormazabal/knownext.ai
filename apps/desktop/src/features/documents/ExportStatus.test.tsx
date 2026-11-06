import { cleanup,fireEvent,render,screen } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
import { ExportStatus } from "./ExportStatus";
afterEach(cleanup);
it("never announces a completed export while conversion or destination is pending",()=>{
  render(<ExportStatus progress="Note.md" saved={null} opening={false} onOpen={vi.fn()} onClose={vi.fn()}/>);
  expect(screen.getByRole("status")).toHaveTextContent("Preparando exportación");expect(screen.queryByText("Archivo exportado")).not.toBeInTheDocument();expect(screen.queryByRole("button",{name:"Abrir"})).not.toBeInTheDocument();
});
it("opens the confirmed result and keeps the filename available when truncated",()=>{
  const open=vi.fn(),close=vi.fn();render(<ExportStatus progress={null} saved={{exportId:"id",fileName:"Documento largo.pdf"}} opening={false} onOpen={open} onClose={close}/>);
  expect(screen.getByTitle("Documento largo.pdf")).toBeInTheDocument();fireEvent.click(screen.getByRole("button",{name:"Abrir"}));expect(open).toHaveBeenCalledOnce();fireEvent.click(screen.getByRole("button",{name:"Cerrar aviso de exportación"}));expect(close).toHaveBeenCalledOnce();
});
