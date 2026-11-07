import {expect, it} from "vitest";
import {ProjectWork} from "./projectWork";
it("only the latest read of the current visit can publish", () => {
 const work=new ProjectWork();work.select("a");const old=work.read("activity","a")!;const latest=work.read("activity","a")!;const files=work.read("files","a")!;
 expect(old()).toBe(false);expect(latest()).toBe(true);expect(files()).toBe(true);work.select("b");expect(latest()).toBe(false);expect(work.read("files","a")).toBeNull();work.select("a");expect(files()).toBe(false);
});
it("admits once before render, keeps native work pending per project and never replays it", () => {
 let changes=0;const work=new ProjectWork(()=>changes++);work.select("a");const first=work.begin("a")!;expect(work.begin("a")).toBeNull();expect(work.isBusy("a")).toBe(true);
 work.select("b");const second=work.begin("b")!;expect(first.owns()).toBe(false);expect(second.owns()).toBe(true);work.select("a");expect(work.isBusy("a")).toBe(true);expect(work.begin("a")).toBeNull();expect(first.owns()).toBe(false);first.release();expect(work.isBusy("a")).toBe(false);expect(work.isBusy("b")).toBe(true);const count=changes;first.release();expect(changes).toBe(count);second.release();expect(work.isBusy("b")).toBe(false);
});
it("supports initial no-project reads and invalidates unmount/strict remount callbacks", () => {
 let changes=0;const work=new ProjectWork(()=>changes++);const initial=work.read("capabilities",undefined)!;expect(initial()).toBe(true);work.select("a");const operation=work.begin("a")!;const read=work.read("status","a")!;work.suspend();const count=changes;expect(read()).toBe(false);expect(operation.owns()).toBe(false);operation.release();expect(changes).toBe(count);expect(work.read("status","a")).toBeNull();work.resume();expect(read()).toBe(false);expect(work.read("status","a")!()).toBe(true);
});
