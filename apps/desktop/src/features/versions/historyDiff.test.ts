import { describe, expect, it } from "vitest";
import { compareHistory } from "./historyDiff";

describe("comparación acotada",()=>{
  it("conserva dirección, números reales y recuentos al omitir contexto",()=>{
    const common=Array.from({length:20},(_,index)=>`Contexto ${index}`).join("\n");
    const result=compareHistory(`${common}\nAnterior\nFin`,`${common}\nNuevo\nExtra\nFin`);
    expect(result.status).toBe("ready");
    if(result.status!=="ready")throw new Error("Debe compararse");
    expect([result.removed,result.added]).toEqual([1,2]);
    expect(result.unified).toContainEqual({type:"removed",text:"Anterior",leftNumber:21});
    expect(result.unified).toContainEqual({type:"added",text:"Extra",rightNumber:22});
    expect(result.columns).toContainEqual({type:"changed",leftText:"Anterior",rightText:"Nuevo",leftNumber:21,rightNumber:21});
    expect(result.unified[0].type).toBe("skip");
  });
  it("evita matrices fuera de presupuesto sin declarar igualdad ni recortar contenido",()=>{
    const left=Array.from({length:1500},(_,index)=>`A ${index}`).join("\n");
    const right=Array.from({length:1500},(_,index)=>`B ${index}`).join("\n");
    expect(compareHistory(left,right)).toEqual(expect.objectContaining({status:"limited"}));
    expect(compareHistory("A".repeat(2_000_001),"B").status).toBe("limited");
    expect(compareHistory(left,left)).toEqual({status:"ready",added:0,removed:0,unified:[],columns:[]});
    const near=compareHistory(left,`${left}\nAñadido`);
    expect(near).toEqual(expect.objectContaining({status:"ready",added:1,removed:0}));
  });
});
