import {useEffect,useRef,useState} from "react";
import {getAiUsageSummary} from "../../lib/api/ai";
import {getApiErrorMessage} from "../../lib/api/client";
import type {AiUsageSummaryResponse} from "../../types/domain";
import type {AiUsageQuery} from "../../types/aiUsage";

const key=(query:AiUsageQuery)=>JSON.stringify([query.month,query.projectId]);
/** A local query never replaces the global summary held by the workspace. */
export function useAiUsageScope(initial:AiUsageSummaryResponse|null){
  const[query,setQuery]=useState<AiUsageQuery>(()=>({month:initial?.month??new Date().toISOString().slice(0,7),projectId:""}));
  const[confirmed,setConfirmed]=useState<{key:string;summary:AiUsageSummaryResponse}|null>(null);
  const[loading,setLoading]=useState(false),[error,setError]=useState("");
  const generation=useRef(0),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  async function load(next:AiUsageQuery=query){
    const current=++generation.current;setQuery(next);setError("");
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(next.month)){setLoading(false);setError("Elige un mes válido antes de consultar.");return;}
    setLoading(true);
    try{const summary=await getAiUsageSummary(next.month,next.projectId||undefined);
      if(!alive.current||generation.current!==current)return;
      if(summary.month!==next.month||(summary.projectId??"")!==next.projectId)throw Error("El resultado no confirma el alcance elegido. Se conserva la consulta y no se atribuye otro resumen al proyecto.");
      setConfirmed({key:key(next),summary});
    }catch(cause){if(alive.current&&generation.current===current)setError(getApiErrorMessage(cause,"No se pudo consultar el consumo. No se presupone un importe cero."));}
    finally{if(alive.current&&generation.current===current)setLoading(false);}
  }
  const summary=confirmed?.key===key(query)?confirmed.summary:!query.projectId&&!initial?.projectId&&initial?.month===query.month?initial:null;
  const projects=initial?.availableProjects??confirmed?.summary.availableProjects??[];
  return{query,summary,projects,loading,error,load};
}
