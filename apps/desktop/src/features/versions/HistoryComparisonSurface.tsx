import { useLayoutEffect, useRef, type ReactNode } from "react";

/** The live editor keeps its DOM, undo stack and scroll surface while history is consulted. */
export function HistoryComparisonSurface({ documentId, preview, children }: { documentId:string; preview:ReactNode|null; children:ReactNode }) {
  const documentScroll=useRef<HTMLDivElement>(null);
  const savedScroll=useRef({documentId,top:0});
  const previous=useRef({documentId,preview:false});
  const showingPreview=preview!==null;
  useLayoutEffect(()=>{
    const returning=previous.current.documentId===documentId&&previous.current.preview&&!showingPreview;
    previous.current={documentId,preview:showingPreview};
    if(savedScroll.current.documentId!==documentId)savedScroll.current={documentId,top:0};
    const surface=documentScroll.current;
    if(returning&&surface){
      surface.scrollTop=savedScroll.current.top;
      const editor=Array.from(surface.querySelectorAll<HTMLElement>('[contenteditable="true"]')).find(element=>element.getClientRects().length>0);
      editor?.focus({preventScroll:true});
    }
  },[documentId,showingPreview]);
  return <div className="flex h-full min-h-0 flex-col">
    <div ref={documentScroll} hidden={showingPreview} className="min-h-0 flex-1 overflow-y-auto px-8 pb-12 pt-4" onScroll={event=>{
      if(!showingPreview)savedScroll.current={documentId,top:event.currentTarget.scrollTop};
    }}><div className="mx-auto max-w-[900px]">{children}</div></div>
    <div hidden={!showingPreview} className="min-h-0 flex-1 overflow-y-auto px-4 pb-12 pt-4 sm:px-8"><div className="mx-auto max-w-[1100px]">{preview}</div></div>
  </div>;
}
