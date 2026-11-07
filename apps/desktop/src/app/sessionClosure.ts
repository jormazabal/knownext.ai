import type {SessionWriteQueue} from "./sessionWriteQueue";

/** An explicit discard must be ordered after draft writes and retain a newer edit. */
export async function discardSessionForClose<T>({id,queue,pending,current,sameRevision,discard,close,protect}:{
  id:string;queue:SessionWriteQueue;pending:Set<string>;current:()=>T|undefined;
  sameRevision:(current:T|undefined,expected:T)=>boolean;
  discard:()=>Promise<void>;close:()=>void;protect:(current:T)=>void;
}):Promise<boolean>{
  if(pending.has(id))return false;
  const expected=current();if(!expected)return false;
  pending.add(id);let closed=false;
  try{
    return await queue.run(id,async()=>{
      if(!sameRevision(current(),expected))throw new Error("El borrador cambió antes de descartarlo. Se conserva abierto para revisarlo.");
      await discard();
      if(!sameRevision(current(),expected))throw new Error("Hay una edición más reciente. Se conserva abierta y protegida; no se ha cerrado la pestaña.");
      close();closed=true;return true;
    });
  }finally{
    pending.delete(id);
    const latest=current();if(!closed&&latest)protect(latest);
  }
}
