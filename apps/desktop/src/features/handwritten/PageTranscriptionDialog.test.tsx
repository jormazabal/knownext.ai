import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {PageTranscriptionDialog} from "./PageTranscriptionDialog";
afterEach(cleanup);
it("conserva la edición ante fallo y permite revisar una base nueva sin reemplazar el campo",()=>{
  const apply=vi.fn().mockReturnValue("No se pudo aplicar");const close=vi.fn();
  const view=render(<PageTranscriptionDialog pageNumber={2} initialText="Original" currentText="Original" onApply={apply} onClose={close}/>);
  const field=screen.getByRole("textbox",{name:"Transcripción revisada"});fireEvent.change(field,{target:{value:"Mi revisión pendiente"}});
  fireEvent.click(screen.getByRole("button",{name:"Aplicar texto a la nota"}));expect(screen.getByRole("alert")).toHaveTextContent("No se pudo aplicar");expect(close).not.toHaveBeenCalled();
  view.rerender(<PageTranscriptionDialog pageNumber={2} initialText="Original" currentText="Corrección externa" onApply={apply} onClose={close}/>);
  expect(screen.getByRole("button",{name:"Aplicar texto a la nota"})).toBeDisabled();expect(screen.getByRole("textbox",{name:"Texto actual de la página"})).toHaveValue("Corrección externa");
  fireEvent.click(screen.getByRole("button",{name:"He revisado el texto actual"}));expect(field).toHaveValue("Mi revisión pendiente");apply.mockReturnValue(null);
  fireEvent.click(screen.getByRole("button",{name:"Aplicar texto a la nota"}));expect(apply).toHaveBeenLastCalledWith("Mi revisión pendiente","Corrección externa");expect(close).toHaveBeenCalledTimes(1);
});
