import {cleanup,fireEvent,render,screen} from "@testing-library/react";import {afterEach,expect,it,vi} from "vitest";import {AssetMoveImpactDialog} from "./AssetMoveImpactDialog";
afterEach(cleanup);const review={name:"Adjunto.pdf",path:"Docs/Adjunto.pdf",incoming:2,outgoing:0,complete:false,warnings:["Consulta parcial"]};
it("names the rename target and requires review without promising general link rewriting",()=>{
 const decide=vi.fn();render(<AssetMoveImpactDialog review={{...review,operation:"rename",nextName:"Informe.pdf"}} onDecide={decide}/>);
 expect(screen.getByText(/Nuevo nombre:.*Informe.pdf/)).toBeVisible();expect(screen.getByRole("button",{name:"Renombrar con este alcance"})).toBeDisabled();
 fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:"Renombrar con este alcance"}));expect(decide).toHaveBeenCalledWith(true);
});
it("confirms trash without an extra consent checkbox when the complete review has no links",()=>{
 const decide=vi.fn();render(<AssetMoveImpactDialog review={{...review,incoming:0,outgoing:0,complete:true,warnings:[],operation:"delete"}} onDecide={decide}/>);
 expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();expect(screen.getByText(/podrás restaurarlo/)).toBeVisible();fireEvent.click(screen.getByRole("button",{name:"Enviar a la papelera"}));expect(decide).toHaveBeenCalledWith(true);
});
it("keeps the exact operation and recovery scope in English",()=>{
 render(<AssetMoveImpactDialog language="en" review={{...review,operation:"delete"}} onDecide={vi.fn()}/>);
 expect(screen.getByRole("dialog",{name:"Move to trash"})).toBeInTheDocument();expect(screen.getByRole("button",{name:"Move to trash"})).toBeDisabled();expect(screen.getByText(/Open changes are protected/)).toBeVisible();
});
it("requires explicit consent for incomplete link impact and never moves on close",()=>{const decide=vi.fn();render(<AssetMoveImpactDialog review={review} onDecide={decide}/>);expect(screen.getByRole("button",{name:"Mover con este alcance"})).toBeDisabled();expect(screen.getByRole("status")).toHaveTextContent(/parcial/);fireEvent.click(screen.getByRole("button",{name:"Volver"}));expect(decide).toHaveBeenCalledWith(false);});
it("invalidates movement consent when a new impact review replaces the previous one",()=>{const decide=vi.fn();const view=render(<AssetMoveImpactDialog review={review} onDecide={decide}/>);fireEvent.click(screen.getByRole("checkbox"));expect(screen.getByRole("button",{name:"Mover con este alcance"})).toBeEnabled();view.rerender(<AssetMoveImpactDialog review={{...review,incoming:3}} onDecide={decide}/>);expect(screen.getByRole("button",{name:"Mover con este alcance"})).toBeDisabled();});
