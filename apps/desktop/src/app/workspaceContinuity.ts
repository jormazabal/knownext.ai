export type ProtectionOutcome="protected"|"superseded"|"failed";
export type ContinuityState={phase:"idle"|"protecting"|"checking"|"attention";issue:"checkpoint"|"reconcile"|"pending"|"reconcile-pending"|null;running:boolean;lastProtectedAt:number|null;checkpointMs:number|null};
type Actions={checkpoint:(finalizeInput:boolean)=>Promise<boolean>;reconcile:()=>Promise<void>;observe:(state:ContinuityState)=>void;now?:()=>number;slowMs?:number};

/** Coalesces visibility signals. A slow acknowledgement is never replayed as a new write. */
export class WorkspaceContinuity{
  private state:ContinuityState={phase:"idle",issue:null,running:false,lastProtectedAt:null,checkpointMs:null};
  private checkpointRequested=false;private reconcileRequested=false;private visible=true;private closed=false;
  private finalizeInputRequested=false;
  private work:Promise<void>|null=null;private slow:ReturnType<typeof setTimeout>|undefined;
  private startedAt=0;
  constructor(private readonly actions:Actions){}
  private update(patch:Partial<ContinuityState>){this.state={...this.state,...patch};if(!this.closed)this.actions.observe({...this.state});}
  private arm(){clearTimeout(this.slow);const remaining=Math.max(0,(this.actions.slowMs??2500)-((this.actions.now??Date.now)()-this.startedAt));this.slow=setTimeout(()=>{if(this.work&&this.visible&&!this.closed)this.update({phase:"attention",issue:this.state.phase==="checking"||this.state.issue==="reconcile-pending"?"reconcile-pending":"pending"});},remaining);}
  hidden(){if(this.closed)return;this.visible=false;this.checkpointRequested=true;this.finalizeInputRequested=true;this.start();}
  resumed(){if(this.closed)return;this.visible=true;this.checkpointRequested=true;this.finalizeInputRequested=true;this.reconcileRequested=true;this.start();}
  periodic(){if(this.closed||!this.visible)return;this.checkpointRequested=true;this.start();}
  retry(){this.resumed();}
  dispose(){this.closed=true;clearTimeout(this.slow);}
  private start(){
    if(this.work){this.arm();return;}
    this.startedAt=(this.actions.now??Date.now)();
    this.work=Promise.resolve().then(()=>this.drain()).finally(()=>{this.work=null;clearTimeout(this.slow);if(!this.closed){if(this.checkpointRequested||this.reconcileRequested&&this.visible)this.start();else this.update({running:false});}});
    this.arm();
  }
  private async drain(){
    let issue:ContinuityState["issue"]=null;this.update({running:true});
    while(!this.closed&&(this.checkpointRequested||this.reconcileRequested&&this.visible)){
      if(this.checkpointRequested){
        this.checkpointRequested=false;const finalizeInput=this.finalizeInputRequested;this.finalizeInputRequested=false;this.update({phase:"protecting",issue:null});const started=(this.actions.now??Date.now)();
        try{if(await this.actions.checkpoint(finalizeInput)){const at=(this.actions.now??Date.now)();this.update({lastProtectedAt:at,checkpointMs:Math.max(0,at-started)});issue=null;}else issue="checkpoint";}
        catch{issue="checkpoint";}
        if(issue==="checkpoint"){this.checkpointRequested=false;this.finalizeInputRequested=false;this.reconcileRequested=false;break;}
      }
      if(this.closed)break;
      if(this.checkpointRequested)continue;
      if(this.reconcileRequested&&this.visible){this.reconcileRequested=false;this.update({phase:"checking"});try{await this.actions.reconcile();}catch{issue=issue??"reconcile";}}
    }
    if(!this.closed)this.update({phase:issue?"attention":"idle",issue});
  }
}
