import {createLocalEditId,preserveLocalEdit,reviewLocalEdit,type LocalEditSnapshot,type LocalEditProof} from "../lib/api/recovery";
type Verified=Extract<LocalEditProof,{status:"verified"}>;
type Attempt={id:string;signature:string;payload:LocalEditSnapshot;task?:Promise<Verified>};
/** A lost acknowledgement is observed by its known ID, never resubmitted automatically. */
export class LocalEditProtection {
  private attempts=new Map<string,Attempt>();
  constructor(private api={createId:createLocalEditId,preserve:preserveLocalEdit,review:reviewLocalEdit}){}
  protect(payload:LocalEditSnapshot):Promise<Verified>{
    const signature=JSON.stringify(payload);let attempt=this.attempts.get(payload.documentId);
    if(attempt?.signature===signature&&attempt.task)return attempt.task;
    const first=attempt?.signature!==signature;
    if(first){attempt={id:this.api.createId(),signature,payload:structuredClone(payload)};this.attempts.set(payload.documentId,attempt);}
    const owned=attempt!;
    owned.task=(async()=>{
      let proof:LocalEditProof;
      if(first){try{proof=await this.api.preserve(owned.id,owned.payload);}catch{proof=await this.api.review(owned.id,owned.payload);}}
      else proof=await this.api.review(owned.id,owned.payload);
      if(proof.status!=="verified"||proof.copy.key!==owned.id||proof.copy.documentId!==payload.documentId||!proof.copy.fingerprint)throw new Error("No se confirmó la copia de esta edición. Se mantiene abierta. Consulta Recuperación antes de cerrar o cambiar de estado.");
      return proof;
    })().finally(()=>{owned.task=undefined;});
    return owned.task;
  }
}
