import { Category, Habit, HabitLog, Priority, Todo } from "./types";

/* Pure parser (no Obsidian dependency): the same logic is mirrored in Kotlin in
   the Android app (MarkdownParser.kt). If you change something here, mirror it
   there and in docs/DATA_FORMAT.md. */

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

/** Normalize "9:0" → "09:00"; drop non-time values. */
export function normalizeTime(s: string): string | null {
	const m = s.trim().match(/^(\d{1,2}):(\d{1,2})$/);
	if (!m) return null;
	const h = Math.min(23, Number(m[1]));
	const min = Math.min(59, Number(m[2]));
	return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** Read a list of times from `reminders: ["09:00", "21:00"]` (or plain CSV). */
export function parseTimeList(raw: string | undefined): string[] {
	if (!raw) return [];
	const inner = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
	return inner
		.split(",")
		.map((x) => normalizeTime(unquote(x)))
		.filter((x): x is string => x !== null);
}

/** Serialize a list of times as an inline YAML array. */
export function serializeTimeList(times: string[]): string {
	return `[${times.map((t) => `"${t}"`).join(", ")}]`;
}

/** Extract habits from the YAML frontmatter of Habits.md (constrained format, see DATA_FORMAT.md). */
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
			// new top-level key: end of the habits list
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
			// reminders is an inline list: don't unquote
			cur[field[1]] = field[1] === "reminders" ? field[2] : unquote(field[2]);
		}
	}
	push();
	return habits;
}

/** Count completions per habit and per day (duplicate lines add up). */
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

/** Add or remove the log line for (date, habit). Returns the new content. */
export function toggleLog(content: string, date: string, habitId: string): string {
	const target = logLine(date, habitId);
	const lines = content.split(/\r?\n/);
	const idx = lines.findIndex((l) => l.trim() === target);
	if (idx >= 0) {
		lines.splice(idx, 1);
	} else {
		// append after the last non-empty line
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
	const timeMatch = rest.match(TIME_RE)?.[1];
	const time = timeMatch ? normalizeTime(timeMatch) : null;

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
 * Read Todo.md with sub-folders and descriptions:
 * - `## List` → first-level sub-folder
 * - `### Section` → second-level sub-folder
 * - indented (non-task) lines right under a task → description (with markdown links)
 */
export function parseTodos(content: string): Todo[] {
	const todos: Todo[] = [];
	const lines = content.split(/\r?\n/);
	let list = "";
	let section = "";
	let source = "";
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const h2 = line.match(/^##\s+(.+?)\s*$/);
		const h3 = line.match(/^###\s+(.+?)\s*$/);
		if (h3) {
			section = h3[1].trim();
			continue;
		}
		if (h2) {
			// `## [[Note]]` = tasks exported from a note: the list takes its title
			const src = parseSourceHeading(h2[1]);
			list = src ? src.title : h2[1].trim();
			source = src ? src.source : "";
			section = "";
			continue;
		}
		const t = parseTodoLine(line, i);
		if (!t) continue;
		// description: indented, non-task lines right below
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
		if (source) t.source = source;
		if (desc.length) t.description = desc.join("\n");
		todos.push(t);
	}
	return todos;
}

/* ---------- tasks exported from a note ---------- */

/** Heading text `[[path/to/Note]]` or `[[path/to/Note|Title]]`. */
const SOURCE_HEADING_RE = /^\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]$/;

/** Read a `##` heading as a link to the note its tasks were exported from. */
export function parseSourceHeading(heading: string): { source: string; title: string } | null {
	const m = heading.trim().match(SOURCE_HEADING_RE);
	if (!m) return null;
	const source = m[1].trim().replace(/\.md$/i, "");
	const title = (m[2] ?? source.split("/").pop() ?? source).trim();
	return { source, title };
}

/** The `##` heading for the tasks of the note at `path` (vault-relative). */
export function sourceHeading(path: string): string {
	const source = path.replace(/\.md$/i, "");
	const title = source.split("/").pop() ?? source;
	return source === title ? `## [[${source}]]` : `## [[${source}|${title}]]`;
}

/**
 * Open tasks of a note, ready to be copied into Todo.md: one block per task
 * (the task flattened to the top level, then its description — the lines
 * indented deeper right below it — tab-indented). Done tasks and fenced code
 * blocks are skipped; `from`/`to` limit the scan to a line range (inclusive).
 */
export function extractNoteTasks(content: string, from = 0, to = Infinity): string[][] {
	const lines = content.split(/\r?\n/);
	const blocks: string[][] = [];
	let fence = "";
	let cur: { indent: number; lines: string[] } | null = null;
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const f = line.match(/^\s*(`{3,}|~{3,})/);
		if (f) {
			if (!fence) fence = f[1][0];
			else if (f[1][0] === fence) fence = "";
			cur = null;
			continue;
		}
		if (fence || i < from || i > to) {
			cur = null;
			continue;
		}
		const m = line.match(TODO_LINE_RE);
		if (m) {
			cur = null;
			const text = m[3].trim();
			if (m[2] !== " " || !text) continue;
			const block = [`- [ ] ${text}`];
			blocks.push(block);
			cur = { indent: m[1].length, lines: block };
		} else if (cur && line.trim() !== "" && (line.match(/^\s*/)?.[0].length ?? 0) > cur.indent) {
			cur.lines.push(`\t${line.trim()}`);
		} else {
			cur = null;
		}
	}
	return blocks;
}

/**
 * Add task blocks (from `extractNoteTasks`) to the Todo.md section of the note
 * at `path`, creating the section at the end of the file when missing. Tasks
 * already in the section (same text, done or not) are skipped, so exporting
 * the same note twice doesn't duplicate anything.
 */
export function addSourceTasks(
	content: string,
	path: string,
	blocks: string[][]
): { content: string; added: number } {
	const source = path.replace(/\.md$/i, "");
	const lines = content.split(/\r?\n/);
	let start = -1;
	let end = lines.length;
	for (let i = 0; i < lines.length; i++) {
		const h2 = lines[i].match(/^##\s+(.+?)\s*$/);
		if (start < 0 && h2 && parseSourceHeading(h2[1])?.source === source) {
			start = i;
		} else if (start >= 0 && /^#{1,2}\s/.test(lines[i])) {
			end = i;
			break;
		}
	}

	const seen = new Set<string>();
	if (start >= 0) {
		for (let i = start + 1; i < end; i++) {
			const t = parseTodoLine(lines[i], i);
			if (t) seen.add(t.text);
		}
	}
	const fresh = blocks.filter((b) => {
		const t = parseTodoLine(b[0], 0);
		if (!t || seen.has(t.text)) return false;
		seen.add(t.text);
		return true;
	});
	if (fresh.length === 0) return { content, added: 0 };

	if (start < 0) {
		let last = lines.length - 1;
		while (last >= 0 && lines[last].trim() === "") last--;
		const head = lines.slice(0, last + 1);
		if (head.length) head.push("");
		head.push(sourceHeading(path), "", ...fresh.flat(), "");
		return { content: head.join("\n"), added: fresh.length };
	}
	let at = end;
	while (at > start + 1 && lines[at - 1].trim() === "") at--;
	lines.splice(at, 0, ...fresh.flat());
	return { content: lines.join("\n"), added: fresh.length };
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

/** Rewrite a task line with new fields, preserving indentation, done state
   and done date (the description, on separate lines, is left untouched). */
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

/** Toggle a task line's done state. `today` in ISO format. */
export function toggleTodoLine(line: string, today: string): string {
	const m = line.match(TODO_LINE_RE);
	if (!m) return line;
	const done = m[2].toLowerCase() === "x";
	if (done) {
		return `${m[1]}- [ ] ${m[3].replace(DONE_RE, "").replace(/\s{2,}/g, " ").trim()}`;
	}
	return `${m[1]}- [x] ${m[3].trim()} ✅ ${today}`;
}

/** Replace the first line in the content equal to `raw` with the result of `fn`. */
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

/* ---------- date helpers (local, no UTC timezone) ---------- */

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

/* ---------- streak / history ---------- */

/** Completions recorded on a given date (0 if none). */
export function countOn(counts: Map<string, number>, date: string): number {
	return counts.get(date) ?? 0;
}

/**
 * Period-based streak: a "period" of `cadence` days is done if at least one of
 * its days reaches `goal` completions. Counts backwards from today (or from the
 * previous period if the current one isn't done yet).
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

/** true if a fixed-term habit has passed its duration. */
export function habitExpired(habit: Habit, today: string): boolean {
	return (
		habit.duration > 0 &&
		!!habit.start &&
		today >= addDays(habit.start, habit.duration)
	);
}

/* ---------- writing the Habits.md frontmatter ---------- */

/** Unique slug from the name: lowercase, no accents, only a-z0-9 and hyphens. */
export function slugifyHabitId(name: string): string {
	const s = name
		.toLowerCase()
		.normalize("NFD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	return s || "habit";
}

function yamlValue(s: string): string {
	return /[:#"']/.test(s) ? `"${s.replace(/"/g, "'")}"` : s;
}

/** Subset of Habit used when adding/serializing a habit. */
type HabitSeed = { id: string; name: string; emoji?: string; icon?: string };

function habitItemLines(habit: HabitSeed): string[] {
	const lines = [`  - id: ${habit.id}`, `    name: ${yamlValue(habit.name)}`];
	if (habit.emoji) lines.push(`    emoji: "${habit.emoji.replace(/"/g, "")}"`);
	if (habit.icon) lines.push(`    icon: ${habit.icon}`);
	return lines;
}

/** Exclusive end index of the indented block starting at line `idx`. */
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
			if (/^\s+icon:/.test(lines[i]) && !/^\s*-/.test(lines[i])) {
				lines.splice(i, 1);
				removed++;
			}
		}
		if (iconName) lines.splice(stop - removed, 0, `    icon: ${iconName}`);
		return content.replace(fm[0], `---\n${lines.join("\n")}\n---`);
	}
	return content;
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
			const sval = String(v);
			// an already-serialized list (e.g. reminders) passes through unquoted
			insert.push(`    ${key}: ${sval.startsWith("[") ? sval : yamlValue(sval)}`);
		}
		lines.splice(stop - removed, 0, ...insert);
		return content.replace(fm[0], `---\n${lines.join("\n")}\n---`);
	}
	return content;
}

/** Generic YAML parser for a list of items indented under `key:`. */
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

/** Categories defined in the frontmatter (key `categories:`), one per icon. */
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
