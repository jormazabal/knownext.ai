import {requestJson} from "./client";
import type {AiDataPolicy} from "../../types/aiDataPolicy";

export async function getAiDataPolicy():Promise<AiDataPolicy>{
  const value=await requestJson<AiDataPolicy>("/api/ai/data-policy");
  if(value?.schemaVersion!==1||value.id!=="ai-data-policy-v1"||typeof value.checkedAt!=="string"
    ||value.transmission!=="request-and-prepared-context"||value.conversation?.includesUserPrompts!==true
    ||!Number.isSafeInteger(value.conversation.maximumEvents)||value.conversation.maximumEvents<1
    ||value.conversation.automaticExpiry!==false||value.contextSources?.storedLocally!==true||value.contextSources.automaticExpiry!==false
    ||value.reviewResults?.storedLocally!==true||value.reviewResults.requestEnvelopeStored!==false||value.reviewResults.automaticExpiry!==false
    ||value.index?.savedContentCopy!==true||value.index.providerUse!=="retrieved-fragments"
    ||value.deletion?.categoriesAreSeparate!==true||value.deletion.providerRetentionVerified!==false||value.deletion.localDeletionRemovesRemoteCopies!==false){
    throw new Error("No se puede verificar la política de datos de esta versión.");
  }
  return value;
}
