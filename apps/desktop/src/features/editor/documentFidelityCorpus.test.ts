import { Editor, defaultValueCtx, editorViewCtx, parserCtx, prosePluginsCtx, rootCtx, serializerCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { undo } from "@milkdown/kit/prose/history";
import { DOMSerializer, Schema } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import { imageBlockSchema, remarkImageBlockPlugin } from "@milkdown/kit/component/image-block";
import { afterAll, beforeAll, expect, it } from "vitest";
import { preservedBlockSchema, configureDocumentFidelity, documentPublication, createDocumentPasteGuard, incompatibleClipboardHtml, insertClipboardPlainText, type DocumentPasteNotice } from "./documentFidelity";
import { configureImageFidelity, remarkImageFidelity } from "./imageFidelity";
import { configureHighlightMarkdownSerialization, highlightSchema, remarkHighlightHtmlPlugin } from "./highlightExtension";
import { configureUnderlineMarkdownSerialization, underlineSchema, remarkUnderlineHtmlPlugin } from "./underlineExtension";
import { createMarkdownEditorController } from "./editorCommands";

const geometry: Array<[object,string,PropertyDescriptor|undefined]> = [];
beforeAll(()=>{for(const [owner,key,value] of [[Range.prototype,'getClientRects',()=>[new DOMRect(0,0,1,1)]],[Range.prototype,'getBoundingClientRect',()=>new DOMRect(0,0,1,1)],[Element.prototype,'scrollIntoView',()=>{}],[document,'elementFromPoint',()=>document.body],[window,'scrollBy',()=>{}]] as const){geometry.push([owner,key,Object.getOwnPropertyDescriptor(owner,key)]);Object.defineProperty(owner,key,{configurable:true,value});}});
afterAll(()=>geometry.forEach(([owner,key,descriptor])=>{if(descriptor)Object.defineProperty(owner,key,descriptor);else Reflect.deleteProperty(owner,key);}));
async function fixture(markdown:string,run:(e:Editor)=>Promise<void>|void,onNotice:(notice:DocumentPasteNotice|null)=>void=()=>{}){
 const root=document.createElement("div");document.body.append(root);
 const e=Editor.make().config(ctx=>{ctx.set(rootCtx,root);ctx.set(defaultValueCtx,markdown);configureImageFidelity(ctx);configureDocumentFidelity(ctx);ctx.update(prosePluginsCtx,p=>[createDocumentPasteGuard(onNotice),...p]);configureHighlightMarkdownSerialization(ctx);configureUnderlineMarkdownSerialization(ctx);}).use(commonmark).use(gfm).use(history).use(imageBlockSchema).use(remarkImageBlockPlugin).use(remarkUnderlineHtmlPlugin).use(underlineSchema).use(remarkHighlightHtmlPlugin).use(highlightSchema).use(remarkImageFidelity).use(preservedBlockSchema);
 try{await e.create();await run(e);}finally{await e.destroy();root.remove();}
}
const read=(e:Editor)=>e.action(ctx=>ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
const doc=(e:Editor)=>e.action(ctx=>ctx.get(editorViewCtx).state.doc);
const edit=(e:Editor)=>e.action(ctx=>{const v=ctx.get(editorViewCtx);v.dispatch(v.state.tr.insertText(" Añadido.",v.state.doc.content.size-1));});
const reparse=(e:Editor,md:string)=>e.action(ctx=>{const v=ctx.get(editorViewCtx);v.dispatch(v.state.tr.replaceWith(0,v.state.doc.content.size,ctx.get(parserCtx)(md).content));});
const protectedSources=(e:Editor)=>{const result:string[]=[];doc(e).descendants(node=>{if(node.type.name==="knownext_preserved_block")result.push(node.attrs.source);});return result;};

it("preserves YAML/TOML metadata opaquely while the document remains editable",async()=>{
 for(const prefix of ["---\ntitle: Documento\ncustom: [a, b]\n---\n","+++\ntitle = 'Documento'\n+++\n","\ufeff---\r\ntitle: Documento\r\n---\r\n"]){
  await fixture(prefix+"\nPárrafo editable.\n",e=>{expect(protectedSources(e)).toEqual([prefix]);edit(e);const output=read(e);expect(output).toContain(prefix);expect(output).toContain("Párrafo editable. Añadido.");reparse(e,output);expect(protectedSources(e)[0]).toBe(prefix);});
 }
});
it("keeps overlapping text after a metadata fence rather than discarding its parsed block",async()=>{
 await fixture("+++\ntitle = 'Documento'\n+++\nTexto adyacente.\n\nOtro párrafo.\n",e=>{edit(e);expect(read(e)).toContain("Texto adyacente.");expect(read(e)).toContain("Otro párrafo. Añadido.");});
});
it("preserves unused and reference-link definitions without hiding rendered links",async()=>{
 const source='[Enlace][manual].\n\n[manual]: docs/guia.md "Guía"\n[unused]: assets/original.png "Original"\n\nPárrafo editable.\n';
 await fixture(source,e=>{edit(e);const output=read(e);expect(output).toContain('[manual]: docs/guia.md "Guía"');expect(output).toContain('[unused]: assets/original.png "Original"');expect(output).toContain('[Enlace](docs/guia.md "Guía")');reparse(e,output);expect(protectedSources(e)).toHaveLength(1);});
});
it("keeps reference definitions invisible while preserving their original source and visible links",async()=>{
  const source='[Manual][manual].\n\n[manual]: docs/guia.md "Guía"\n[knownext-recording:session]: #\n\nFinal.\n';
  await fixture(source,e=>{
    e.action(ctx=>{
      const view=ctx.get(editorViewCtx);
      const definitions=view.dom.querySelector('[data-knownext-preserved-block="definition"]') as HTMLElement;
      expect(definitions.hidden).toBe(true);expect(definitions.textContent).toBe("");
      expect(view.dom.querySelector('a')?.textContent).toBe("Manual");
    });
    edit(e);expect(read(e)).toContain('[knownext-recording:session]: #');expect(read(e)).toContain('[manual]: docs/guia.md "Guía"');
    reparse(e,read(e));expect(protectedSources(e)).toHaveLength(1);
  });
});
it("preserves the mixed document corpus after unrelated editing and reopening",async()=>{
 const source='# Informe\n\n| Campo | Valor |\n| --- | --- |\n| **Dato** | [Web](https://example.invalid "Título") |\n\n- [x] Tarea completada\n- [ ] Tarea pendiente\n\n> Cita con *énfasis*.\n\nTexto con nota[^uno] y <u>subrayado</u> y <mark data-knx-highlight="green">resaltado</mark>.\n\n[^uno]: Nota conservada.\n\n```mermaid\ngraph TD\nA-->B\n```\n\n<!-- Comentario privado conservado -->\n\n<details>\n<summary>Detalle</summary>\n**Contenido HTML**\n</details>\n\n![Plano](assets/plano.png "Título imagen")\n\n<!-- knownext-image: {"version":1,"ratio":0.6} -->\n\nFinal.\n';
 await fixture(source,e=>{edit(e);const output=read(e);for(const part of ['[x] Tarea completada','[ ] Tarea pendiente','[^uno]: Nota conservada.','graph TD','A-->B','<!-- Comentario privado conservado -->','<details>','**Contenido HTML**','<u>subrayado</u>','resaltado','![Plano](assets/plano.png "Título imagen")','"ratio":0.6','Final. Añadido.'])expect(output).toContain(part);reparse(e,output);expect(read(e)).toBe(output);});
});
it("real clipboard preserves metadata as data and undo restores the previous document",async()=>{
 await fixture('---\ntitle: Privado\n---\n\nFinal.\n',e=>{const initial=doc(e);const raw=protectedSources(e)[0];e.action(ctx=>{const v=ctx.get(editorViewCtx);const element=DOMSerializer.fromSchema(v.state.schema).serializeNode(v.state.doc.child(0)) as HTMLElement;expect(element.querySelector('summary')?.textContent).toBe('Metadatos YAML conservados');expect(element.querySelector('script')).toBeNull();v.dispatch(v.state.tr.setSelection(TextSelection.atEnd(v.state.doc)));expect(v.pasteHTML(element.outerHTML,new Event('paste') as ClipboardEvent)).toBe(true);});expect(protectedSources(e)).toEqual([raw,raw]);e.action(ctx=>{const v=ctx.get(editorViewCtx);expect(undo(v.state,v.dispatch)).toBe(true);});expect(doc(e).eq(initial)).toBe(true);});
});
it("find and replace skips protected metadata and keeps table formatting, links and one undo",async()=>{
 await fixture('---\ntitle: Entrega\n---\n\n| Dato | Estado |\n| --- | --- |\n| **Entrega** | [Entrega](docs/a.md "Destino") |\n\nFinal.\n',e=>{const initial=doc(e);const c=createMarkdownEditorController(e);expect(c.findText?.('Entrega')).toHaveLength(2);expect(c.replaceText?.('Entrega','Revisión',true)).toBe(2);const output=read(e);expect(output).toContain('title: Entrega');expect(output).toContain('**Revisión**');expect(output).toContain('[Revisión](docs/a.md "Destino")');e.action(ctx=>{const v=ctx.get(editorViewCtx);expect(undo(v.state,v.dispatch)).toBe(true);});expect(doc(e).eq(initial)).toBe(true);});
});
it("opening, selection and normalization publish nothing; undo to the base restores exact source",()=>{
 const schema=new Schema({nodes:{doc:{content:'paragraph+'},paragraph:{content:'text*'},text:{}}});const initial=schema.node('doc',null,[schema.node('paragraph',null,[schema.text('Original')])]);const changed=schema.node('doc',null,[schema.node('paragraph',null,[schema.text('Original añadido')])]);const original={markdown:'Original  \r\n',document:initial};
 expect(documentPublication(original,original,initial,'Original\n')).toBeNull();const publication=documentPublication(original,original,changed,'Original añadido\n')!;expect(publication.markdown).toBe('Original añadido\n');expect(documentPublication(original,publication,initial,'Original\n')?.markdown).toBe(original.markdown);
});
it("metadata source never becomes executable DOM",async()=>{
 await fixture('---\ntitle: "<script>window.privateMarker=true</script>"\n---\n\nFinal.\n',e=>{e.action(ctx=>{const v=ctx.get(editorViewCtx);const dom=DOMSerializer.fromSchema(v.state.schema).serializeNode(v.state.doc.child(0)) as HTMLElement;expect(dom.querySelector('script')).toBeNull();expect(dom.querySelector('code')?.textContent).toContain('<script>');});});
});

function pasteEvent(html:string,text:string){const event=new Event('paste',{bubbles:true,cancelable:true}) as ClipboardEvent;Object.defineProperty(event,'clipboardData',{value:{getData:(type:string)=>type==='text/html'?html:text}});return event;}
it("detects unsupported rich structure without interpreting source attributes as HTML",()=>{
 expect(incompatibleClipboardHtml('<table><tr><td colspan="2">Dato</td></tr></table>')).toContain('celdas fusionadas');
 expect(incompatibleClipboardHtml('<svg><text>Dato</text></svg>')).toContain('no se puede representar');
 expect(incompatibleClipboardHtml('<table><tr><td colspan="1"><strong>Dato</strong></td></tr></table>')).toBeNull();
 expect(incompatibleClipboardHtml('<p title="<svg>">Texto</p><!-- <svg> -->')).toBeNull();
 expect(incompatibleClipboardHtml('<p>&lt;math&gt; ejemplo</p>')).toBeNull();
 expect(incompatibleClipboardHtml('<span title="'+' '.repeat(100000))).toContain('incompleto');
});
it("blocks incompatible clipboard before parsing, offers anchored plain text and a single undo",async()=>{
 let notice:DocumentPasteNotice|null=null;
 await fixture('Original.\n',e=>{const v=e.action(c=>c.get(editorViewCtx));const initial=v.state.doc;const event=pasteEvent('<table><tr><td colspan="2">Dato</td></tr></table>','Dato literal **sin formato**');v.dom.dispatchEvent(event);expect(event.defaultPrevented).toBe(true);expect(v.state.doc.eq(initial)).toBe(true);expect(notice).not.toBeNull();const captured=notice!;expect(insertClipboardPlainText(v,captured)).toBe(true);expect(v.state.doc.textContent).toContain('Dato literal **sin formato**');expect(undo(v.state,v.dispatch)).toBe(true);expect(v.state.doc.eq(initial)).toBe(true);
 v.dom.dispatchEvent(pasteEvent('<math><mi>x</mi></math>','x'));const stale=notice!;v.dispatch(v.state.tr.insertText('Cambio ',1));const after=v.state.doc;expect(insertClipboardPlainText(v,stale)).toBe(false);expect(v.state.doc.eq(after)).toBe(true);
 },next=>{notice=next;});
});
it("normal rich table clipboard retains cells, links and marks and can be undone once",async()=>{
 await fixture('Original.\n',e=>{const v=e.action(c=>c.get(editorViewCtx));const initial=v.state.doc;v.dispatch(v.state.tr.setSelection(TextSelection.atEnd(v.state.doc)));expect(v.pasteHTML('<table><tr><th>Campo</th><th>Valor</th></tr><tr><td><strong>Dato</strong></td><td><a href="https://example.invalid" title="Fuente">Enlace</a></td></tr></table>',pasteEvent('<table><tr><td>Dato</td></tr></table>','Dato'))).toBe(true);const output=read(e);expect(output).toContain('**Dato**');expect(output).toContain('[Enlace](https://example.invalid "Fuente")');expect(output).toContain('Campo');expect(undo(v.state,v.dispatch)).toBe(true);expect(v.state.doc.eq(initial)).toBe(true);});
});

it("captures the actual programmatic editor result before a delayed publication and undo returns exact source",async()=>{
 const source='---\ntitle: Original\n---\n\nTexto   original.\n';
 await fixture(source,e=>{const published={markdown:source,document:doc(e)};const c=createMarkdownEditorController(e,undefined,undefined,()=>published);expect(c.getMarkdownSnapshot()).toBe(source);expect(c.replaceMarkdown('---\ntitle: Original\n---\n\nTexto cambiado por la operación.\n')).toBe(true);expect(c.matchesMarkdown(source)).toBe(false);const captured=c.getMarkdownSnapshot();expect(captured).toBe(read(e));expect(captured).toContain('Texto cambiado por la operación.');expect(captured).toContain('title: Original');e.action(ctx=>{const v=ctx.get(editorViewCtx);expect(undo(v.state,v.dispatch)).toBe(true);});expect(c.getMarkdownSnapshot()).toBe(source);});
});
