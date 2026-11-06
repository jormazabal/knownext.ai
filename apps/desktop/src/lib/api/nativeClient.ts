import {invoke} from "@tauri-apps/api/core";
import {runLocalOperation} from "../runtime/localOperations";

/** Native pickers may legitimately remain open; observing a deadline never reopens them. */
export function invokeManagedNative<T>(command:string,args?:Record<string,unknown>):Promise<T>{
  return runLocalOperation(id=>invoke<T>("managed_native_request",{request:{command,arguments:args??null},operationId:id}),{native:true,label:"Transferencia local",timeoutMs:30*60_000});
}
