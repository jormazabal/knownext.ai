import { Editor, defaultValueCtx, editorViewCtx, parserCtx, rootCtx, serializerCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { history } from "@milkdown/kit/plugin/history";
import { undo } from "@milkdown/kit/prose/history";
import { DOMSerializer } from "@milkdown/kit/prose/model";
import { TextSelection } from "@milkdown/kit/prose/state";
import { imageBlockSchema, remarkImageBlockPlugin } from "@milkdown/kit/component/image-block";
import { afterAll, beforeAll, expect, it } from "vitest";
import { configureImageFidelity, remarkImageFidelity } from "./imageFidelity";
import { createMarkdownEditorController } from "./editorCommands";
import { markdownImage } from "../../lib/markdownImage";

// jsdom supplies no layout. Geometry only is stubbed for real paste/history;
// schema, parsing, serialization, transactions and clipboard are not mocked.
const geometry: Array<[object,string,PropertyDescriptor|undefined]> = [];
beforeAll(()=>{
  for(const [owner,key,value] of [[Range.prototype,'getClientRects',()=>[new DOMRect(0,0,1,1)]],[Range.prototype,'getBoundingClientRect',()=>new DOMRect(0,0,1,1)],[Element.prototype,'scrollIntoView',()=>{}],[document,'elementFromPoint',()=>document.body]] as const){
    geometry.push([owner,key,Object.getOwnPropertyDescriptor(owner,key)]);Object.defineProperty(owner,key,{configurable:true,value});
  }
});
afterAll(()=>geometry.forEach(([owner,key,descriptor])=>{if(descriptor)Object.defineProperty(owner,key,descriptor);else Reflect.deleteProperty(owner,key);}));
async function withEditor(markdown:string,run:(editor:Editor)=>void|Promise<void>,pluginFirst=false){
  const root=document.createElement('div');document.body.append(root);
  const editor=Editor.make().config(ctx=>{ctx.set(rootCtx,root);ctx.set(defaultValueCtx,markdown);configureImageFidelity(ctx);}).use(commonmark).use(gfm).use(history).use(imageBlockSchema);
  if(pluginFirst)editor.use(remarkImageFidelity).use(remarkImageBlockPlugin);else editor.use(remarkImageBlockPlugin).use(remarkImageFidelity);
  try{await editor.create();await run(editor);}finally{await editor.destroy();root.remove();}
}
const serialize=(editor:Editor)=>editor.action(ctx=>ctx.get(serializerCtx)(ctx.get(editorViewCtx).state.doc));
const images=(editor:Editor)=>editor.action(ctx=>{const found:Array<{position:number;attrs:Record<string,unknown>}>=[];ctx.get(editorViewCtx).state.doc.descendants((node,position)=>{if(node.type.name==='image-block'||node.type.name==='image')found.push({position,attrs:{...node.attrs}});});return found;});
const editText=(editor:Editor)=>editor.action(ctx=>{const view=ctx.get(editorViewCtx);view.dispatch(view.state.tr.insertText(' Texto añadido.',view.state.doc.content.size-1));});
const reparse=(editor:Editor,markdown:string)=>editor.action(ctx=>{const view=ctx.get(editorViewCtx);view.dispatch(view.state.tr.replaceWith(0,view.state.doc.content.size,ctx.get(parserCtx)(markdown).content));});

it("keeps ordinary and legacy numeric syntax unchanged until sizing needs explicit metadata",async()=>{
  for(const [alt,width] of [['Pixel',1],['',1],['0.50',.5],['2.00',2]] as const){
    const markdown=`![${alt}](assets/pixel.png "Título")\n`;
    await withEditor(markdown,editor=>{expect(serialize(editor)).toBe(markdown);expect(images(editor)[0].attrs).toMatchObject({alt,caption:'Título',ratio:width});});
  }
});
it("keeps independent widths and descriptions for repeated URLs through resize, reset and reopen",async()=>{
  const markdown='![Primera](assets/pixel.png?q=1#x "Uno")\n\n<!-- knownext-image: {"version":1,"ratio":0.6} -->\n\n![Segunda](assets/pixel.png?q=1#x "Dos")\n\n<!-- knownext-image: {"version":1,"ratio":0.8} -->\n\nFinal.\n';
  await withEditor(markdown,editor=>{
    expect(images(editor).map(image=>image.attrs.ratio)).toEqual([.6,.8]);
    editor.action(ctx=>{const view=ctx.get(editorViewCtx);const image=images(editor)[0];view.dispatch(view.state.tr.setNodeMarkup(image.position,undefined,{...image.attrs,ratio:1,knownextSizingExplicit:true}));});
    const result=serialize(editor);reparse(editor,result);expect(images(editor).map(image=>({alt:image.attrs.alt,title:image.attrs.caption,ratio:image.attrs.ratio,src:image.attrs.src}))).toEqual([{alt:'Primera',title:'Uno',ratio:1,src:'assets/pixel.png?q=1#x'},{alt:'Segunda',title:'Dos',ratio:.8,src:'assets/pixel.png?q=1#x'}]);
  });
});
it("preserves opaque future/malformed sizing without shadowing it with a new version",async()=>{
  for(const annotation of ['<!-- knownext-image: {"version":2,"ratio":0.6,"future":"preserve"} -->','<!-- knownext-image: not JSON -->','<!-- knownext-image: {"version":1,"ratio":0.6,"extra":true} -->','<!-- knownext-image: {"version":1,"ratio":999} -->']){
    await withEditor(`![Pixel](assets/p.png "Título")\n\n${annotation}\n\nFinal.\n`,editor=>{expect(images(editor)[0].attrs.knownextSizingReadOnly).toBe(true);editText(editor);const result=serialize(editor);expect(result).toContain(annotation);expect(result.match(/knownext-image:/g)).toHaveLength(1);reparse(editor,result);expect(images(editor)[0].attrs.alt).toBe('Pixel');expect(serialize(editor)).toContain(annotation);});
  }
});
it("preserves unrelated and oversized comments without parsing or deleting their contents",async()=>{
  for(const annotation of ['<!-- personal: conservar exactamente -->',`<!-- knownext-image: ${'x'.repeat(1100)} -->`]){
    await withEditor(`![Pixel](assets/p.png)\n\n${annotation}\n\nFinal.\n`,editor=>{editText(editor);const result=serialize(editor);expect(result).toContain(annotation);expect(result).toContain('![Pixel](assets/p.png)');});
  }
});
it("preserves attributes and sizing through the real DOM clipboard parser and undo",async()=>{
  await withEditor('![Pixel \\[A\\]](assets/p.png "Título original")\n\n<!-- knownext-image: {"version":1,"ratio":0.4} -->\n\nFinal.\n',editor=>{
    const initial=serialize(editor);const first=images(editor)[0];
    editor.action(ctx=>{const view=ctx.get(editorViewCtx);const image=view.state.doc.nodeAt(first.position)!;const dom=DOMSerializer.fromSchema(view.state.schema).serializeNode(image) as HTMLElement;expect(dom.getAttribute('alt')).toBe('Pixel [A]');view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));expect(view.pasteHTML(dom.outerHTML,new Event('paste') as ClipboardEvent)).toBe(true);});
    expect(images(editor).map(image=>({alt:image.attrs.alt,title:image.attrs.caption,ratio:image.attrs.ratio}))).toEqual([{alt:'Pixel [A]',title:'Título original',ratio:.4},{alt:'Pixel [A]',title:'Título original',ratio:.4}]);
    editor.action(ctx=>{const view=ctx.get(editorViewCtx);expect(undo(view.state,view.dispatch)).toBe(true);});expect(serialize(editor)).toBe(initial);
  });
});
it("editing one image title/ALT keeps its width and another occurrence unchanged",async()=>{
  await withEditor('![Una](assets/p.png "Título uno")\n\n<!-- knownext-image: {"version":1,"ratio":0.5} -->\n\n![Otra](assets/p.png "Título dos")\n\nFinal.\n',editor=>{
    const initial=images(editor);expect(createMarkdownEditorController(editor).replaceImageAt(initial[0].position,'![Nueva](assets/q.png "Título nuevo")')).toBe(true);
    expect(images(editor)[0].attrs).toMatchObject({alt:'Nueva',caption:'Título nuevo',src:'assets/q.png',ratio:.5});expect(images(editor)[1].attrs).toEqual(initial[1].attrs);
    const result=serialize(editor);reparse(editor,result);expect(images(editor)[0].attrs).toMatchObject({alt:'Nueva',caption:'Título nuevo',ratio:.5});
  });
});
it("metadata replacement keeps unknown sizing verbatim",async()=>{
  const future='<!-- knownext-image: {"version":2,"future":"precious"} -->';
  await withEditor(`![Antes](assets/p.png)\n\n${future}\n`,editor=>{expect(createMarkdownEditorController(editor).replaceImageAt(images(editor)[0].position,'![Después](assets/p.png "Título")')).toBe(true);expect(serialize(editor)).toContain(future);expect(images(editor)[0].attrs.knownextSizingReadOnly).toBe(true);});
});
it("description-only editing retains the caption and literal Markdown punctuation",async()=>{
  await withEditor('![Antes](assets/p.png "Título conservado")\n\n<!-- knownext-image: {"version":1,"ratio":0.5} -->\n',editor=>{
    const description='Plano [A] *literal* &amp; <equipo> `v2`';
    const source='https://example.com/image (1).png?literal=&amp;#detalle';
    expect(createMarkdownEditorController(editor).replaceImageAt(images(editor)[0].position,markdownImage(description,source))).toBe(true);
    expect(images(editor)[0].attrs).toMatchObject({alt:description,caption:'Título conservado',ratio:.5,src:source.replace(/ /g,'%20')});
    reparse(editor,serialize(editor));expect(images(editor)[0].attrs).toMatchObject({alt:description,caption:'Título conservado',ratio:.5});
  });
});
it("reads formal sizing independently of plugin registration order",async()=>{
  await withEditor('![Pixel](assets/p.png)\n\n<!-- knownext-image: {"version":1,"ratio":0.6} -->\n',editor=>{expect(images(editor)[0].attrs).toMatchObject({alt:'Pixel',ratio:.6});expect(serialize(editor)).toContain('"ratio":0.6');},true);
});
it("preserves descriptions in inline images, tables and list items",async()=>{
  await withEditor('Texto ![En línea](assets/i.png "Inline") final.\n\n| Imagen | Valor |\n| --- | --- |\n| ![En tabla](assets/t.png "Tabla") | Dato |\n\n- ![En lista](assets/l.png "Lista")\n\nFinal.\n',editor=>{editText(editor);const result=serialize(editor);reparse(editor,result);expect(images(editor).map(image=>image.attrs.alt)).toEqual(['En línea','En tabla','En lista']);expect(result).toContain('Dato');expect(result).toContain('Texto añadido.');});
});
