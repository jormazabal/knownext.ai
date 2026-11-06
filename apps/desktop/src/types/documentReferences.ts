import type {DocumentFingerprint} from "./domain";

export type LocalReferenceTarget = {
  id:string; projectId:string; name:string; path:string;
  kind:"document"|"handwritten-note"|"image"|"reference-document"|"attachment"|"folder";
  status:"available"|"missing"|"blocked";
};
export type DocumentReference = {target:LocalReferenceTarget;line:number;column:number;rawTarget:string};
export type DocumentReferencesResponse = {
  documentId:string;projectId:string;sourcePath:string;scope:"saved-markdown";queriedAt:string;
  sourceFingerprint:DocumentFingerprint|null;sourceRead:boolean;outgoingSupported:boolean;
  outgoing:DocumentReference[];incoming:DocumentReference[];scannedDocuments:number;
  limited:boolean;complete:boolean;warnings:string[];
};
