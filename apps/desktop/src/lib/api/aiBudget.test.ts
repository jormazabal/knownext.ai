import {afterEach,expect,it,vi} from "vitest";
const{requestJson}=vi.hoisted(()=>({requestJson:vi.fn()}));
vi.mock("./client",()=>({requestJson,requestFormData:vi.fn()}));
vi.mock("../runtime/platform",()=>({isTauriRuntime:()=>true}));
import {sendAiInteraction} from "./ai";
import {AI_BUDGET_NOTICE_EVENT} from "./aiBudget";
import type {AiInteractionRequest} from "../../types/domain";
afterEach(()=>vi.resetAllMocks());
const status={schemaVersion:1,month:new Date().toISOString().slice(0,7),projectId:"owned",revision:"owned",basis:"local-recorded-estimates",exchangeRateAvailable:true,checks:[{projectId:"owned",month:"2026-11",recordedEur:10,limitEur:10,mode:"stop-new",state:"reached",unpricedEntries:0,blocked:true}]};
it("shows the local limit before an interaction and never dispatches a blocked send",async()=>{
  requestJson.mockResolvedValue(status);const notices:string[]=[];const handler=(event:Event)=>notices.push((event as CustomEvent<string>).detail);window.addEventListener(AI_BUDGET_NOTICE_EVENT,handler);
  try{await expect(sendAiInteraction({projectId:"owned",prompt:"Owned request"} as AiInteractionRequest)).rejects.toThrow("Se detienen nuevos envíos");expect(requestJson).toHaveBeenCalledTimes(1);expect(requestJson.mock.calls[0][0]).toContain("/api/ai/usage/budget?");expect(notices).toHaveLength(1);}finally{window.removeEventListener(AI_BUDGET_NOTICE_EVENT,handler);}
});
it("warning mode displays the notice and preserves the original request",async()=>{
  requestJson.mockResolvedValueOnce({...status,checks:[{...status.checks[0],blocked:false,mode:"notice"}]}).mockResolvedValueOnce({status:"completed"});
  const request={projectId:"owned",prompt:"Owned request"} as AiInteractionRequest;
  await expect(sendAiInteraction(request)).resolves.toEqual({status:"completed"});expect(requestJson).toHaveBeenCalledTimes(2);expect(requestJson.mock.calls[1][1].body).toBe(JSON.stringify(request));
});
