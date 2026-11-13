import { parserCtx } from "@milkdown/kit/core";
import type { Ctx } from "@milkdown/kit/ctx";
import { imageBlockConfig } from "@milkdown/kit/component/image-block";
import { inlineImageConfig } from "@milkdown/kit/component/image-inline";
import { uploadConfig } from "@milkdown/kit/plugin/upload";
import type { Node } from "@milkdown/kit/prose/model";

/** Only a confirmed project import can supply an image to the editor. */
export function configurePersistentImageUploads(ctx: Ctx, importImage: (file: File) => Promise<string>, onError: (message: string | null) => void) {
  const prepare = async (file: File) => {
    onError(null);
    const markdown = await importImage(file);
    return ctx.get(parserCtx)(markdown);
  };
  const report = (error: unknown) => onError(error instanceof Error ? error.message : "No se pudo guardar la imagen en el proyecto.");
  const onUpload = async (file: File) => {
    try {
      const document = await prepare(file);
      let source = "";
      document.descendants(node => { if ((node.type.name === "image-block" || node.type.name === "image") && !source) source = node.attrs.src; });
      if (!source) throw new Error("No se pudo preparar la referencia de la imagen guardada.");
      return source;
    } catch (error) { report(error); throw error; }
  };
  ctx.update(imageBlockConfig.key, config => ({ ...config, onUpload }));
  ctx.update(inlineImageConfig.key, config => ({ ...config, onUpload }));
  ctx.update(uploadConfig.key, config => ({ ...config, enableHtmlFileUploader: true, uploader: async files => {
    const nodes: Node[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      try { (await prepare(file)).forEach(node => nodes.push(node)); }
      catch (error) { report(error); break; }
    }
    return nodes;
  } }));
}
