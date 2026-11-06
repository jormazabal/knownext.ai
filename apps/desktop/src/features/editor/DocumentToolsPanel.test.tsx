import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { DocumentToolsPanel } from "./DocumentToolsPanel";
import type { MarkdownEditorController } from "./editorTypes";
afterEach(cleanup);

it("keeps filters and replacement scoped to their document and sends the reviewed options", () => {
  const findText=vi.fn(()=>[{from:1,to:5,text:"Plan"},{from:6,to:10,text:"PLAN"}]);
  const replaceText=vi.fn(()=>2),navigateTo=vi.fn();
  const controller={findText,replaceText,navigateTo} as unknown as MarkdownEditorController;
  const view=render(<DocumentToolsPanel controller={controller} revision="A" scope="A" name="Acta.md"/>);
  fireEvent.change(screen.getByLabelText("Buscar en el documento"),{target:{value:"Plan"}});
  expect(screen.getByLabelText("Buscar en el documento")).toHaveAttribute("maxlength","200");
  fireEvent.click(screen.getByLabelText("Distinguir mayúsculas"));
  fireEvent.click(screen.getByLabelText("Palabra completa"));
  expect(findText).toHaveBeenLastCalledWith("Plan",{caseSensitive:true,wholeWord:true});
  fireEvent.click(screen.getByText("Reemplazar texto"));
  fireEvent.change(screen.getByLabelText("Reemplazar por"),{target:{value:"Entrega"}});
  fireEvent.click(screen.getByRole("button",{name:"Siguiente"}));
  expect(navigateTo).toHaveBeenLastCalledWith(1,5);
  expect(screen.getByRole("status")).toHaveTextContent("1 de 2");
  fireEvent.click(screen.getByRole("button",{name:"Reemplazar todas"}));
  expect(replaceText).toHaveBeenLastCalledWith("Plan","Entrega",true,0,{caseSensitive:true,wholeWord:true});
  view.rerender(<DocumentToolsPanel controller={controller} revision="B" scope="B" name="Otro.md"/>);
  expect(screen.getByLabelText("Buscar en el documento")).toHaveValue("");
  expect(screen.getByLabelText("Reemplazar por")).toHaveValue("");
  expect(screen.getByLabelText("Palabra completa")).not.toBeChecked();
  view.rerender(<DocumentToolsPanel controller={controller} revision="A2" scope="A" name="Acta.md"/>);
  expect(screen.getByLabelText("Buscar en el documento")).toHaveValue("Plan");
  expect(screen.getByLabelText("Reemplazar por")).toHaveValue("Entrega");
  expect(screen.getByLabelText("Palabra completa")).toBeChecked();
});

it("prevents oversized replacement sets and explains a current-model rejection", () => {
  const findText=vi.fn(()=>Array.from({length:1001},(_,i)=>({from:i+1,to:i+2,text:"a"})));
  const replaceText=vi.fn(()=>0);
  const controller={findText,replaceText} as unknown as MarkdownEditorController;
  const view=render(<DocumentToolsPanel controller={controller} revision="A" scope="A" name="Grande.md"/>);
  fireEvent.change(screen.getByLabelText("Buscar en el documento"),{target:{value:"a"}});
  fireEvent.click(screen.getByText("Reemplazar texto"));
  expect(screen.getByRole("button",{name:"Reemplazar todas"})).toBeDisabled();
  expect(screen.getByText(/Acota la búsqueda/)).toBeInTheDocument();
  findText.mockReturnValue([{from:1,to:2,text:"a"}]);
  view.rerender(<DocumentToolsPanel controller={controller} revision="B" scope="A" name="Grande.md"/>);
  fireEvent.click(screen.getByRole("button",{name:"Reemplazar una"}));
  expect(screen.getByRole("status")).toHaveTextContent("No se aplicaron cambios");
});
