import {act,cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {useState} from "react";
import {AiPromptInput} from "./AiPromptInput";
import {ActiveContextSourcesDialog} from "./ActiveContextSourcesDialog";
import type {AiContextSource,AiContextSourcePreviewResponse,AiContextOriginReview} from "../../types/domain";
vi.mock("../transcription/useRealtimeTranscription",()=>({useRealtimeTranscription:()=>({status:"idle",activeTarget:null,error:null,start:vi.fn(),stop:vi.fn(),resetError:vi.fn()})}));
const source:AiContextSource={id:"p::A.md",projectId:"p",kind:"project_document",name:"A.md",path:"A.md",sizeBytes:12,status:"ready",weight:"light",createdAt:"2026-11-02T08:00:00Z",updatedAt:"2026-11-02T08:00:00Z",sourceOrigin:"file",requiresReview:true};
const review:AiContextOriginReview={source,sourceRevision:"1".repeat(64),fileRevision:"2".repeat(64),locationRevision:"3".repeat(64),status:"changed",canRefresh:true,checkedAt:"2026-11-02T08:30:00Z",message:"El origen cambió. Se conserva la copia anterior."};
const preview:AiContextSourcePreviewResponse={source,previewText:"Copia anterior conservada",metadata:{},originReview:review};
beforeEach(()=>localStorage.clear());afterEach(()=>{cleanup();vi.restoreAllMocks();});
it("blocks sending a flagged context while keeping the prompt editable",()=>{
  const submit=vi.fn();render(<AiPromptInput projectId="p" markdown="" providerReady onSubmit={submit} activeContextSources={[source]}/>);
  const text=screen.getByRole("textbox");fireEvent.change(text,{target:{value:"Consulta documental"}});fireEvent.keyDown(text,{key:"Enter"});
  expect(text).toHaveValue("Consulta documental");expect(screen.getByRole("button",{name:/^Enviar(?: prompt)?$/})).toBeDisabled();expect(submit).not.toHaveBeenCalled();expect(screen.getByText(/Hay copias de contexto que revisar/)).toBeInTheDocument();
});
it("keeps an uncertain refresh blocked until a successful origin read and another explicit decision",async()=>{
  const read=vi.fn().mockResolvedValue(preview),refresh=vi.fn().mockRejectedValueOnce(new Error("Confirmación pendiente"));
  function Harness(){const[sources,setSources]=useState([source]);return <AiPromptInput projectId="p" markdown="" providerReady onSubmit={vi.fn()} activeContextSources={sources} onPreviewContextSource={read} onRefreshContextSource={async(id,review)=>{const result=await refresh(id,review);setSources([result.source]);return result;}}/>;}
  render(<Harness/>);fireEvent.click(screen.getByRole("button",{name:"A.md"}));const dialog=await screen.findByRole("dialog",{name:"Fuentes del contexto IA"});await within(dialog).findByText("Copia anterior conservada");
  fireEvent.click(within(dialog).getByRole("button",{name:"Actualizar copia"}));await within(dialog).findByText(/Confirmación pendiente/);const update=within(dialog).getByRole("button",{name:"Actualizar copia"});expect(update).toBeDisabled();fireEvent.click(update);expect(refresh).toHaveBeenCalledTimes(1);
  const fresh={...preview,originReview:{...review,sourceRevision:"4".repeat(64),fileRevision:"5".repeat(64)}};
  read.mockResolvedValueOnce(fresh);fireEvent.click(within(dialog).getByRole("button",{name:"Revisar origen"}));await waitFor(()=>expect(update).toBeEnabled());
  const current={...source,requiresReview:false};refresh.mockResolvedValueOnce({source:current,previewText:"Copia actualizada",metadata:{},originReview:{...fresh.originReview,source:current,status:"current"}});
  fireEvent.click(update);await within(dialog).findByText("Copia actualizada");expect(refresh).toHaveBeenCalledTimes(2);expect(refresh.mock.calls[0][1].sourceRevision).toBe("1".repeat(64));expect(refresh.mock.calls[1][1].sourceRevision).toBe("4".repeat(64));
  fireEvent.click(within(dialog).getByRole("button",{name:"Cerrar fuentes del contexto"}));await waitFor(()=>expect(screen.queryByRole("dialog")).not.toBeInTheDocument());expect(screen.getByRole("button",{name:/^Enviar(?: prompt)?$/})).toBeEnabled();
});
it("does not reopen a source from the previous project after its delayed preview arrives",async()=>{
  let resolve!:(result:AiContextSourcePreviewResponse)=>void;const read=vi.fn(()=>new Promise<AiContextSourcePreviewResponse>(done=>{resolve=done;}));
  const {rerender}=render(<AiPromptInput projectId="p" markdown="" providerReady onSubmit={vi.fn()} activeContextSources={[source]} onPreviewContextSource={read}/>);fireEvent.click(screen.getByRole("button",{name:"A.md"}));await screen.findByRole("dialog",{name:"Fuentes del contexto IA"});
  rerender(<AiPromptInput projectId="other" markdown="" providerReady onSubmit={vi.fn()} activeContextSources={[]} onPreviewContextSource={read}/>);
  await act(async()=>resolve(preview));expect(screen.queryByRole("dialog")).not.toBeInTheDocument();expect(screen.queryByText("Copia anterior conservada")).not.toBeInTheDocument();
});
it("labels uploaded snapshots and offers creating a text document without claiming a live file link",()=>{
  const snapshot={...source,id:"upload-one",kind:"external_file" as const,path:null,sourceOrigin:"snapshot" as const,requiresReview:false};const onRefresh=vi.fn();
  render(<ActiveContextSourcesDialog refElement={{current:null}} sources={[snapshot]} preview={{source:snapshot,previewText:"Texto adjunto",metadata:{},originReview:{...review,source:snapshot,status:"snapshot",canRefresh:false,message:"Instantánea incorporada sin archivo de origen vinculado."}}} previewLoadingId={null} busy={false} blocked={false} error={null} onPreview={vi.fn()} onRefresh={onRefresh} onAddToProject={vi.fn()} onClose={vi.fn()}/>);
  expect(screen.getByText("Instantánea adjunta")).toBeInTheDocument();expect(screen.queryByRole("button",{name:"Actualizar copia"})).not.toBeInTheDocument();expect(screen.getByRole("button",{name:"Crear documento con este texto"})).toBeInTheDocument();expect(onRefresh).not.toHaveBeenCalled();
});
