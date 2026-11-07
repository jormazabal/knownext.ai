/** Serializes writes to one document while independent documents can progress. */
export class SessionWriteQueue {
  private readonly pending = new Map<string, Promise<unknown>>();

  run<T>(id: string, write: () => Promise<T>): Promise<T> {
    const previous = this.pending.get(id) ?? Promise.resolve();
    const next = previous.then(write, write);
    this.pending.set(id, next);
    const retire = () => { if (this.pending.get(id) === next) this.pending.delete(id); };
    void next.then(retire, retire);
    return next;
  }

  async idle(): Promise<void> {
    while (this.pending.size) await Promise.allSettled([...this.pending.values()]);
  }
}
