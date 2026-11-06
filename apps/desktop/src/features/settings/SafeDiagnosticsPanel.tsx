import {useEffect,useRef,useState} from "react";
import {Copy,ShieldCheck} from "lucide-react";
import {getSafeDiagnostics} from "../../lib/api/diagnostics";
import {safeDiagnosticJson} from "../../lib/runtime/diagnostics";
import {getApiErrorMessage} from "../../lib/api/client";

export function SafeDiagnosticsPanel({english=false,copyText}:{english?:boolean;copyText:(text:string)=>Promise<boolean>}) {
  const [report,setReport]=useState("");const [count,setCount]=useState(0);const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");const [notice,setNotice]=useState("");
  const mounted=useRef(true);const flight=useRef(false);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function prepare(){
    if(flight.current)return;flight.current=true;setBusy(true);setError("");setNotice("");
    try{const result=await getSafeDiagnostics();const text=safeDiagnosticJson(result);if(mounted.current){setReport(text);setCount(result.events.length);}}
    catch(failure){if(mounted.current)setError(getApiErrorMessage(failure,english?"The report could not be prepared. Existing data is preserved.":"No se pudo preparar el informe. Se conserva el diagnóstico anterior."));}
    finally{if(mounted.current){flight.current=false;setBusy(false);}}
  }
  async function copy(){
    if(!report||flight.current)return;flight.current=true;setBusy(true);setNotice("");
    try{const copied=await copyText(report);if(mounted.current)setNotice(copied?(english?"Technical report copied. Nothing was sent.":"Informe técnico copiado. No se ha enviado a nadie."):(english?"Copy failed. Select the report below and copy it manually.":"No se pudo copiar. Puedes seleccionar el informe y copiarlo manualmente."));}
    catch{if(mounted.current)setNotice(english?"Copy failed. The report is preserved.":"No se pudo copiar. El informe se conserva.");}
    finally{if(mounted.current){flight.current=false;setBusy(false);}}
  }
  return <section className="rounded-md bg-panel p-4" aria-label={english?"Private technical diagnostics":"Diagnóstico técnico privado"}>
    <h3 className="flex items-center gap-2 text-sm font-semibold"><ShieldCheck size={17} className="text-brand-orange"/>{english?"A report you can review":"Un informe que puedes revisar"}</h3>
    <p className="mt-2 text-xs leading-5 text-ink-secondary">{english?"Technical events only: incident IDs, time, category and status. No documents, prompts, credentials, local paths or raw error text. Preparing or copying never sends data to third parties.":"Solo eventos técnicos: identificador, fecha, categoría y estado. Sin documentos, prompts, credenciales, rutas locales ni texto libre de errores. Preparar o copiar no envía datos a terceros."}</p>
    <p className="mt-1 text-xs leading-5 text-ink-secondary">{english?"Up to 1,000 events / 512 KiB. Legacy logs are preserved and excluded from this report.":"Hasta 1.000 eventos / 512 KiB. Las trazas anteriores se conservan y quedan fuera de este informe."}</p>
    <div className="mt-3 flex flex-wrap items-center gap-2"><button type="button" disabled={busy} onClick={()=>void prepare()} className="min-h-11 rounded px-3 text-xs font-semibold text-brand-orange hover:bg-brand-hover disabled:opacity-40">{busy?(english?"Working…":"Preparando…"):(english?"Prepare report":"Preparar informe")}</button><button type="button" disabled={busy||!report} onClick={()=>void copy()} className="inline-flex min-h-11 items-center gap-2 rounded px-3 text-xs font-semibold hover:bg-white disabled:opacity-40"><Copy size={14}/>{english?"Copy reviewed report":"Copiar informe revisado"}</button></div>
    {error&&<p role="alert" className="mt-2 text-xs leading-5 text-red-800">{error}</p>}
    {notice&&<p role="status" className="mt-2 text-xs leading-5 text-ink-secondary">{notice}</p>}
    {report&&<details open className="mt-3"><summary className="min-h-11 cursor-pointer py-3 text-xs font-semibold">{english?`Review ${count} technical ${count===1?"event":"events"}`:`Revisar ${count} ${count===1?"evento técnico":"eventos técnicos"}`}</summary><textarea aria-label={english?"Safe diagnostic report":"Informe de diagnóstico seguro"} readOnly value={report} className="h-48 w-full resize-y rounded-md border border-line bg-white p-3 font-mono text-[11px] leading-5"/></details>}
  </section>;
}
