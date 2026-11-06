import {act,renderHook} from "@testing-library/react";
import {expect,it} from "vitest";
import {useAssetMoveReview} from "./useAssetMoveReview";
const review={name:"Document.pdf",path:"Docs/Document.pdf",incoming:1,outgoing:0,complete:true,warnings:[],operation:"delete" as const};
it("cancels an unresolved file action when the project changes",async()=>{
 const h=renderHook(({project})=>useAssetMoveReview(project),{initialProps:{project:"a"}});let pending!:Promise<boolean>;
 act(()=>{pending=h.result.current.request(review);});h.rerender({project:"b"});expect(await pending).toBe(false);expect(h.result.current.review).toBeNull();h.unmount();
});
it("a replacement review cannot authorize the preceding operation",async()=>{
 const h=renderHook(()=>useAssetMoveReview("a"));let first!:Promise<boolean>,second!:Promise<boolean>;
 act(()=>{first=h.result.current.request(review);});act(()=>{second=h.result.current.request({...review,operation:"rename",nextName:"new.pdf"});});
 expect(await first).toBe(false);act(()=>h.result.current.settle(true));expect(await second).toBe(true);h.unmount();
});
it("unmount resolves pending file actions without authorizing execution",async()=>{
 const h=renderHook(()=>useAssetMoveReview("a"));let pending!:Promise<boolean>;act(()=>{pending=h.result.current.request(review);});h.unmount();expect(await pending).toBe(false);
});
