const checkpoints=new Set<()=>void>();
export function registerPendingInputCheckpoint(checkpoint:()=>void){checkpoints.add(checkpoint);return()=>{checkpoints.delete(checkpoint);};}
/** Finalizes local gestures before asking controllers for their latest models. No I/O. */
export function checkpointPendingEditorInput(){for(const checkpoint of [...checkpoints])checkpoint();}
