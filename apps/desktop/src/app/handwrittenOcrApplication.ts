import type {HandwrittenNoteContent} from "../types/domain";
import {pageTranscription,updatePageTranscription} from "../features/handwritten/pageTranscription";
/** Merge only reviewed text into the live note; a late ACK never replaces strokes or other pages. */
export function mergeOcrText(submitted:HandwrittenNoteContent,live:HandwrittenNoteContent,result:HandwrittenNoteContent,pageId:string):HandwrittenNoteContent{
 const page=submitted.pages.find(p=>p.id===pageId),current=live.pages.find(p=>p.id===pageId);
 if(!page||!current||JSON.stringify(page)!==JSON.stringify(current))throw Error("La página cambió mientras se aplicaba el texto. Las copias y los trazos actuales permanecen; consulta el intento.");
 const base=pageTranscription(submitted,pageId),text=pageTranscription(result,pageId);
 if(pageTranscription(live,pageId)!==base)throw Error("La transcripción cambió durante el acuse. Revisa las dos copias antes de continuar.");
 if(JSON.stringify(live)===JSON.stringify(submitted))return result;
 return updatePageTranscription(live,pageId,base,text);
}
