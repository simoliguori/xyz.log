import { Habit, HabitLog, Priority, Todo } from "./types";

/* Parser puro (nessuna dipendenza da Obsidian): la stessa logica è replicata
   in Kotlin nell'app Android (MarkdownParser.kt). Se cambi qualcosa qui,
   allineala anche lì e in docs/DATA_FORMAT.md. */

export const PRIORITY_EMOJI: Record<Priority, string> = {
	[Priority.Highest]: "🔺",
	[Priority.High]: "⏫",
	[Priority.Medium]: "🔼",
	[Priority.None]: "",
	[Priority.Low]: "🔽",
	[Priority.Lowest]: "⏬",
};

export const PRIORITY_LABEL: Record<Priority, string> = {
	[Priority.Highest]: "massima",
	[Priority.High]: "alta",
	[Priority.Medium]: "media",
	[Priority.None]: "normale",
	[Priority.Low]: "bassa",
	[Priority.Lowest]: "minima",
};

const DATE_RE = /\d{4}-\d{2}-\d{2}/;
const DUE_RE = new RegExp(`📅\\s*(${DATE_RE.source})`, "u");
const DONE_RE = new RegExp(`✅\\s*(${DATE_RE.source})`, "u");
const TODO_LINE_RE = /^(\s*)- \[([ xX])\]\s+(.*)$/;
const LOG_LINE_RE = /^-\s*\[[xX]\]\s+(\d{4}-\d{2}-\d{2})\s+([a-z0-9-]+)\s*$/;

function unquote(s: string): string {
	const t = s.trim();
	if (
		(t.startsWith('"') && t.endsWith('"')) ||
		(t.startsWith("'") && t.endsWith("'"))
	) {
		return t.slice(1, -1);
	}
	return t;
}

/** Estrae le abitudini dal frontmatter YAML di Habits.md (formato vincolato, vedi DATA_FORMAT.md) */
export function parseHabits(content: string): Habit[] {
	const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fm) return [];
	const habits: Habit[] = [];
	let cur: Partial<Habit> | null = null;
	let inHabits = false;

	const push = () => {
		if (cur && cur.id) {
			habits.push({
				id: cur.id,
				name: cur.name ?? cur.id,
				emoji: cur.emoji ?? "",
			});
		}
		cur = null;
	};

	for (const line of fm[1].split(/\r?\n/)) {
		if (/^habits:\s*$/.test(line)) {
			inHabits = true;
			continue;
		}
		if (!inHabits) continue;
		if (/^\S/.test(line)) {
			// nuova chiave top-level: fine della lista habits
			push();
			inHabits = false;
			continue;
		}
		const item = line.match(/^\s*-\s+(\w+):\s*(.*)$/);
		const field = line.match(/^\s+(\w+):\s*(.*)$/);
		if (item) {
			push();
			cur = {};
			(cur as Record<string, string>)[item[1]] = unquote(item[2]);
		} else if (field && cur) {
			(cur as Record<string, string>)[field[1]] = unquote(field[2]);
		}
	}
	push();
	return habits;
}

export function parseLog(content: string): HabitLog {
	const log: HabitLog = new Map();
	for (const line of content.split(/\r?\n/)) {
		const m = line.match(LOG_LINE_RE);
		if (!m) continue;
		const [, date, id] = m;
		if (!log.has(id)) log.set(id, new Set());
		log.get(id)!.add(date);
	}
	return log;
}

export function logLine(date: string, habitId: string): string {
	return `- [x] ${date} ${habitId}`;
}

/** Aggiunge o rimuove la riga di log per (data, abitudine). Ritorna il nuovo contenuto. */
export function toggleLog(content: string, date: string, habitId: string): string {
	const target = logLine(date, habitId);
	const lines = content.split(/\r?\n/);
	const idx = lines.findIndex((l) => l.trim() === target);
	if (idx >= 0) {
		lines.splice(idx, 1);
	} else {
		// appende dopo l'ultima riga non vuota
		let last = lines.length - 1;
		while (last >= 0 && lines[last].trim() === "") last--;
		lines.splice(last + 1, 0, target);
	}
	return lines.join("\n");
}

export function parseTodoLine(line: string, lineNo: number): Todo | null {
	const m = line.match(TODO_LINE_RE);
	if (!m) return null;
	const done = m[2].toLowerCase() === "x";
	let rest = m[3];

	const due = rest.match(DUE_RE)?.[1] ?? null;
	const doneDate = rest.match(DONE_RE)?.[1] ?? null;

	let priority = Priority.None;
	for (const p of [
		Priority.Highest,
		Priority.High,
		Priority.Medium,
		Priority.Low,
		Priority.Lowest,
	]) {
		if (rest.includes(PRIORITY_EMOJI[p])) {
			priority = p;
			break;
		}
	}

	let text = rest
		.replace(DUE_RE, "")
		.replace(DONE_RE, "")
		.replace(/[🔺⏫🔼🔽⏬]/gu, "")
		.replace(/\s{2,}/g, " ")
		.trim();

	const tags = [...text.matchAll(/#[\w/-]+/g)].map((t) => t[0]);

	return { raw: line, lineNo, done, text, due, doneDate, priority, tags };
}

export function parseTodos(content: string): Todo[] {
	const todos: Todo[] = [];
	content.split(/\r?\n/).forEach((line, i) => {
		const t = parseTodoLine(line, i);
		if (t) todos.push(t);
	});
	return todos;
}

export function serializeTodo(
	text: string,
	priority: Priority,
	due: string | null
): string {
	let line = `- [ ] ${text.trim()}`;
	if (priority !== Priority.None) line += ` ${PRIORITY_EMOJI[priority]}`;
	if (due) line += ` 📅 ${due}`;
	return line;
}

/** Inverte lo stato di completamento di una riga task. `today` in formato ISO. */
export function toggleTodoLine(line: string, today: string): string {
	const m = line.match(TODO_LINE_RE);
	if (!m) return line;
	const done = m[2].toLowerCase() === "x";
	if (done) {
		return `${m[1]}- [ ] ${m[3].replace(DONE_RE, "").replace(/\s{2,}/g, " ").trim()}`;
	}
	return `${m[1]}- [x] ${m[3].trim()} ✅ ${today}`;
}

/** Sostituisce nel contenuto la prima riga identica a `raw` col risultato di `fn`. */
export function replaceLine(
	content: string,
	raw: string,
	fn: (line: string) => string | null
): string {
	const lines = content.split(/\r?\n/);
	const idx = lines.findIndex((l) => l === raw);
	if (idx < 0) return content;
	const replaced = fn(lines[idx]);
	if (replaced === null) lines.splice(idx, 1);
	else lines[idx] = replaced;
	return lines.join("\n");
}

export function appendLine(content: string, line: string): string {
	const lines = content.split(/\r?\n/);
	let last = lines.length - 1;
	while (last >= 0 && lines[last].trim() === "") last--;
	lines.splice(last + 1, 0, line);
	return lines.join("\n");
}

/* ---------- utilità date (locale, senza timezone UTC) ---------- */

export function toISO(d: Date): string {
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function todayISO(): string {
	return toISO(new Date());
}

export function addDays(iso: string, n: number): string {
	const [y, m, d] = iso.split("-").map(Number);
	const date = new Date(y, m - 1, d + n);
	return toISO(date);
}

/** Streak di giorni consecutivi: conta a ritroso da oggi (o da ieri se oggi non è ancora fatto). */
export function streak(dates: Set<string>, today: string): number {
	let cursor = dates.has(today) ? today : addDays(today, -1);
	let count = 0;
	while (dates.has(cursor)) {
		count++;
		cursor = addDays(cursor, -1);
	}
	return count;
}
