import {useEffect,useRef,useState,type ComponentType} from "react";
import {LoadFailure} from "./LoadFailure";

/** View modules own no working documents. A failed import never reloads the workspace. */
export function createDeferredView<P extends object>(load:()=>Promise<{default:ComponentType<P>}>,loading:string,failure:string,activate?:(props:P)=>boolean){
  let loaded:ComponentType<P>|null=null;
  let pending:Promise<ComponentType<P>>|null=null;
  function acquire(){
    if(loaded)return Promise.resolve(loaded);
    if(!pending)pending=load().then(module=>{loaded=module.default;return loaded;}).finally(()=>{pending=null;});
    return pending;
  }
  return function DeferredView(props:P){
    // Hidden workspaces may stay mounted; acquire their module only on first use.
    // Once acquired, keep the same child instance and its local UI state.
    const activated=useRef(!activate||activate(props));
    const shouldLoad=activated.current||!activate||activate(props);activated.current=shouldLoad;
    const [view,setView]=useState<{View:ComponentType<P>|null;failed:boolean}>(()=>({View:loaded,failed:false}));
    const [attempt,setAttempt]=useState(0);
    useEffect(()=>{
      if(!shouldLoad)return;
      if(loaded){setView({View:loaded,failed:false});return;}
      let active=true;setView({View:null,failed:false});
      void acquire().then(View=>{if(active)setView({View,failed:false});}).catch(()=>{if(active)setView({View:null,failed:true});});
      return()=>{active=false;};
    },[attempt,shouldLoad]);
    if(!shouldLoad)return null;
    if(view.failed)return <LoadFailure message={failure} onRetry={()=>setAttempt(value=>value+1)}/>;
    if(!view.View)return <div role="status" className="min-h-11 px-2 py-3 text-sm text-ink-secondary">{loading}</div>;
    const View=view.View;return <View {...props}/>;
  };
}
