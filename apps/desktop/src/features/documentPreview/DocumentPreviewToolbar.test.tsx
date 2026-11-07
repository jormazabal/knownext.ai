import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {DocumentPreviewToolbar} from "./DocumentPreviewToolbar";
import type {DocumentPreview} from "../../types/domain";

let resize:(width:number)=>void;
beforeEach(()=>{
  vi.stubGlobal("ResizeObserver",class {
    constructor(private callback:(entries:Array<{contentRect:{width:number;height:number}}>)=>void){}
    observe(){resize=width=>this.callback([{contentRect:{width,height:44}}]);resize(320);}
    disconnect(){}
  });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.clearAllMocks();});
const preview:DocumentPreview={id:"preview-qa",projectId:"project",path:"source.pdf",name:"source.pdf",format:"pdf",status:"ready",readonly:true,sourceFingerprint:{size:1,mtimeNs:null,sha256:null},availableRenditions:["pdf","text"],warnings:[]};
const props={preview,query:"consulta",searchCount:2,zoomPercent:100,fitMode:"width" as const,pageNumber:1,pageCount:3,activeSheetId:"",busy:false,openingExternal:false,onQueryChange:vi.fn(),onZoomChange:vi.fn(),onFitModeChange:vi.fn(),onSelectSheet:vi.fn(),onPageChange:vi.fn(),onRefresh:vi.fn(),onOpenExternal:vi.fn()};

it("keeps primary tools available and returns focus after Escape from compact view options",()=>{
  render(<DocumentPreviewToolbar {...props}/>);
  expect(screen.getByRole("button",{name:"Actualizar vista"})).toBeVisible();
  expect(screen.getByRole("button",{name:"Abrir externo"})).toBeVisible();
  const toggle=screen.getByRole("button",{name:"Vista"});
  fireEvent.click(toggle);
  const zoom=screen.getByRole("button",{name:"Reducir zoom"});
  expect(zoom).toHaveFocus();
  fireEvent.click(zoom);expect(props.onZoomChange).toHaveBeenCalledWith(90);
  fireEvent.keyDown(zoom,{key:"Escape"});
  expect(toggle).toHaveFocus();expect(toggle).toHaveAttribute("aria-expanded","false");
  expect(screen.queryByRole("button",{name:"Reducir zoom"})).not.toBeInTheDocument();
  expect(screen.getByRole("textbox",{name:"Buscar en documento"})).toHaveValue("consulta");
});

it("adapts to the panel resize and preserves query without depending on window width",()=>{
  render(<DocumentPreviewToolbar {...props}/>);
  expect(screen.getByRole("button",{name:"Vista"})).toBeVisible();
  act(()=>resize(800));
  expect(screen.queryByRole("button",{name:"Vista"})).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Ajustar página"})).toBeVisible();
  act(()=>resize(320));
  expect(screen.getByRole("button",{name:"Vista"})).toHaveAttribute("aria-expanded","false");
  expect(screen.getByRole("textbox",{name:"Buscar en documento"})).toHaveValue("consulta");
});

it("does not invent a known page count or permit another refresh while pending",()=>{
  render(<DocumentPreviewToolbar {...props} pageCount={null} busy openingExternal/>);
  expect(screen.getByRole("button",{name:"Página siguiente"})).toBeDisabled();
  expect(screen.getByRole("button",{name:"Página anterior"})).toBeDisabled();
  expect(screen.getByRole("button",{name:"Actualizar vista"})).toBeDisabled();
  expect(screen.getByRole("button",{name:"Abrir externo"})).toBeDisabled();
  expect(screen.getByText("1 / ?")).toBeVisible();
});
