import { describe, expect, it } from "vitest";
import { SessionWriteQueue } from "./sessionWriteQueue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}

describe("SessionWriteQueue", () => {
  it("finishes an older draft before saving and drains writes added while waiting", async () => {
    const queue = new SessionWriteQueue(), draft = deferred(), order: string[] = [];
    const first = queue.run("doc", async () => { order.push("draft started"); await draft.promise; order.push("draft saved"); });
    const idle = queue.idle();
    const save = queue.run("doc", async () => { order.push("document saved"); });
    await Promise.resolve(); expect(order).toEqual(["draft started"]);
    draft.resolve(); await Promise.all([first, save, idle]);
    expect(order).toEqual(["draft started", "draft saved", "document saved"]);
  });

  it("does not block another resource or poison the next operation after failure", async () => {
    const queue = new SessionWriteQueue(), blocked = deferred();
    const first = queue.run("a", async () => { await blocked.promise; throw new Error("disk full"); });
    const failed = expect(first).rejects.toThrow("disk full");
    const next = queue.run("a", async () => "recovered");
    await expect(queue.run("b", async () => "independent")).resolves.toBe("independent");
    blocked.resolve(); await failed; await expect(next).resolves.toBe("recovered");
    await queue.idle();
  });
});
