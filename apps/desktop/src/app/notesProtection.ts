import {SessionWriteQueue} from "./sessionWriteQueue";
import {NOTES_WORKSPACE_TAB_ID} from "./notesState";
import type {UserNotes} from "../types/domain";
import type {ProtectionOutcome} from "./workspaceContinuity";

export function protectNotesSnapshot(expected:string,options:{queue:SessionWriteQueue;current:()=>string|undefined;saved:()=>string;write:(markdown:string)=>Promise<UserNotes>;started:()=>void;acknowledge:(saved:UserNotes)=>void;failed:(error:unknown)=>void}):Promise<ProtectionOutcome>{
  return options.queue.run<ProtectionOutcome>(NOTES_WORKSPACE_TAB_ID,async()=>{
    if(options.current()!==expected)return "superseded";
    if(options.saved()===expected)return "protected";
    options.started();
    try{
      const saved=await options.write(expected);
      if(saved.markdown!==expected)throw new Error("El contenido confirmado no corresponde a las notas enviadas");
      options.acknowledge(saved);
      return options.current()===expected?"protected":"superseded";
    }catch(error){options.failed(error);return "failed";}
  });
}
