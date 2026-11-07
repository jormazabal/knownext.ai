import {expect,it} from "vitest";
import {createDefaultHandwrittenContent} from "./handwrittenModel";
import {composePageChoices,reviewPageChoices} from "./handwrittenMerge";
it("keeps selected page data, tilt, unknown fields and page-specific text when both versions are retained",()=>{
  const local=createDefaultHandwrittenContent('p::note.knote','Local'),disk=JSON.parse(JSON.stringify(local));const id=local.pages[0].id;
  local.pages[0].strokes=[{id:'ink',tool:'pen',color:'#111827',width:2,opacity:1,pressure:true,points:[[1,2,0.7,0,45,-30]]}];disk.title='Disk title';disk.pages[0].title='Disk page';local.ocr.textByPage[id]='Local text';disk.ocr.textByPage[id]='Disk text';
  Object.assign(local.pages[0],{ownedExtension:{preserve:true}});const before=JSON.stringify([local,disk]);expect(composePageChoices(local,disk,{})).toBeNull();expect(composePageChoices(local,disk,{},'local')).toBeNull();
  const merged=composePageChoices(local,disk,{[id]:'both'},'disk')!;expect(merged.pages).toHaveLength(2);expect(merged.title).toBe('Disk title');expect(merged.pages[0].strokes[0].points[0]).toEqual([1,2,0.7,0,45,-30]);expect(merged.pages[0]).toHaveProperty('ownedExtension.preserve',true);expect(merged.pages[1].id).not.toBe(id);expect(merged.ocr.textByPage[id]).toBe('Local text');expect(merged.ocr.textByPage[merged.pages[1].id]).toBe('Disk text');expect(JSON.stringify([local,disk])).toBe(before);
});
it("makes absence a choice, rejects an empty note and detects duplicate page identities",()=>{
  const local=createDefaultHandwrittenContent('p::note.knote'),disk=JSON.parse(JSON.stringify(local));const id=local.pages[0].id;disk.pages=[];expect(reviewPageChoices(local,disk)[0].changed).toBe(true);expect(composePageChoices(local,disk,{[id]:'disk'},'local')).toBeNull();expect(composePageChoices(local,disk,{[id]:'local'},'local')?.pages).toEqual(local.pages);disk.pages=[local.pages[0],local.pages[0]];expect(()=>reviewPageChoices(local,disk)).toThrow('duplicada');
});
