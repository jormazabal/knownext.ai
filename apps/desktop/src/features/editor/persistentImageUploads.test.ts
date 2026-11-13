import { Editor, defaultValueCtx, editorViewCtx, parserCtx, rootCtx, schemaCtx, serializerCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { imageBlockConfig, imageBlockSchema, remarkImageBlockPlugin } from "@milkdown/kit/component/image-block";
import { inlineImageConfig } from "@milkdown/kit/component/image-inline";
import { upload, uploadConfig } from "@milkdown/kit/plugin/upload";
import { expect, it, vi } from "vitest";
import { configurePersistentImageUploads } from "./persistentImageUploads";

async function fixture(importImage:(file:File)=>Promise<string>,run:(editor:Editor,notice:ReturnType<typeof vi.fn>)=>Promise<void>){
  const root=document.createElement("div");document.body.append(root);const notice=vi.fn();
  const editor=Editor.make().config(ctx=>{ctx.set(rootCtx,root);ctx.set(defaultValueCtx,"Texto original.");configurePersistentImageUploads(ctx,importImage,notice);}).use(commonmark).use(imageBlockConfig).use(inlineImageConfig).use(imageBlockSchema).use(remarkImageBlockPlugin).use(upload);
  try{await editor.create();await run(editor,notice);}finally{await editor.destroy();root.remove();}
}
it("waits for persistent import before inserting portable Markdown and preserves it on reopening",async()=>{
  let resolve!:(value:string)=>void;
  const imported=vi.fn(()=>new Promise<string>(done=>{resolve=done;}));
  await fixture(imported,async editor=>{
    const pending=editor.action(ctx=>ctx.get(uploadConfig.key).uploader([new File(["png"],"Plano.png",{type:"image/png"})] as unknown as FileList,ctx.get(schemaCtx),ctx,1));
    expect(imported).toHaveBeenCalledOnce();
    expect(editor.action(ctx=>ctx.get(editorViewCtx).state.doc.textContent)).toBe("Texto original.");
    resolve('![Plano](../assets/Plano.png)');const nodes=await pending;
    editor.action(ctx=>{
      const view=ctx.get(editorViewCtx);view.dispatch(view.state.tr.insert(0,nodes));
      const markdown=ctx.get(serializerCtx)(view.state.doc);expect(markdown).toContain('../assets/Plano.png');expect(markdown).not.toContain('blob:');
      const reopened=ctx.get(parserCtx)(markdown);let source="";reopened.descendants(node=>{if(node.type.name==="image-block")source=node.attrs.src;});expect(source).toBe('../assets/Plano.png');
    });
  });
});
it("reports import failures, inserts nothing and never falls back to temporary blob URLs",async()=>{
  await fixture(async()=>{throw new Error("No se pudo importar");},async(editor,notice)=>{
    const nodes=await editor.action(ctx=>ctx.get(uploadConfig.key).uploader([new File(["png"],"Plano.png",{type:"image/png"})] as unknown as FileList,ctx.get(schemaCtx),ctx,1));
    expect(nodes).toEqual([]);expect(notice).toHaveBeenLastCalledWith("No se pudo importar");
  });
});
it("uses the same persistent import in both inline and block image controls",async()=>{
  await fixture(async()=> '![Plano](assets/Plano.png)',async editor=>{
    const file=new File(["png"],"Plano.png",{type:"image/png"});
    expect(await editor.action(ctx=>ctx.get(imageBlockConfig.key).onUpload(file))).toBe("assets/Plano.png");
    expect(await editor.action(ctx=>ctx.get(inlineImageConfig.key).onUpload(file))).toBe("assets/Plano.png");
  });
});
