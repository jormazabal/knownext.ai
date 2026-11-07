import {invoke} from "@tauri-apps/api/core";

export async function protectUpdateInstallation(actions:{freeze:()=>void;unfreeze:()=>void;hasPendingSettings:()=>boolean;protect:()=>Promise<boolean>;reserve?:()=>Promise<string>}):Promise<string>{
  try{
    actions.freeze();
    if(actions.hasPendingSettings())throw Error("Espera a que se confirmen los ajustes antes de instalar la actualización.");
    if(!await actions.protect())throw Error("No se confirmó la protección del trabajo actual. El espacio sigue abierto para resolverlo.");
    if(actions.hasPendingSettings())throw Error("Los ajustes cambiaron durante la protección. Vuelve a revisarlos antes de instalar.");
    return await (actions.reserve??(()=>invoke<string>("prepare_runtime_restart")))();
  }catch(error){actions.unfreeze();throw error;}
}
export async function releaseUpdateInstallation(token:string){await invoke("release_runtime_restart",{token});}
