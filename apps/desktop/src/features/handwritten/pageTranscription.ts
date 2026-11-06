import type {HandwrittenNoteContent} from "../../types/domain";
export const MAX_PAGE_TEXT=64_000;
const MAX_NOTE_TEXT_BYTES=512*1024;

export function pageTranscription(note:HandwrittenNoteContent,pageId:string):string {
  const value=note.ocr?.textByPage?.[pageId];
  return typeof value==="string"?value:"";
}

/** Patch text on the latest note; never replace the drawing with a dialog snapshot. */
export function updatePageTranscription(note:HandwrittenNoteContent,pageId:string,baseText:string,text:string):HandwrittenNoteContent {
  if(note.schemaVersion!==1||note.pages.filter(page=>page.id===pageId).length!==1)throw new Error("La página ya no está disponible. El texto pendiente se conserva.");
  if(!note.ocr?.textByPage||typeof note.ocr.textByPage!=="object"||Array.isArray(note.ocr.textByPage)||Object.values(note.ocr.textByPage).some(value=>typeof value!=="string"))throw new Error("El formato de transcripción no es compatible. Se conserva la nota sin reemplazarlo.");
  if((note.ocr.textByPage[pageId]??"")!==baseText)throw new Error("La transcripción cambió mientras la revisabas. Revisa el texto actual antes de aplicar; tu edición se conserva.");
  if(text.length>MAX_PAGE_TEXT)throw new Error("El texto de la página supera 64.000 caracteres.");
  const textByPage={...note.ocr.textByPage,[pageId]:text};
  const bytes=Object.values(textByPage).reduce((sum,value)=>sum+new TextEncoder().encode(value).byteLength,0);
  if(bytes>MAX_NOTE_TEXT_BYTES)throw new Error("La nota alcanza el límite de transcripción. Reduce el texto antes de aplicarlo; los dibujos se conservan.");
  const updatedAt=new Date().toISOString();
  return {...note,updatedAt,ocr:{...note.ocr,status:"updated",updatedAt,textByPage}};
}
