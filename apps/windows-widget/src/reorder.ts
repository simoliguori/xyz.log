// Pure helpers to reorder / insert task lines in Todo.md while leaving
// everything else (headings, blank lines, done tasks, note sections, each
// task's own indented description) exactly where it is.

/** End (exclusive) of the block starting at `start`: the task line plus the
    following indented description lines. */
function blockEnd(lines: string[], start: number): number {
	let i = start + 1;
	while (i < lines.length && /^\s+\S/.test(lines[i])) i++;
	return i;
}

/**
 * Permute the blocks of the movable tasks among the slots they occupy.
 * `movableLineNos` are the (0-based, as the parser reports them) line numbers of
 * every open task shown in the flat list, in current file order; `orderedLineNos`
 * is the same set in the new desired order. Returns the rewritten file content.
 */
export function reorderTodoFile(content: string, movableLineNos: number[], orderedLineNos: number[]): string {
	const lines = content.split(/\r?\n/);
	const movable = new Set(movableLineNos);
	const blocks = new Map<number, string[]>();
	const tails = new Set<number>();
	for (const idx of movable) {
		const end = blockEnd(lines, idx);
		blocks.set(idx, lines.slice(idx, end));
		for (let k = idx + 1; k < end; k++) tails.add(k);
	}
	const orderedStarts = orderedLineNos;
	const out: string[] = [];
	let slotPtr = 0;
	for (let idx = 0; idx < lines.length; idx++) {
		if (movable.has(idx)) {
			const start = orderedStarts[slotPtr++];
			out.push(...(blocks.get(start) ?? [lines[idx]]));
		} else if (tails.has(idx)) {
			// already emitted as part of its block
		} else {
			out.push(lines[idx]);
		}
	}
	return out.join("\n");
}

/**
 * Insert `line` right before the block at `beforeLineNo` (0-based, as the parser
 * reports line numbers); append to the end when `beforeLineNo` is null.
 */
export function insertTodoLine(content: string, line: string, beforeLineNo: number | null): string {
	const lines = content.split(/\r?\n/);
	if (beforeLineNo == null || beforeLineNo < 0 || beforeLineNo >= lines.length) {
		// append, mirroring appendLine's trailing-newline behaviour
		const trimmed = content.replace(/\s*$/, "");
		return trimmed.length ? `${trimmed}\n${line}\n` : `${line}\n`;
	}
	lines.splice(beforeLineNo, 0, line);
	return lines.join("\n");
}
