/** Stop before changing critical stores if any live work lacks acknowledgement. */
export async function protectForCriticalTransition({hasPendingSettings,protectDocuments,pause}:{hasPendingSettings:()=>boolean;protectDocuments:()=>Promise<boolean>;pause:()=>void}):Promise<void>{
  if(hasPendingSettings())throw Error("Hay ajustes pendientes de guardar. Espera a su confirmación o resuelve el error antes de recuperar el estado.");
  if(!await protectDocuments())throw Error("No se han podido proteger todos los documentos y notas. Se conserva el espacio de trabajo y no se cambia el estado.");
  if(hasPendingSettings())throw Error("Los ajustes cambiaron durante la protección. Espera a su confirmación y vuelve a revisar el estado.");
  pause();
}
