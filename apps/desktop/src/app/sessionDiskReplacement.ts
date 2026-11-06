import type {SessionWriteQueue} from "./sessionWriteQueue";

/** Own the document queue until the prepared disk snapshot is acknowledged.
 * A failed/uncertain acknowledgement keeps the current edit and protects it. */
export async function replaceSessionFromDisk<Session,Record>({id,queue,pending,current,sameRevision,readAndDiscard,apply,protect}:{
  id:string;queue:SessionWriteQueue;pending:Set<string>;current:()=>Session|undefined;
  sameRevision:(current:Session|undefined,expected:Session)=>boolean;
  readAndDiscard:()=>Promise<Record>;apply:(record:Record,expected:Session)=>void;
  protect:(current:Session)=>void;
}):Promise<boolean>{
  if(pending.has(id))return false;
  const expected=current();if(!expected)return false;
  pending.add(id);let applied=false;
  try{
    return await queue.run(id,async()=>{
      if(!sameRevision(current(),expected))throw new Error("El contenido ha cambiado. Revisa de nuevo la versión que quieres conservar.");
      const record=await readAndDiscard();
      if(!sameRevision(current(),expected))throw new Error("Hay una edición más reciente. Se conserva abierta y protegida; revisa de nuevo la versión de disco.");
      apply(record,expected);applied=true;return true;
    });
  }finally{
    pending.delete(id);
    const latest=current();if(!applied&&latest)protect(latest);
  }
}
