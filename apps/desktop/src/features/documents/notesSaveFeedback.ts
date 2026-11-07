export function notesSaveFeedback(state:"idle"|"saving"|"error",dirty:boolean,updatedLabel:string|null){
  if(state==="saving")return "Guardando automáticamente…";
  if(state==="error")return "Guardado sin confirmar";
  if(dirty)return "Pendiente de autoguardar";
  return updatedLabel?`Autoguardado · ${updatedLabel}`:"Sin cambios pendientes";
}
