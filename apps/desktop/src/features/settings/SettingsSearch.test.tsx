import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsSearch } from "./SettingsSearch";
afterEach(cleanup);
it("opens the matching category with an explicit scope and clears the query",()=>{
  const select=vi.fn();render(<SettingsSearch language="es" onSelect={select}/>);
  const input=screen.getByRole("searchbox",{name:"Buscar ajustes por tema"});
  fireEvent.change(input,{target:{value:"márgenes"}});
  expect(screen.getByRole("status")).toHaveTextContent("1 apartado encontrado");
  fireEvent.click(within(screen.getByRole("list")).getByRole("button"));
  expect(select).toHaveBeenCalledOnce();expect(select).toHaveBeenCalledWith("export");expect(input).toHaveValue("");expect(screen.queryByRole("list")).not.toBeInTheDocument();
});
it("uses Escape to clear a search before passing Escape to the containing view",()=>{
  const escape=vi.fn();render(<div onKeyDown={escape}><SettingsSearch language="es" onSelect={vi.fn()}/></div>);
  const input=screen.getByRole("searchbox");fireEvent.change(input,{target:{value:"not-a-setting"}});
  expect(screen.getByText(/Prueba otro tema/)).toBeInTheDocument();
  fireEvent.keyDown(input,{key:"Escape"});expect(input).toHaveFocus();expect(input).toHaveValue("");expect(escape).not.toHaveBeenCalled();
  fireEvent.keyDown(input,{key:"Escape"});expect(escape).toHaveBeenCalledOnce();
});
it("supports keyboard movement between search and its real result buttons",()=>{
  render(<SettingsSearch language="en" onSelect={vi.fn()}/>);
  const input=screen.getByRole("searchbox",{name:"Find settings by topic"});fireEvent.change(input,{target:{value:"api key"}});
  fireEvent.keyDown(input,{key:"ArrowDown"});const result=within(screen.getByRole("list")).getByRole("button");expect(result).toHaveFocus();
  fireEvent.keyDown(result,{key:"ArrowUp"});expect(input).toHaveFocus();
  fireEvent.click(screen.getByRole("button",{name:"Clear settings search"}));expect(input).toHaveFocus();expect(input).toHaveValue("");
});
