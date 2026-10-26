import { Category, Habit, HabitLog, Priority, Todo } from "./types";

/* Parser puro (nessuna dipendenza esterna): è la logica canonica condivisa da
   tutti i client. Lo specchio Kotlin vive in MarkdownParser.kt. Se cambi
   qualcosa qui, allinealo anche lì e in docs/DATA_FORMAT.md. */

export const PRIORITY_EMOJI: Record<Priority, string> = {
	[Priority.Highest]: "🔺",
	[Priority.High]: "⏫",
	[Priority.Medium]: "🔼",
	[Priority.None]: "",
	[Priority.Low]: "🔽",
	[Priority.Lowest]: "⏬",
};

const DATE_RE = /\d{4}-\d{2}-\d{2}/;
const DUE_RE = new RegExp(`📅\\s*(${DATE_RE.source})`, "u");
const DONE_RE = new RegExp(`✅\\s*(${DATE_RE.source})`, "u");
const TIME_RE = /⏰\s*(\d{1,2}:\d{2})/u;
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

/** Normalizza "9:0" → "09:00"; scarta valori non orari. */
export function normalizeTime(s: string): string | null {
	const m = s.trim().match(/^(\d{1,2}):(\d{1,2})$/);
	if (!m) return null;
	const h = Math.min(23, Number(m[1]));
	const min = Math.min(59, Number(m[2]));
	return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Legge una lista di orari da `reminders: ["09:00", "21:00"]` (o CSV semplice). */
export function parseTimeList(raw: string | undefined): string[] {
	if (!raw) return [];
	const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
	return inner
		.split(",")
		.map((x) => normalizeTime(unquote(x)))
		.filter((x): x is string => x !== null);
}

/** Serializza una lista di orari come array YAML inline. */
export function serializeTimeList(times: string[]): string {
	return `[${times.map((t) => `"${t}"`).join(", ")}]`;
}

/** Estrae le abitudini dal frontmatter YAML di Habits.md (vedi DATA_FORMAT.md) */
export function parseHabits(content: string): Habit[] {
	const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fm) return [];
	const habits: Habit[] = [];
	let cur: Record<string, string> | null = null;
	let inHabits = false;

	const push = () => {
		if (cur && cur.id) {
			habits.push({
				id: cur.id,
				name: cur.name ?? cur.id,
				emoji: cur.emoji ?? "",
				icon: cur.icon ?? "",
				cadence: Math.max(1, Number(cur.cadence) || 1),
				start: cur.start ?? "",
				duration: Math.max(0, Number(cur.duration) || 0),
				countable: cur.countable === "true",
				goal: Math.max(1, Number(cur.goal) || 1),
				reminders: parseTimeList(cur.reminders),
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
			cur[item[1]] = unquote(item[2]);
		} else if (field && cur) {
			// reminders è una lista: non applicare unquote (è un array inline)
			cur[field[1]] = field[1] === "reminders" ? field[2] : unquote(field[2]);
		}
	}
	push();
	return habits;
}

/** Conta i completamenti per abitudine e per giorno (le righe duplicate si sommano). */
export function parseLog(content: string): HabitLog {
	const log: HabitLog = new Map();
	for (const line of content.split(/\r?\n/)) {
		const m = line.match(LOG_LINE_RE);
		if (!m) continue;
		const [, date, id] = m;
		if (!log.has(id)) log.set(id, new Map());
		const byDate = log.get(id)!;
		byDate.set(date, (byDate.get(date) ?? 0) + 1);
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
	const rest = m[3];

	const due = rest.match(DUE_RE)?.[1] ?? null;
	const doneDate = rest.match(DONE_RE)?.[1] ?? null;
	const time = rest.match(TIME_RE)?.[1] ? normalizeTime(rest.match(TIME_RE)![1]) : null;

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

	const text = rest
		.replace(DUE_RE, "")
		.replace(DONE_RE, "")
		.replace(TIME_RE, "")
		.replace(/[🔺⏫🔼🔽⏬]/gu, "")
		.replace(/\s{2,}/g, " ")
		.trim();

	const tags = [...text.matchAll(/#[\w/-]+/g)].map((t) => t[0]);

	return { raw: line, lineNo, done, text, due, time, doneDate, priority, tags };
}

/**
 * Legge Todo.md con sottocartelle e descrizioni:
 * - `## Lista` → sottocartella di 1° livello
 * - `### Sezione` → sottocartella di 2° livello
 * - righe indentate (non-task) sotto una task → descrizione (con link markdown)
 */
export function parseTodos(content: string): Todo[] {
	const todos: Todo[] = [];
	const lines = content.split(/\r?\n/);
	let list = "";
	let section = "";
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const h2 = line.match(/^##\s+(.+?)\s*$/);
		const h3 = line.match(/^###\s+(.+?)\s*$/);
		if (h3) {
			section = h3[1].trim();
			continue;
		}
		if (h2) {
			list = h2[1].trim();
			section = "";
			continue;
		}
		const t = parseTodoLine(line, i);
		if (!t) continue;
		const desc: string[] = [];
		while (i + 1 < lines.length) {
			const next = lines[i + 1];
			if (next.trim() !== "" && /^\s/.test(next) && !TODO_LINE_RE.test(next)) {
				desc.push(next.replace(/^\s+/, ""));
				i++;
			} else break;
		}
		if (list) t.list = list;
		if (section) t.section = section;
		if (desc.length) t.description = desc.join("\n");
		todos.push(t);
	}
	return todos;
}

export function serializeTodo(
	text: string,
	priority: Priority,
	due: string | null,
	time: string | null = null
): string {
	let line = `- [ ] ${text.trim()}`;
	if (priority !== Priority.None) line += ` ${PRIORITY_EMOJI[priority]}`;
	if (due) line += ` 📅 ${due}`;
	if (time) line += ` ⏰ ${time}`;
	return line;
}

/** Riscrive la riga di una task con nuovi campi, preservando indentazione,
   stato di completamento e data di completamento (la descrizione, su righe a
   parte, non viene toccata). I campi non passati restano quelli attuali. */
export function updateTodoLine(
	todo: Todo,
	fields: { text?: string; priority?: Priority; due?: string | null; time?: string | null }
): string {
	const indent = todo.raw.match(/^(\s*)/)?.[1] ?? "";
	const box = todo.done ? "x" : " ";
	const text = (fields.text ?? todo.text).trim();
	const priority = fields.priority ?? todo.priority;
	const due = fields.due !== undefined ? fields.due : todo.due;
	const time = fields.time !== undefined ? fields.time : todo.time;
	let line = `${indent}- [${box}] ${text}`;
	if (priority !== Priority.None) line += ` ${PRIORITY_EMOJI[priority]}`;
	if (due) line += ` 📅 ${due}`;
	if (time) line += ` ⏰ ${time}`;
	if (todo.done && todo.doneDate) line += ` ✅ ${todo.doneDate}`;
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

/* ---------- streak / cronologia ---------- */

/** Completamenti registrati in una certa data (0 se nessuno). */
export function countOn(counts: Map<string, number>, date: string): number {
	return counts.get(date) ?? 0;
}

/**
 * Streak a periodi: un "periodo" lungo `cadence` giorni è fatto se almeno uno
 * dei suoi giorni raggiunge `goal` completamenti. Conta a ritroso da oggi
 * (o dal periodo precedente se quello corrente non è ancora fatto).
 */
export function streak(
	counts: Map<string, number>,
	today: string,
	goal = 1,
	cadence = 1
): number {
	const dayDone = (d: string) => countOn(counts, d) >= goal;
	const periodDone = (end: string) => {
		for (let i = 0; i < cadence; i++) {
			if (dayDone(addDays(end, -i))) return true;
		}
		return false;
	};
	let end = periodDone(today) ? today : addDays(today, -cadence);
	let count = 0;
	while (periodDone(end)) {
		count++;
		end = addDays(end, -cadence);
	}
	return count;
}

/** true se l'abitudine a termine ha superato la sua durata. */
export function habitExpired(habit: Habit, today: string): boolean {
	return (
		habit.duration > 0 &&
		!!habit.start &&
		today >= addDays(habit.start, habit.duration)
	);
}

/* ---------- scrittura del frontmatter di Habits.md ---------- */

/** Slug univoco dal nome: minuscole, senza accenti, solo a-z0-9 e trattini. */
export function slugifyHabitId(name: string): string {
	const s = name
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return s || "abitudine";
}

function yamlValue(s: string): string {
	return /[:#"']/.test(s) ? `"${s.replace(/"/g, "'")}"` : s;
}

/** Sottoinsieme di Habit usato quando si aggiunge/serializza un'abitudine. */
type HabitSeed = { id: string; name: string; emoji?: string; icon?: string };

function habitItemLines(habit: HabitSeed): string[] {
	const lines = [`  - id: ${habit.id}`, `    name: ${yamlValue(habit.name)}`];
	if (habit.emoji) lines.push(`    emoji: "${habit.emoji.replace(/"/g, "")}"`);
	if (habit.icon) lines.push(`    icon: ${habit.icon}`);
	return lines;
}

/** Indice (esclusivo) della fine del blocco indentato che inizia alla riga `idx`. */
function habitsBlockEnd(lines: string[], idx: number): number {
	let end = idx + 1;
	while (end < lines.length && (/^\s/.test(lines[end]) || lines[end].trim() === "")) end++;
	while (end > idx + 1 && lines[end - 1].trim() === "") end--;
	return end;
}

export function addHabitToFrontmatter(content: string, habit: HabitSeed): string {
	const item = habitItemLines(habit);
	const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fm) {
		return ["---", "habits:", ...item, "---", ""].join("\n") + content;
	}
	const lines = fm[1].split(/\r?\n/);
	const idx = lines.findIndex((l) => /^habits:\s*(\[\s*\])?\s*$/.test(l));
	if (idx < 0) {
		lines.push("habits:", ...item);
	} else {
		lines[idx] = "habits:";
		lines.splice(habitsBlockEnd(lines, idx), 0, ...item);
	}
	return content.replace(fm[0], `---\n${lines.join("\n")}\n---`);
}

export function removeHabitFromFrontmatter(content: string, id: string): string {
	const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fm) return content;
	const lines = fm[1].split(/\r?\n/);
	const idx = lines.findIndex((l) => /^habits:\s*$/.test(l));
	if (idx < 0) return content;
	const end = habitsBlockEnd(lines, idx);
	const items: number[] = [];
	for (let i = idx + 1; i < end; i++) {
		if (/^\s*-\s+\w+:/.test(lines[i])) items.push(i);
	}
	for (let k = 0; k < items.length; k++) {
		const start = items[k];
		const stop = k + 1 < items.length ? items[k + 1] : end;
		for (let i = start; i < stop; i++) {
			const m = lines[i].match(/^\s*(?:-\s+)?id:\s*(.*)$/);
			if (m && unquote(m[1]) === id) {
				lines.splice(start, stop - start);
				return content.replace(fm[0], `---\n${lines.join("\n")}\n---`);
			}
		}
	}
	return content;
}

export function setHabitIconInFrontmatter(
	content: string,
	id: string,
	iconName: string
): string {
	return setHabitFieldsInFrontmatter(content, id, { icon: iconName });
}

export function setHabitFieldsInFrontmatter(
	content: string,
	id: string,
	fields: Record<string, string | number>
): string {
	const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fm) return content;
	const lines = fm[1].split(/\r?\n/);
	const idx = lines.findIndex((l) => /^habits:\s*$/.test(l));
	if (idx < 0) return content;
	const end = habitsBlockEnd(lines, idx);
	const items: number[] = [];
	for (let i = idx + 1; i < end; i++) {
		if (/^\s*-\s+\w+:/.test(lines[i])) items.push(i);
	}
	const keys = Object.keys(fields).filter((k) => k !== "id");
	for (let k = 0; k < items.length; k++) {
		const start = items[k];
		const stop = k + 1 < items.length ? items[k + 1] : end;
		let found = false;
		for (let i = start; i < stop; i++) {
			const m = lines[i].match(/^\s*(?:-\s+)?id:\s*(.*)$/);
			if (m && unquote(m[1]) === id) {
				found = true;
				break;
			}
		}
		if (!found) continue;
		let removed = 0;
		for (let i = stop - 1; i > start; i--) {
			const m = lines[i].match(/^\s+(\w+):/);
			if (m && !/^\s*-/.test(lines[i]) && keys.includes(m[1])) {
				lines.splice(i, 1);
				removed++;
			}
		}
		const insert: string[] = [];
		for (const key of keys) {
			const v = fields[key];
			if (v === "" || v == null) continue;
			// una lista già serializzata (es. reminders) passa senza virgolette
			const sval = String(v);
			insert.push(`    ${key}: ${sval.startsWith("[") ? sval : yamlValue(sval)}`);
		}
		lines.splice(stop - removed, 0, ...insert);
		return content.replace(fm[0], `---\n${lines.join("\n")}\n---`);
	}
	return content;
}

/** Parser YAML generico per una lista di item indentati sotto `key:`. */
function parseFmItems(content: string, key: string): Record<string, string>[] {
	const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fm) return [];
	const items: Record<string, string>[] = [];
	let cur: Record<string, string> | null = null;
	let inKey = false;
	const push = () => {
		if (cur) items.push(cur);
		cur = null;
	};
	for (const line of fm[1].split(/\r?\n/)) {
		if (new RegExp(`^${key}:\\s*$`).test(line)) {
			inKey = true;
			continue;
		}
		if (!inKey) continue;
		if (/^\S/.test(line)) {
			push();
			inKey = false;
			continue;
		}
		const item = line.match(/^\s*-\s+(\w+):\s*(.*)$/);
		const field = line.match(/^\s+(\w+):\s*(.*)$/);
		if (item) {
			push();
			cur = {};
			cur[item[1]] = unquote(item[2]);
		} else if (field && cur) {
			cur[field[1]] = unquote(field[2]);
		}
	}
	push();
	return items;
}

/** Categorie definite nel frontmatter (chiave `categories:`), una per icona. */
export function parseCategories(content: string): Category[] {
	return parseFmItems(content, "categories")
		.filter((c) => c.icon)
		.map((c) => ({ icon: c.icon, name: c.name ?? "" }));
}

export function setCategoryNameInFrontmatter(
	content: string,
	icon: string,
	name: string
): string {
	const item = [`  - icon: ${icon}`, `    name: ${yamlValue(name)}`];
	const fm = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!fm) {
		return ["---", "categories:", ...item, "---", ""].join("\n") + content;
	}
	const lines = fm[1].split(/\r?\n/);
	const idx = lines.findIndex((l) => /^categories:\s*(\[\s*\])?\s*$/.test(l));
	if (idx < 0) {
		lines.push("categories:", ...item);
	} else {
		lines[idx] = "categories:";
		const end = habitsBlockEnd(lines, idx);
		const items: number[] = [];
		for (let i = idx + 1; i < end; i++) {
			if (/^\s*-\s+\w+:/.test(lines[i])) items.push(i);
		}
		let replaced = false;
		for (let k = 0; k < items.length; k++) {
			const start = items[k];
			const stop = k + 1 < items.length ? items[k + 1] : end;
			let match = false;
			for (let i = start; i < stop; i++) {
				const m = lines[i].match(/^\s*(?:-\s+)?icon:\s*(.*)$/);
				if (m && unquote(m[1]) === icon) {
					match = true;
					break;
				}
			}
			if (match) {
				lines.splice(start, stop - start, ...item);
				replaced = true;
				break;
			}
		}
		if (!replaced) lines.splice(end, 0, ...item);
	}
	return content.replace(fm[0], `---\n${lines.join("\n")}\n---`);
}
