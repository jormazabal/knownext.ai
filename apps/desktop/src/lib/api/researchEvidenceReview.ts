import {requestJson} from "./client";
import type {AppliedResearchEvidenceReview,PreparedResearchEvidenceReview,ResearchEvidencePrepareInput,ResearchEvidenceReceipt,ResearchEvidenceReview,ResearchEvidenceSelection} from "../../types/researchEvidenceReview";
import type {LocalReferenceTarget} from "../../types/documentReferences";
export type {AppliedResearchEvidenceReview,PreparedResearchEvidenceReview,ResearchEvidencePrepareInput,ResearchEvidenceReview,ResearchEvidenceSelection} from "../../types/researchEvidenceReview";
const base=(projectId:string,jobId:string)=>`/api/projects/${encodeURIComponent(projectId)}/research-evidence/${encodeURIComponent(jobId)}`;
const encoder=new TextEncoder();
const failure=()=>new Error("El contraste local no confirma el trabajo y la revisión elegidos. Consulta el estado sin repetir cambios.");
function requireValue(value:unknown):asserts value{if(!value)throw failure();}
function object(value:unknown){return !!value&&typeof value==="object"&&!Array.isArray(value);}
function hash(value:unknown):value is string{return typeof value==="string"&&/^[a-f0-9]{64}$/.test(value);}
function text(value:unknown):value is string{return typeof value==="string";}
function nullableText(value:unknown){return value===null||text(value);}
function count(value:unknown):value is number{return typeof value==="number"&&Number.isSafeInteger(value)&&value>=0;}
function stamp(value:unknown){return text(value)&&Number.isFinite(Date.parse(value));}
function ids(value:unknown,max:number,kind?:"claim"|"source"|"evidence"):value is string[]{return Array.isArray(value)&&value.length<=max&&value.every(v=>text(v)&&v.length>0&&v.length<=160&&(!kind||new RegExp(`^${kind}-[1-9][0-9]*$`).test(v)))&&new Set(value).size===value.length;}
function strings(value:unknown,max:number):value is string[]{return Array.isArray(value)&&value.length<=max&&value.every(text);}
function attempt(value:unknown):value is string{return text(value)&&/^research-review-[a-zA-Z0-9_-]{1,184}$/.test(value);}
function selection(value:unknown):asserts value is ResearchEvidenceSelection{const v=value as ResearchEvidenceSelection;requireValue(object(v)&&ids(v.selectedClaimIds,500,"claim")&&ids(v.excludedSourceIds,128,"source")&&text(v.comment)&&!v.comment.includes("\0")&&encoder.encode(v.comment).length<=4096);}
function receipt(value:unknown):asserts value is ResearchEvidenceReceipt{const v=value as ResearchEvidenceReceipt;requireValue(object(v)&&attempt(v.attemptId)&&stamp(v.createdAt)&&hash(v.sourceRevision)&&hash(v.selectionRevision)&&v.phase==="applied");}
function localTarget(value:LocalReferenceTarget|null,projectId:string){if(value===null)return true;if(!object(value)||value.projectId!==projectId||!text(value.path)||value.id!==projectId+"::"+value.path||!text(value.name)||!["document","handwritten-note","image","reference-document","attachment","folder"].includes(value.kind)||!["available","missing","blocked"].includes(value.status))return false;if(value.status!=="available")return true;const path=value.path.replace(/\\/g,"/");return !path.startsWith("/")&&!path.includes(":")&&!path.includes("\0")&&!path.split("/").includes("..");}
function sameIds(a:string[],b:string[]){return a.length===b.length&&a.every(id=>b.includes(id));}
function sameSelection(a:ResearchEvidenceSelection,b:ResearchEvidenceSelection){return a.comment===b.comment&&sameIds(a.selectedClaimIds,b.selectedClaimIds)&&sameIds(a.excludedSourceIds,b.excludedSourceIds);}
/** Validate scope and relationships; local evidence linkage is never a factual certificate. */
function checked(value:unknown,projectId:string,jobId:string,readOnly:boolean):ResearchEvidenceReview{
 const v=value as ResearchEvidenceReview;
 requireValue(object(v)&&v.schemaVersion===1&&v.projectId===projectId&&v.jobId===jobId&&hash(v.revision)&&hash(v.sourceRevision)&&stamp(v.checkedAt)&&v.readOnly===readOnly&&v.startsProvider===false&&Array.isArray(v.sources)&&v.sources.length<=128&&Array.isArray(v.claims)&&v.claims.length<=500&&Array.isArray(v.evidence)&&v.evidence.length<=1000&&strings(v.warnings,8192)&&Array.isArray(v.receipts)&&v.receipts.length<=16);
 selection(v.selection);
 requireValue(v.sources.every(s=>object(s)&&ids([s.id],1,"source")&&nullableText(s.originalId)&&text(s.title)&&nullableText(s.url)&&(!s.url||(()=>{try{return ["http:","https:"].includes(new URL(s.url!).protocol);}catch{return false;}})())&&localTarget(s.localTarget,projectId)&&text(s.kind)&&nullableText(s.publishedAt)&&nullableText(s.consultedAt)&&text(s.excerpt)&&text(s.status)&&typeof s.excluded==="boolean"&&typeof s.ambiguous==="boolean"));
 const sourceIds=new Set(v.sources.map(s=>s.id));requireValue(sourceIds.size===v.sources.length);
 requireValue(v.evidence.every(e=>object(e)&&ids([e.id],1,"evidence")&&nullableText(e.originalId)&&nullableText(e.sourceId)&&(!e.sourceId||sourceIds.has(e.sourceId))&&nullableText(e.originalSourceId)&&text(e.claim)&&text(e.excerpt)&&nullableText(e.consultedAt)&&["match","not-found","unavailable","not-provided"].includes(e.excerptMatch)&&typeof e.usable==="boolean"&&typeof e.ambiguous==="boolean"&&(!e.usable||!!e.sourceId&&e.excerptMatch==="match"&&!e.ambiguous)));
 const evidenceIds=new Set(v.evidence.map(e=>e.id));requireValue(evidenceIds.size===v.evidence.length);
 requireValue(v.claims.every(c=>object(c)&&ids([c.id],1,"claim")&&nullableText(c.originalId)&&text(c.title)&&text(c.summary)&&ids(c.evidenceIds,1000,"evidence")&&c.evidenceIds.every(id=>evidenceIds.has(id))&&strings(c.unknownEvidenceIds,1000)&&ids(c.sourceIds,128,"source")&&c.sourceIds.every(id=>sourceIds.has(id))&&strings(c.unknownSourceIds,1000)&&ids(c.excludedSourceIds,128,"source")&&c.excludedSourceIds.every(id=>sourceIds.has(id))&&text(c.comment)&&encoder.encode(c.comment).length<=4096&&["backed","partially-backed","unbacked","excluded"].includes(c.state)&&count(c.supportCount)&&c.supportCount<=c.evidenceIds.length&&count(c.unknownReferenceCount)));
 const claimIds=new Set(v.claims.map(c=>c.id));requireValue(claimIds.size===v.claims.length&&v.selection.selectedClaimIds.every(id=>claimIds.has(id))&&v.selection.excludedSourceIds.every(id=>sourceIds.has(id)));
 requireValue(object(v.coverage)&&["claims","backedClaims","partiallyBackedClaims","unbackedClaims","excludedClaims","sources","includedSources","evidence","usableEvidence","unknownReferences"].every(key=>count(v.coverage[key as keyof typeof v.coverage]))&&typeof v.coverage.coverageRatio==="number"&&Number.isFinite(v.coverage.coverageRatio)&&v.coverage.coverageRatio>=0&&v.coverage.coverageRatio<=1);
 requireValue(v.coverage.claims===v.claims.length&&v.coverage.sources===v.sources.length&&v.coverage.evidence===v.evidence.length);
 for(const item of v.receipts)receipt(item);requireValue(new Set(v.receipts.map(item=>item.attemptId)).size===v.receipts.length);
 if(v.reviewRevision!==undefined&&v.reviewRevision!==null)requireValue(hash(v.reviewRevision));
 if(v.receipt!==undefined&&v.receipt!==null){receipt(v.receipt);requireValue(v.receipts.some(item=>item.attemptId===v.receipt!.attemptId&&item.sourceRevision===v.receipt!.sourceRevision&&item.selectionRevision===v.receipt!.selectionRevision));}
 const pieces=[...v.warnings,v.selection.comment,...v.sources.flatMap(s=>[s.title,s.excerpt,s.originalId??""]),...v.evidence.flatMap(e=>[e.claim,e.excerpt,e.originalId??"",e.originalSourceId??""]),...v.claims.flatMap(c=>[c.title,c.summary,c.comment,...c.unknownEvidenceIds,...c.unknownSourceIds])];let bytes=0;for(const piece of pieces){bytes+=encoder.encode(piece).length;requireValue(bytes<=2*1024*1024);}
 return v;
}
export async function getResearchEvidenceReview(projectId:string,jobId:string):Promise<ResearchEvidenceReview>{return checked(await requestJson(base(projectId,jobId)),projectId,jobId,true);}
export async function prepareResearchEvidenceReview(projectId:string,jobId:string,input:ResearchEvidencePrepareInput):Promise<PreparedResearchEvidenceReview>{
 requireValue(hash(input.revision));selection(input.selection);
 const intent={revision:input.revision,selection:{selectedClaimIds:[...input.selection.selectedClaimIds],excludedSourceIds:[...input.selection.excludedSourceIds],comment:input.selection.comment}};
 const result=checked(await requestJson(base(projectId,jobId)+"/prepare",{method:"POST",body:JSON.stringify(intent)}),projectId,jobId,true);
 requireValue(result.revision===intent.revision&&hash(result.reviewRevision)&&sameSelection(result.selection,intent.selection));return result as PreparedResearchEvidenceReview;
}
export async function applyResearchEvidenceReview(projectId:string,jobId:string,prepared:PreparedResearchEvidenceReview,attemptId:string):Promise<AppliedResearchEvidenceReview>{
 checked(prepared,projectId,jobId,true);requireValue(hash(prepared.reviewRevision)&&attempt(attemptId));
 const intent={revision:prepared.revision,reviewRevision:prepared.reviewRevision,selection:{selectedClaimIds:[...prepared.selection.selectedClaimIds],excludedSourceIds:[...prepared.selection.excludedSourceIds],comment:prepared.selection.comment},attemptId,acknowledge:true};
 const result=checked(await requestJson(base(projectId,jobId)+"/apply",{method:"POST",body:JSON.stringify(intent)}),projectId,jobId,false);
 requireValue(result.sourceRevision===prepared.sourceRevision&&result.revision!==prepared.revision&&sameSelection(result.selection,intent.selection)&&result.receipt?.attemptId===attemptId&&result.receipt.sourceRevision===prepared.sourceRevision&&result.receipt.selectionRevision===prepared.reviewRevision);return result as AppliedResearchEvidenceReview;
}
