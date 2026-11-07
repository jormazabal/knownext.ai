export type AiBudgetMode = "notice" | "stop-new";
export type AiBudgetRule = {month:string;projectId:string|null;limitEur:number;mode:AiBudgetMode};
export type AiBudgetCheck = AiBudgetRule & {recordedEur:number;unpricedEntries:number;state:"ok"|"warning"|"reached"|"uncertain";blocked:boolean};
export type AiBudgetStatus = {schemaVersion:1;revision:string;month:string;projectId:string|null;rule:AiBudgetRule|null;checks:AiBudgetCheck[];checkedAt:string;basis:"local-recorded-estimates";exchangeRateAvailable:boolean};
