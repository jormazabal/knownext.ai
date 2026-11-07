import type {DocumentSession} from "./documentSessions";
import type {HandwrittenNoteSession} from "./handwrittenSessions";
import {ApiError} from "../lib/api/client";

export function isDraftWriteConflict(error:unknown){
  return error instanceof ApiError && (error.code==="draft_write_conflict"||error.code==="draft_state_unavailable");
}
/** An owned acknowledgement advances the private revision even if typing continued. */
export function acknowledgeDraftWrite<S extends DocumentSession|HandwrittenNoteSession>(current:S|undefined,submitted:S,revision:string|null|undefined):S|undefined{
  if(!current||revision===undefined||current.loadVersion!==submitted.loadVersion||current.baseFingerprint?.sha256!==submitted.baseFingerprint?.sha256)return current;
  if("markdown" in current&&"markdown" in submitted){if(current.document?.id!==submitted.document?.id||current.savedMarkdown!==submitted.savedMarkdown)return current;}
  else if("content" in current&&"content" in submitted){if(current.note?.id!==submitted.note?.id||current.savedContent!==submitted.savedContent)return current;}
  else return current;
  return {...current,draftWriteRevision:revision,draftWriteConflict:false};
}
