import {useEffect,useRef,useState} from "react";
import {deliverTemplateCatalog,importTemplateCatalog,inspectTemplateTransfer,prepareTemplateCatalog,reviewTemplateCatalog} from "../../lib/api/documentTemplateTransfer";
import {getApiErrorMessage} from "../../lib/api/client";
import type {DocumentTemplate,DocumentTemplateSummary,DocumentTemplateTransferFile,DocumentTemplateTransferReview,TemplateCatalogResult} from "../../types/documentTemplates";

export type TemplateCatalogTransferMode={kind:"export-catalog";templates:DocumentTemplateSummary[]}|{kind:"import-catalog";file:{fileName:string;content:string};review:DocumentTemplateTransferReview};
export function useDocumentTemplateCatalogTransfer(mode:TemplateCatalogTransferMode,onImported:(template:DocumentTemplate)=>void|Promise<void>){
  const incoming=mode.kind==="import-catalog"?mode.review.catalog??[]:[];
  const items=mode.kind==="export-catalog"?mode.templates.map((item,index)=>({index,name:item.name,description:item.description})):incoming;
  const[selected,setSelected]=useState(()=>new Set(mode.kind==="import-catalog"?incoming.map(item=>item.index):[] as number[]));
  const[names,setNames]=useState<Record<number,string>>(()=>Object.fromEntries(incoming.map(item=>[item.index,item.name])));
  const[file,setFile]=useState<DocumentTemplateTransferFile|null>(null);
  const[review,setReview]=useState<DocumentTemplateTransferReview|null>(mode.kind==="import-catalog"?mode.review:null);
  const[result,setResult]=useState<TemplateCatalogResult|null>(null);
  const[needsReview,setNeedsReview]=useState(true);
  const[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const[delivered,setDelivered]=useState(false);
  const running=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  function changed(){setResult(null);setNeedsReview(true);setError("");setNotice("");setDelivered(false);if(mode.kind==="export-catalog"){setFile(null);setReview(null);}}
  function toggle(index:number){if(running.current)return;changed();setSelected(previous=>{const next=new Set(previous);if(next.has(index))next.delete(index);else if(next.size<32)next.add(index);return next;});}
  function rename(index:number,name:string){if(running.current)return;changed();setNames(previous=>({...previous,[index]:name}));}
  const importSelection=items.filter(item=>selected.has(item.index)).map(item=>({index:item.index,name:(names[item.index]??item.name).trim()}));
  const exportSelection=mode.kind==="export-catalog"?mode.templates.filter((_,index)=>selected.has(index)).map(({id,revision})=>({id,revision})):[];
  const valid=selected.size>0&&selected.size<=32&&importSelection.every(item=>!!item.name)&&new Set(importSelection.map(item=>item.name.toLowerCase())).size===importSelection.length;
  async function primary(reviewedResources=false){
    if(running.current||!valid)return;
    running.current=true;setBusy(true);setError("");setNotice("");
    try{
      if(mode.kind==="export-catalog"){
        if(!file){const prepared=await prepareTemplateCatalog(exportSelection);const inspected=await inspectTemplateTransfer(prepared.content);if(!inspected.catalog?.length)throw Error("La preparación no devolvió un catálogo revisable");if(alive.current){setFile(prepared);setReview(inspected);}}
        else{const receipt=await deliverTemplateCatalog(exportSelection);if(alive.current){setDelivered(receipt.status!=="cancelled");setNotice(receipt.status==="cancelled"?"Destino cancelado. La selección y las plantillas se conservan.":receipt.status==="saved"?`Catálogo guardado como «${receipt.fileName}».`:"Descarga solicitada; comprueba el archivo recibido.");}}
      }else if(needsReview){
        const observed=await reviewTemplateCatalog(mode.file.content,mode.review.digest,importSelection);
        if(alive.current){setResult(observed);setNeedsReview(false);}
      }else{
        // Every explicit apply is followed by a read-only review before another apply.
        const applied=await (reviewedResources?importTemplateCatalog(mode.file.content,mode.review.digest,importSelection,true):importTemplateCatalog(mode.file.content,mode.review.digest,importSelection));
        if(!alive.current)return;
        setResult(applied);setNeedsReview(true);
        const template=(applied.outcomes.find(item=>item.status==="imported"&&item.template)??applied.outcomes.find(item=>item.status==="existing"&&item.template))?.template;
        if(template){try{await onImported(template);}catch(cause){if(alive.current)setError(getApiErrorMessage(cause,"La importación tiene resultado confirmado, pero falta actualizar el selector. Conserva este resultado y vuelve a abrir Crear documento."));}}
      }
    }catch(cause){if(alive.current){setError(getApiErrorMessage(cause,"No se confirmó el resultado. Se conservan el archivo y los nombres; revisa el catálogo antes de continuar."));if(mode.kind==="import-catalog"){setNeedsReview(true);setResult(null);}}}
    finally{running.current=false;if(alive.current)setBusy(false);}
  }
  return{items,selected,names,toggle,rename,file,review,result,needsReview,busy,error,notice,delivered,valid,primary,running};
}
