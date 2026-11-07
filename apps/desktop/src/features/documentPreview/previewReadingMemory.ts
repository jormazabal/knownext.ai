import type { DocumentFingerprint } from "../../types/domain";
export type PdfReadingPosition = { pageNumber:number; offsetRatio:number; horizontalRatio:number };
export type SheetReadingPosition = { top:number; left:number };
export type PreviewReadingState = {
  query:string; zoomPercent:number; fitMode:"width"|"page"|null; pageNumber:number;
  pdfPosition:PdfReadingPosition|null; activeSheetId:string;
  sheetPositions:Record<string,SheetReadingPosition>; lastPageFocus:string|null;
};
export const emptyPreviewReadingState = ():PreviewReadingState => ({query:"",zoomPercent:100,fitMode:"width",pageNumber:1,pdfPosition:null,activeSheetId:"",sheetPositions:{},lastPageFocus:null});
export function previewReadingScope(project:{id:string;folderPath:string},tab:{id:string;path:string;format:string}):string {
  return JSON.stringify([project.id,project.folderPath,tab.id,tab.path,tab.format]);
}
export function previewSourceRevision(source:DocumentFingerprint):string|null {
  return typeof source.sha256==="string" && source.sha256.length>0 && source.sha256.length<=128 && typeof source.size==="number" && Number.isFinite(source.size) && source.size>=0 && typeof source.mtimeNs==="number" && Number.isFinite(source.mtimeNs) ? JSON.stringify([source.sha256,source.size,source.mtimeNs]) : null;
}
function copy(value:PreviewReadingState):PreviewReadingState {
  const finite=(n:number,max:number)=>Number.isFinite(n)?Math.max(0,Math.min(n,max)):0;
  return {...value, query:value.query.slice(0,512),zoomPercent:Math.max(50,Math.min(220,value.zoomPercent)),pageNumber:Math.max(1,Math.floor(value.pageNumber)),
    pdfPosition:value.pdfPosition?{pageNumber:Math.max(1,Math.floor(value.pdfPosition.pageNumber)),offsetRatio:finite(value.pdfPosition.offsetRatio,1),horizontalRatio:finite(value.pdfPosition.horizontalRatio,1)}:null,
    sheetPositions:Object.fromEntries(Object.entries(value.sheetPositions).slice(-16).map(([id,p])=>[id,{top:finite(p.top,10_000_000),left:finite(p.left,10_000_000)}]))};
}
/** Session memory only. Never retain documents, renditions, blobs or filesystem data. */
export class PreviewReadingMemory {
  private entries=new Map<string,{revision:string;state:PreviewReadingState}>();
  constructor(private readonly capacity=32){}
  read(scope:string,revision:string|null):PreviewReadingState|null {
    const entry=this.entries.get(scope);
    if(!entry)return null;
    this.entries.delete(scope);
    if(!revision||entry.revision!==revision)return null;
    this.entries.set(scope,entry);return copy(entry.state);
  }
  write(scope:string,revision:string|null,state:PreviewReadingState):void {
    this.entries.delete(scope);if(!revision)return;
    this.entries.set(scope,{revision,state:copy(state)});
    while(this.entries.size>this.capacity)this.entries.delete(this.entries.keys().next().value!);
  }
  forget(scope:string):void {this.entries.delete(scope);}
  clear():void {this.entries.clear();}
  get size():number{return this.entries.size;}
}
export const previewReadingMemory=new PreviewReadingMemory();
