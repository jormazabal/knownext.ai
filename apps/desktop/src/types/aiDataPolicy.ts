export type AiDataPolicy = {
  schemaVersion: 1;
  id: "ai-data-policy-v1";
  checkedAt: string;
  transmission: "request-and-prepared-context";
  conversation: {includesUserPrompts:true;maximumEvents:number;automaticExpiry:false};
  contextSources: {storedLocally:true;automaticExpiry:false};
  reviewResults: {storedLocally:true;requestEnvelopeStored:false;automaticExpiry:false};
  index: {savedContentCopy:true;providerUse:"retrieved-fragments"};
  deletion: {categoriesAreSeparate:true;providerRetentionVerified:false;localDeletionRemovesRemoteCopies:false};
};
