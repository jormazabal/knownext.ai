import type {AiDataPolicy} from "../../types/aiDataPolicy";

/** Central development fixture; native installations read the Rust contract. */
export function webDevAiDataPolicy():AiDataPolicy{
  return {schemaVersion:1,id:"ai-data-policy-v1",checkedAt:new Date().toISOString(),transmission:"request-and-prepared-context",
    conversation:{includesUserPrompts:true,maximumEvents:2000,automaticExpiry:false},
    contextSources:{storedLocally:true,automaticExpiry:false},reviewResults:{storedLocally:true,requestEnvelopeStored:false,automaticExpiry:false},
    index:{savedContentCopy:true,providerUse:"retrieved-fragments"},deletion:{categoriesAreSeparate:true,providerRetentionVerified:false,localDeletionRemovesRemoteCopies:false}};
}
