import type {CSSProperties} from "react";
import {createDeferredView} from "../../components/ui/createDeferredView";

type ReadonlyMarkdownViewerProps={markdown:string;ariaLabel:string;emptyMessage:string;zoomPercent?:number};
const ReadonlyMilkdown=createDeferredView<{markdown:string;zoomPercent:number}>(()=>import("./ReadonlyMilkdown").then(module=>({default:module.ReadonlyMilkdownView})),"Preparando vista previa…","No se pudo cargar la vista previa. El documento se conserva.");

export function ReadonlyMarkdownViewer({markdown,ariaLabel,emptyMessage,zoomPercent=100}:ReadonlyMarkdownViewerProps){
  return <article aria-label={ariaLabel} data-testid="readonly-markdown-viewer">
    {markdown.trim().length>0?<ReadonlyMilkdown markdown={markdown} zoomPercent={zoomPercent}/>:<div className="knownext-editor" style={{"--knownext-markdown-zoom":String(zoomPercent/100)} as CSSProperties}><p className="text-[13px] text-ink-secondary">{emptyMessage}</p></div>}
  </article>;
}
