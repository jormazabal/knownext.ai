import { Editor, defaultValueCtx, editorViewCtx, rootCtx, serializerCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { imageBlockSchema, remarkImageBlockPlugin } from "@milkdown/kit/component/image-block";
import { expect, it } from "vitest";
import { configureImageFidelity, remarkImageFidelity } from "./imageFidelity";

it("preserves image ALT and title when editing a different paragraph through the real Milkdown schema",async()=>{
  const root=document.createElement('div');document.body.append(root);
  const editor=Editor.make().config(ctx=>{ctx.set(rootCtx,root);ctx.set(defaultValueCtx,'# Documento\n\n![Pixel descriptivo](assets/pixel.png "Título original")\n\nPárrafo de trabajo.\n');configureImageFidelity(ctx);}).use(commonmark).use(imageBlockSchema).use(remarkImageBlockPlugin).use(remarkImageFidelity);
  try {
    await editor.create();
    const result=editor.action(ctx=>{const view=ctx.get(editorViewCtx);view.dispatch(view.state.tr.insertText(' Texto añadido.',view.state.doc.content.size-1));return ctx.get(serializerCtx)(view.state.doc);});
    expect(result).toContain('![Pixel descriptivo](assets/pixel.png "Título original")');expect(result).toContain('Texto añadido.');
  } finally {await editor.destroy();root.remove();}
});
