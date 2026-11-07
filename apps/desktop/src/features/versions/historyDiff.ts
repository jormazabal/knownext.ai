export type DiffOperation = {
  type: "same" | "added" | "removed" | "skip";
  text: string;
  leftNumber?: number;
  rightNumber?: number;
};

export type SideBySideDiffRow = {
  type: "same" | "changed" | "added" | "removed" | "skip";
  leftNumber?: number;
  rightNumber?: number;
  leftText?: string;
  rightText?: string;
};

export type HistoryDiff =
  | { status: "limited"; reason: string }
  | { status: "ready"; added: number; removed: number; unified: DiffOperation[]; columns: SideBySideDiffRow[] };

const MAX_CHARACTERS = 2_000_000;
const MAX_LINES = 8_000;
const MAX_CELLS = 1_000_000;

/** One bounded LCS, shared by both presentations. Counts include hidden context. */
export function compareHistory(previous: string, current: string, options:{fullContext?:boolean}={}): HistoryDiff {
  if (previous === current) return { status: "ready", added: 0, removed: 0, unified: [], columns: [] };
  if (previous.length + current.length > MAX_CHARACTERS) return limited();
  const left = previous.split(/\r?\n/);
  const right = current.split(/\r?\n/);
  if (left.length + right.length > MAX_LINES) return limited();
  let start = 0;
  while (start < left.length && start < right.length && left[start] === right[start]) start++;
  let leftEnd = left.length;
  let rightEnd = right.length;
  while (leftEnd > start && rightEnd > start && left[leftEnd - 1] === right[rightEnd - 1]) { leftEnd--; rightEnd--; }
  const width = rightEnd - start + 1;
  const height = leftEnd - start + 1;
  if (width * height > MAX_CELLS) return limited();
  const table = new Uint32Array(width * height);
  for (let row = height - 2; row >= 0; row--) {
    for (let col = width - 2; col >= 0; col--) {
      table[row * width + col] = left[start + row] === right[start + col]
        ? table[(row + 1) * width + col + 1] + 1
        : Math.max(table[(row + 1) * width + col], table[row * width + col + 1]);
    }
  }
  const operations: DiffOperation[] = [];
  for (let index = 0; index < start; index++) operations.push({ type: "same", text: left[index], leftNumber: index + 1, rightNumber: index + 1 });
  let row = 0;
  let col = 0;
  while (row < height - 1 && col < width - 1) {
    if (left[start + row] === right[start + col]) {
      operations.push({ type: "same", text: left[start + row], leftNumber: start + ++row, rightNumber: start + ++col });
    } else if (table[(row + 1) * width + col] >= table[row * width + col + 1]) {
      operations.push({ type: "removed", text: left[start + row], leftNumber: start + ++row });
    } else {
      operations.push({ type: "added", text: right[start + col], rightNumber: start + ++col });
    }
  }
  while (row < height - 1) operations.push({ type: "removed", text: left[start + row], leftNumber: start + ++row });
  while (col < width - 1) operations.push({ type: "added", text: right[start + col], rightNumber: start + ++col });
  for (let index = leftEnd; index < left.length; index++) operations.push({ type: "same", text: left[index], leftNumber: index + 1, rightNumber: rightEnd + index - leftEnd + 1 });
  const columns: SideBySideDiffRow[] = [];
  let index = 0;
  while (index < operations.length) {
    const operation = operations[index];
    if (operation.type === "same") {
      columns.push({ ...operation, type: "same", leftText: operation.text, rightText: operation.text });
      index++;
      continue;
    }
    const removed: DiffOperation[] = [];
    const added: DiffOperation[] = [];
    while (index < operations.length && operations[index].type !== "same") {
      const item = operations[index++];
      (item.type === "removed" ? removed : added).push(item);
    }
    for (let pair = 0; pair < Math.max(removed.length, added.length); pair++) {
      const a = removed[pair]; const b = added[pair];
      columns.push({ type: a && b ? "changed" : a ? "removed" : "added", leftText: a?.text, rightText: b?.text, leftNumber: a?.leftNumber, rightNumber: b?.rightNumber });
    }
  }
  return {
    status: "ready", added: operations.filter(item => item.type === "added").length,
    removed: operations.filter(item => item.type === "removed").length,
    unified: options.fullContext?operations:trimContext(operations, { type: "skip", text: "Contexto sin cambios" }),
    columns: trimContext(columns, { type: "skip" }),
  };
}

function limited(): HistoryDiff {
  return { status: "limited", reason: "Esta comparación supera el límite de cálculo detallado. Puedes consultar el contenido completo de cada lado." };
}

function trimContext<T extends { type: string }>(rows: T[], skipped: T): T[] {
  const visible = new Set<number>();
  rows.forEach((row, index) => {
    if (row.type !== "same") for (let offset = -2; offset <= 2; offset++) {
      if (index + offset >= 0 && index + offset < rows.length) visible.add(index + offset);
    }
  });
  const result: T[] = [];
  let gap = false;
  rows.forEach((row, index) => {
    if (visible.has(index)) { if (gap) result.push(skipped); result.push(row); gap = false; }
    else gap = true;
  });
  if (gap && result.length) result.push(skipped);
  return result;
}
