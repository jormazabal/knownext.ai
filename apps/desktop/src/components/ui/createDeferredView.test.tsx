import {useState} from "react";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import {createDeferredView} from "./createDeferredView";
afterEach(cleanup);
it("does not acquire a hidden workspace before activation and keeps its draft after closing",async()=>{
  function Workspace({open}:{open:boolean}){const[value,setValue]=useState("");return open?<input aria-label="Clave pendiente" value={value} onChange={e=>setValue(e.target.value)}/>:null;}
  const load=vi.fn(async()=>({default:Workspace}));const View=createDeferredView(load,"Preparando…","No disponible.",props=>props.open);
  const host=render(<View open={false}/>);expect(load).not.toHaveBeenCalled();expect(screen.queryByRole("status")).not.toBeInTheDocument();host.rerender(<View open/>);fireEvent.change(await screen.findByLabelText("Clave pendiente"),{target:{value:"borrador-local-sintetico"}});host.rerender(<View open={false}/>);expect(screen.queryByRole("textbox")).not.toBeInTheDocument();host.rerender(<View open/>);expect(screen.getByLabelText("Clave pendiente")).toHaveValue("borrador-local-sintetico");expect(load).toHaveBeenCalledOnce();
});
it("keeps surrounding work and current view props when a deferred view fails then retries",async()=>{
  const load=vi.fn<()=>Promise<{default:(props:{text:string})=>JSX.Element}>>().mockRejectedValueOnce(new Error("private-loader-detail"));
  const View=createDeferredView(load,"Preparando lectura…","No se pudo preparar la lectura.");
  function Harness(){const[text,setText]=useState("Trabajo pendiente");return <><input aria-label="Borrador" value={text} onChange={event=>setText(event.target.value)}/><View text={text}/></>;}
  render(<Harness/>);await screen.findByRole("alert");
  expect(screen.queryByText("private-loader-detail")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox",{name:"Borrador"}),{target:{value:"Edición conservada"}});
  load.mockResolvedValueOnce({default:({text})=><article aria-label="Lectura">{text}</article>});
  fireEvent.click(screen.getByRole("button",{name:"Volver a intentar"}));
  expect(await screen.findByLabelText("Lectura")).toHaveTextContent("Edición conservada");
  expect(screen.getByRole("textbox",{name:"Borrador"})).toHaveValue("Edición conservada");
  expect(load).toHaveBeenCalledTimes(2);
});
