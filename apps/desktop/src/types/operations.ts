export type OperationPhase = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "expired" | "unknown";
export type OperationLane = "mutation" | "query" | "ai" | "transfer" | "index" | "control" | "background";
export type RuntimeOperation = {id:string;lane:OperationLane;phase:OperationPhase;queuedAt:string;startedAt:string|null;finishedAt:string|null;cancellable:boolean;cancelRequested?:boolean;stage?:"preparing"|"waiting-remote"|"validating"|"publishing"|"observing"|null;recovered?:boolean};
export type LocalOperation = {id:string;phase:OperationPhase;label:string;startedAt:number;unconfirmed:boolean;cancellable:boolean;native:boolean;cancelRequested?:boolean;stage?:RuntimeOperation["stage"];recovered?:boolean;stoppedAfterStart?:boolean};
