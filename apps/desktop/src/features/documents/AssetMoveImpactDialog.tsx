import {useEffect,useState} from "react";
import {ModalFrame} from "../../components/ui/ModalFrame";
import type {AssetMoveReview} from "../../types/assetMove";
export function AssetMoveImpactDialog({review,onDecide,language="es"}:{review:AssetMoveReview;onDecide:(value:boolean)=>void;language?:"es"|"en"}){
 const [ack,setAck]=useState(false);useEffect(()=>setAck(false),[review]);
 const t=(es:string,en:string)=>language==="en"?en:es,operation=review.operation??"move",needsAck=!!(review.incoming||review.outgoing||!review.complete);
 const title=operation==="delete"?t("Enviar a la papelera","Move to trash"):operation==="rename"?t("Revisar vínculos al renombrar","Review links before renaming"):t("Revisar vínculos al mover","Review links before moving");
 const action=operation==="delete"?t("Enviar a la papelera","Move to trash"):operation==="rename"?t("Renombrar con este alcance","Rename with this scope"):t("Mover con este alcance","Move with this scope");
 const button="min-h-11 rounded px-3 text-xs font-medium hover:bg-panel";
 return <ModalFrame label={title} className="!z-[150]" onClose={()=>onDecide(false)}><section className="flex max-h-[calc(100dvh-24px)] w-full max-w-xl flex-col overflow-hidden rounded-lg bg-white shadow-menu">
  <header className="px-5 py-4"><h2 className="font-semibold">{title}</h2></header>
  <div className="min-h-0 overflow-y-auto px-5 text-xs leading-5 [overflow-wrap:anywhere]">
   <p className="font-medium">{review.path||review.name}</p>{review.nextName&&<p className="mt-1 text-ink-secondary">{t("Nuevo nombre:","New name:")} {review.nextName}</p>}
   <p className="my-3">{t(`${review.incoming} enlaces registrados hacia este elemento; ${review.outgoing} enlaces desde él. Alcance: enlaces en Markdown guardado. Los borradores abiertos pueden contener otros vínculos.`,`${review.incoming} recorded links to this item; ${review.outgoing} links from it. Scope: saved Markdown. Open drafts may contain other links.`)}</p>
   <p>{operation==="delete"?t("Se enviará a la papelera del proyecto y podrás restaurarlo desde allí. Los enlaces desde otros documentos pueden quedar sin destino. Los cambios abiertos se protegen antes de continuar.","The item will move to project trash, where it can be restored. Links from other documents may lose their target. Open changes are protected before continuing."):t("Las referencias de imágenes gestionadas conservan su tratamiento actual. Los demás enlaces relativos pueden necesitar una corrección manual después de cambiar el nombre o la ubicación.","Managed image references keep their current handling. Other relative links may need manual correction after changing the name or location.")}</p>
   {!review.complete&&<p role="status" className="my-3 font-medium">{t("La revisión de vínculos es parcial. No se confirma que estos sean todos los elementos afectados.","The link review is partial. Other items may be affected.")}</p>}
   {review.warnings.length>0&&<details className="my-3"><summary className="min-h-11 cursor-pointer">{t("Avisos de la revisión","Review warnings")}</summary><ul>{review.warnings.slice(0,8).map((s,i)=><li key={i}>{s}</li>)}</ul></details>}
   {needsAck&&<label className="my-3 flex min-h-11 items-start gap-2"><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)} className="mt-1 accent-[#F37021]"/><span>{t("He revisado el impacto y comprobaré los enlaces después de esta operación","I have reviewed the impact and will check links after this operation")}</span></label>}
  </div>
  <footer className="flex shrink-0 justify-end gap-2 px-5 py-3"><button className={button} onClick={()=>onDecide(false)}>{t("Volver","Back")}</button><button className={button+" bg-brand-orange text-white disabled:opacity-40"} disabled={needsAck&&!ack} onClick={()=>onDecide(true)}>{action}</button></footer>
 </section></ModalFrame>;
}
