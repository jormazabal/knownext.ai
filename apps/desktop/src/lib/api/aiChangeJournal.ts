import {prepareAiChange,applyTrackedAiChange} from "./aiChanges";
import type {AiChange,AiChangePreparation} from "../../types/aiChanges";
/** One native receipt per editor transaction. A lost acknowledgement is never replayed. */
export class AiChangeJournal {
 private pending=new Map<string,{documentId:string;receipt:AiChange|null;attempted:boolean}>();
 hasDocument(id:string){return [...this.pending.values()].some(x=>x.documentId===id);}
 hasOperation(id:string){return this.pending.has(id);}
 async prepare(id:string,documentId:string,body:AiChangePreparation,stillCurrent:()=>boolean=()=>true){if(this.pending.has(id)||this.hasDocument(documentId))throw Error("Espera la confirmación del cambio anterior de este documento");const item={documentId,receipt:null as AiChange|null,attempted:false};this.pending.set(id,item);try{item.receipt=await prepareAiChange(documentId,body);if(!stillCurrent())throw Error("La autorización o el documento cambiaron durante la preparación");return item.receipt;}catch(e){this.pending.delete(id);throw e;}}
 async apply(id:string,markdown:string,stillCurrent:()=>boolean=()=>true){const item=this.pending.get(id);if(!item?.receipt||item.attempted||!stillCurrent())throw Error("El cambio requiere consulta; no se repite la aplicación");item.attempted=true;return applyTrackedAiChange(item.documentId,item.receipt,markdown);}
 release(id:string){this.pending.delete(id);}
}
