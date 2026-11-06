import {Crepe} from "@milkdown/crepe";
import {prosePluginsCtx} from "@milkdown/kit/core";
import {Milkdown,MilkdownProvider,useEditor} from "@milkdown/react";
import type {CSSProperties} from "react";
import {clearHighlightCommand,configureHighlightMarkdownSerialization,highlightSchema,remarkHighlightHtmlPlugin,toggleHighlightCommand} from "./highlightExtension";
import {configureUnderlineMarkdownSerialization,remarkUnderlineHtmlPlugin,toggleUnderlineCommand,underlineSchema} from "./underlineExtension";
import {createMermaidDiagramPlugin,createMermaidDiagramViewPlugin} from "./mermaidNodeView";
import {preservedBlockSchema,configureDocumentFidelity} from "./documentFidelity";
import {configureImageFidelity,createReadonlyImageMetadataPlugin,remarkImageFidelity} from "./imageFidelity";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "./MarkdownEditor.css";

export function ReadonlyMilkdownView({markdown,zoomPercent}:{markdown:string;zoomPercent:number}){
  return <MilkdownProvider key={markdown}><ReadonlyMilkdown markdown={markdown} zoomPercent={zoomPercent}/></MilkdownProvider>;
}
function ReadonlyMilkdown({markdown,zoomPercent}:{markdown:string;zoomPercent:number}){
  useEditor(root=>{
    const crepe=new Crepe({root,defaultValue:markdown,features:{[Crepe.Feature.BlockEdit]:false,[Crepe.Feature.LinkTooltip]:false,[Crepe.Feature.Toolbar]:false}});
    crepe.editor.config(ctx=>{
      configureUnderlineMarkdownSerialization(ctx);configureHighlightMarkdownSerialization(ctx);
      configureImageFidelity(ctx);
      configureDocumentFidelity(ctx);
      ctx.update(prosePluginsCtx,plugins=>[createMermaidDiagramPlugin(),createReadonlyImageMetadataPlugin(),...plugins]);
    });
    crepe.editor.use(createMermaidDiagramViewPlugin());
    crepe.editor.use(remarkUnderlineHtmlPlugin).use(underlineSchema).use(toggleUnderlineCommand);
    crepe.editor.use(remarkHighlightHtmlPlugin).use(highlightSchema).use(toggleHighlightCommand).use(clearHighlightCommand);
    crepe.editor.use(remarkImageFidelity);
    crepe.editor.use(preservedBlockSchema);
    crepe.setReadonly(true);return crepe;
  },[]);
  return <div className="knownext-editor knownext-readonly-editor" style={{"--knownext-markdown-zoom":String(zoomPercent/100)} as CSSProperties}><Milkdown/></div>;
}
