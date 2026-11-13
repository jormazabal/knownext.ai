import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Download } from "lucide-react";
import { afterEach, expect, it, vi } from "vitest";
import { FloatingTreeMenu } from "./FloatingTreeMenu";

afterEach(()=>{cleanup();vi.restoreAllMocks();});
it("renders every submenu as an independent layer and returns focus one level at a time",async()=>{
  const select=vi.fn();
  render(<FloatingTreeMenu items={[{label:"Exportar",icon:Download,submenu:[{label:"Documento",icon:Download,submenu:[{label:"PDF",icon:Download,action:"pdf"}]}]}]} onSelect={select}/>);
  const trigger=screen.getByRole("menuitem",{name:"Exportar"});trigger.focus();fireEvent.keyDown(trigger,{key:"ArrowRight"});
  const first=screen.getByRole("menu",{name:"Exportar"});
  expect(first.parentElement).toBe(document.body);expect(within(first).getByRole("menuitem",{name:"Documento"})).toHaveFocus();
  fireEvent.keyDown(document.activeElement!,{key:"ArrowRight"});
  const second=screen.getByRole("menu",{name:"Documento"});expect(second.parentElement).toBe(document.body);expect(first).not.toContainElement(second);
  expect(screen.getByRole("menuitem",{name:"PDF"})).toHaveFocus();fireEvent.keyDown(document.activeElement!,{key:"Escape"});
  expect(screen.queryByRole("menu",{name:"Documento"})).not.toBeInTheDocument();expect(within(first).getByRole("menuitem",{name:"Documento"})).toHaveFocus();
  fireEvent.keyDown(document.activeElement!,{key:"ArrowLeft"});expect(trigger).toHaveFocus();expect(select).not.toHaveBeenCalled();
  await userEvent.click(trigger);await userEvent.click(screen.getByRole("menuitem",{name:"Documento"}));await userEvent.click(screen.getByRole("menuitem",{name:"PDF"}));expect(select).toHaveBeenCalledWith("pdf");
});
it("flips a submenu to the left near the viewport edge",()=>{
  render(<FloatingTreeMenu items={[{label:"Exportar",icon:Download,submenu:[{label:"PDF",icon:Download,action:"pdf"}]}]} onSelect={vi.fn()}/>);
  const trigger=screen.getByRole("menuitem",{name:"Exportar"});
  vi.spyOn(trigger,"getBoundingClientRect").mockReturnValue({left:window.innerWidth-250,right:window.innerWidth-10,top:60,bottom:92,width:240,height:32,x:0,y:60,toJSON:()=>({})});
  fireEvent.mouseEnter(trigger);
  const submenu=screen.getByRole("menu",{name:"Exportar"});
  expect(Number.parseFloat(submenu.style.left)).toBe(window.innerWidth-250-190-6);
  expect(submenu).toHaveClass("knownext-tree-menu");
});
