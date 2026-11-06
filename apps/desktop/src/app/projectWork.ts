/** View ownership and immediate admission. This never cancels or replays runtime work. */
export class ProjectWork {
  private project: string | undefined;
  private epoch = 0;
  private live = true;
  private reads = new Map<string, number>();
  private operations = new Map<string, object>();
  constructor(private changed: () => void = () => {}) {}
  select(project: string | undefined) {
    if (project !== this.project) { this.project = project; this.epoch++; }
  }
  suspend() { this.live = false; this.epoch++; }
  resume() { if (!this.live) { this.live = true; this.epoch++; this.changed(); } }
  isBusy(project: string | undefined) { return !!project && this.operations.has(project); }
  read(channel: string, project: string | undefined) {
    if (!this.live || this.project !== project) return null;
    const epoch = this.epoch, sequence = (this.reads.get(channel) ?? 0) + 1;
    this.reads.set(channel, sequence);
    return () => this.live && this.project === project && this.epoch === epoch && this.reads.get(channel) === sequence;
  }
  begin(project: string) {
    if (!this.live || this.project !== project || this.operations.has(project)) return null;
    const token = {}, epoch = this.epoch;
    this.operations.set(project, token); this.changed();
    return {
      owns: () => this.live && this.project === project && this.epoch === epoch,
      release: () => {
        if (this.operations.get(project) !== token) return;
        this.operations.delete(project);
        if (this.live) this.changed();
      },
    };
  }
}
