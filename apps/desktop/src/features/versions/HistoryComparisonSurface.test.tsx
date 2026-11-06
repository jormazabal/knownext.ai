import { useEffect, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HistoryComparisonSurface } from "./HistoryComparisonSurface";
afterEach(cleanup);
it("conserva la instancia del editor, su borrador y la posición al consultar historial",()=>{
  const mount=vi.fn();const dispose=vi.fn();
  function Editor(){const[value,setValue]=useState("Original");useEffect(()=>{mount();return dispose;},[]);return <textarea aria-label="Borrador" value={value} onChange={event=>setValue(event.target.value)}/>;}
  const view=render(<HistoryComparisonSurface documentId="doc" preview={null}><Editor/></HistoryComparisonSurface>);
  const editor=screen.getByRole("textbox",{name:"Borrador"});
  fireEvent.change(editor,{target:{value:"Cambios todavía sin guardar"}});
  const scroller=editor.parentElement!.parentElement!;
  scroller.scrollTop=480;fireEvent.scroll(scroller);
  view.rerender(<HistoryComparisonSurface documentId="doc" preview={<p>Comparación de solo lectura</p>}><Editor/></HistoryComparisonSurface>);
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  scroller.scrollTop=0;fireEvent.scroll(scroller);
  view.rerender(<HistoryComparisonSurface documentId="doc" preview={null}><Editor/></HistoryComparisonSurface>);
  expect(screen.getByRole("textbox")).toBe(editor);
  expect(editor).toHaveValue("Cambios todavía sin guardar");
  expect(scroller.scrollTop).toBe(480);
  expect(mount).toHaveBeenCalledTimes(1);expect(dispose).not.toHaveBeenCalled();
});
