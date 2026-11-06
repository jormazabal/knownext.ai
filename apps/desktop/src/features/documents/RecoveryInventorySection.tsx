import {useState} from "react";
import {RecoveryFamiliesPanel} from "./RecoveryFamiliesPanel";
import {RecoveryStoragePanel} from "./RecoveryStoragePanel";
export function RecoveryInventorySection(){const[view,setView]=useState<"families"|"storage">("families");return <div><div role="group" aria-label="Consulta de recuperación" className="mb-4 flex flex-wrap gap-1">{([['families','Registros y conservación'],['storage','Espacio y límites']]as const).map(([id,label])=><button key={id} aria-pressed={view===id} onClick={()=>setView(id)} className={`min-h-11 rounded px-3 text-xs ${view===id?"bg-panel font-semibold":"hover:bg-panel"}`}>{label}</button>)}</div>{view==="families"?<RecoveryFamiliesPanel/>:<RecoveryStoragePanel/>}</div>;}
