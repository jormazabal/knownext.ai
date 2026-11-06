import { StrictMode, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ModalFrame } from "./ModalFrame";
afterEach(cleanup);
it("lets a child menu consume Escape before closing its parent dialog",()=>{
 const close=vi.fn(),menuClose=vi.fn();
 render(<ModalFrame label="Options" onClose={close}><button onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();menuClose();}}}>Menu item</button></ModalFrame>);
 fireEvent.keyDown(screen.getByRole("button",{name:"Menu item"}),{key:"Escape"});expect(menuClose).toHaveBeenCalledOnce();expect(close).not.toHaveBeenCalled();
});
it("releases shared isolation when nested confirmations unmount with their parent, repeatedly", async () => {
  function Fixture() {
    const [open, setOpen] = useState(false), [confirm, setConfirm] = useState(false);
    return <><main data-testid="workspace"><button onClick={() => {setConfirm(false);setOpen(true);}}>Settings</button></main>{open &&
      <ModalFrame label="Settings" onClose={() => setOpen(false)}>
        <button onClick={() => setConfirm(true)}>Remove</button>
        {confirm && <ModalFrame label="Confirm removal" onClose={() => setConfirm(false)}><button onClick={() => setOpen(false)}>Commit removal</button></ModalFrame>}
      </ModalFrame>}</>;
  }
  render(<StrictMode><Fixture/></StrictMode>);
  const workspace = screen.getByTestId("workspace");
  for(let attempt=0;attempt<3;attempt++) {
    const trigger=screen.getByRole("button",{name:"Settings"});trigger.focus();fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button",{name:"Remove"}));
    expect(workspace.inert).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Commit removal"}));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(workspace.inert).toBe(false);
    await waitFor(()=>expect(trigger).toHaveFocus());
  }
});

it("preserves isolation owned before the modal instead of clearing it", () => {
  const background=document.createElement("section");background.inert=true;document.body.append(background);
  try {
    const view=render(<ModalFrame label="Temporary" onClose={()=>{}}><button>Close</button></ModalFrame>);
    view.unmount();expect(background.inert).toBe(true);
  } finally {background.remove();}
});
it("owns keyboard focus, isolates the background and returns focus on Escape", () => {
  function Fixture() {
    const [open, setOpen] = useState(false);
    return <><button onClick={() => setOpen(true)}>Open</button>{open &&
      <ModalFrame label="Test dialog" onClose={() => setOpen(false)}>
        <div><input aria-label="Name" data-autofocus/><button>Last</button></div>
      </ModalFrame>}</>;
  }
  render(<Fixture/>);
  const trigger = screen.getByRole("button", { name: "Open" });
  trigger.focus();
  fireEvent.click(trigger);
  const name = screen.getByLabelText("Name");
  const last = screen.getByRole("button", { name: "Last" });
  expect(name).toHaveFocus();
  expect(trigger.inert).toBe(true);
  last.focus(); fireEvent.keyDown(last, { key: "Tab" });
  expect(name).toHaveFocus();
  fireEvent.keyDown(name, { key: "Tab", shiftKey: true });
  expect(last).toHaveFocus();
  fireEvent.keyDown(last, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(trigger.inert).toBe(false);
  expect(trigger).toHaveFocus();
});

it("returns focus to the parent dialog when a confirmed action removes its trigger", () => {
  function Fixture() {
    const [row,setRow]=useState(true),[confirm,setConfirm]=useState(false);
    return <ModalFrame label="Recovery" onClose={()=>{}}><section>{row&&<button onClick={()=>setConfirm(true)}>Discard</button>}</section>{confirm&&<ModalFrame role="alertdialog" label="Confirm" onClose={()=>setConfirm(false)}><button onClick={()=>{setRow(false);setConfirm(false);}}>Commit</button></ModalFrame>}</ModalFrame>;
  }
  render(<Fixture/>);
  const trigger=screen.getByRole("button",{name:"Discard"});trigger.focus();fireEvent.click(trigger);
  fireEvent.click(screen.getByRole("button",{name:"Commit"}));
  expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  expect(screen.getByRole("dialog",{name:"Recovery"})).toHaveFocus();
});

it("uses a visible fallback when resizing hides the connected launcher",()=>{
  const launcher=document.createElement("button"),workspace=document.createElement("main");
  launcher.textContent="Owned launcher";workspace.tabIndex=-1;document.body.append(launcher,workspace);launcher.focus();
  try {
    const view=render(<ModalFrame label="Resize" onClose={()=>{}} fallbackFocus={()=>workspace}><button>Close</button></ModalFrame>);
    launcher.style.display="none";view.unmount();expect(workspace).toHaveFocus();expect(workspace.inert).toBe(false);
  }finally{launcher.remove();workspace.remove();}
});
