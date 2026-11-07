import type { MarkdownEditorController } from "../features/editor/editorTypes";

export function registerEditorSnapshot(
  readers: Map<string, MarkdownEditorController>, id: string,
  current: MarkdownEditorController | null, released?: MarkdownEditorController | null,
) {
  if (current) readers.set(id,current);
  else if (released && readers.get(id) === released) readers.delete(id);
}

/** Capture all live text before mutating navigation or removing an association.
 * Read every editor first so a disposed reader cannot cause a partial flush. */
export function captureProjectEditorSnapshots(
  projectId: string, readers: ReadonlyMap<string, MarkdownEditorController>,
  sessions: Record<string,{document:{projectId:string}|null;markdown:string}>,
) {
  const snapshots: Array<{documentId:string;markdown:string}> = [];
  for (const [id,reader] of readers) {
    const session=sessions[id];
    if (session?.document?.projectId !== projectId) continue;
    const markdown=reader.getMarkdownSnapshot();
    if (markdown !== session.markdown) snapshots.push({documentId:id,markdown});
  }
  return snapshots;
}

export function captureWorkspaceEditorSnapshots(readers:ReadonlyMap<string,MarkdownEditorController>,sessions:Record<string,{document:unknown;markdown:string}>,notes:{id:string;loaded:boolean;markdown:string}){
  const snapshots:Array<{documentId:string;markdown:string}>=[];
  for(const[id,reader]of readers){
    const current=sessions[id]?.document?sessions[id].markdown:id===notes.id&&notes.loaded?notes.markdown:undefined;
    if(current===undefined)continue;
    const markdown=reader.getMarkdownSnapshot();if(markdown!==current)snapshots.push({documentId:id,markdown});
  }
  return snapshots;
}
