import { addDays, streak } from "./parser";
import { Category, Habit, HabitLog, Priority, Todo, TrackerData } from "./types";

/* Pure, shared view-model: turns raw tracker data into draw-ready structures
   (task groups, habit rows with streak/strip). No DOM dependency: each client
   renders it its own way. */

export type TodoGroupId = "today" | "next7" | "later" | "overdue" | "nodate";

export interface TodoGroup {
	id: TodoGroupId;
	todos: Todo[];
	/** true for the overdue/missed group (alert styling) */
	overdue: boolean;
}

/**
 * Group order: events with a **future** date (and today's) sit **above** the
 * **missed/overdue** ones; undated tasks go last.
 */
const GROUP_ORDER: TodoGroupId[] = ["today", "next7", "later", "overdue", "nodate"];

function sortDated(a: Todo, b: Todo): number {
	const d = (a.due ?? "9999").localeCompare(b.due ?? "9999");
	if (d !== 0) return d;
	const t = (a.time ?? "99:99").localeCompare(b.time ?? "99:99");
	if (t !== 0) return t;
	return a.priority - b.priority;
}

/** Group open tasks by due date, with the ordering above (future over missed). */
export function groupTodos(todos: Todo[], today: string): TodoGroup[] {
	const week = addDays(today, 7);
	// tasks exported from a note have their own section (groupTodosBySource)
	const open = todos.filter((t) => !t.done && !t.source);
	const buckets: Record<TodoGroupId, Todo[]> = {
		today: open.filter((t) => t.due === today),
		next7: open.filter((t) => t.due && t.due > today && t.due <= week),
		later: open.filter((t) => t.due && t.due > week),
		overdue: open.filter((t) => t.due && t.due < today),
		nodate: open.filter((t) => !t.due),
	};
	const groups: TodoGroup[] = [];
	for (const id of GROUP_ORDER) {
		const list = buckets[id];
		if (list.length === 0) continue;
		// "no date": newest on top (reverse insertion order); the other groups by date/time.
		if (id === "nodate") list.sort((a, b) => b.lineNo - a.lineNo);
		else list.sort(sortDated);
		groups.push({ id, todos: list, overdue: id === "overdue" });
	}
	return groups;
}

/** Open tasks exported from a note (`## [[Note]]` in Todo.md), one group per note. */
export interface SourceGroup {
	/** vault path of the note (no `.md`), to open it */
	source: string;
	/** the note's title, used as the section heading */
	title: string;
	todos: Todo[];
}

/**
 * Exported tasks, grouped by note: these sections sit above every date group.
 * Latest export first (new sections are appended at the end of the file);
 * inside a section the tasks keep the note's order.
 */
export function groupTodosBySource(todos: Todo[]): SourceGroup[] {
	const groups = new Map<string, SourceGroup>();
	for (const t of todos) {
		if (t.done || !t.source) continue;
		let g = groups.get(t.source);
		if (!g) {
			g = { source: t.source, title: t.list ?? t.source, todos: [] };
			groups.set(t.source, g);
		}
		g.todos.push(t);
	}
	return [...groups.values()].reverse();
}

/** Completed tasks, most recent first (for the "Completed" section). */
export function doneTodos(todos: Todo[], limit = 30): Todo[] {
	return todos
		.filter((t) => t.done)
		.sort((a, b) => (b.doneDate ?? "").localeCompare(a.doneDate ?? ""))
		.slice(0, limit);
}

/** Open tasks grouped by list → section (folder view). */
export interface FolderView {
	list: string;
	/** set when the list holds tasks exported from a note (vault path, no `.md`) */
	source?: string;
	sections: { section: string; todos: Todo[] }[];
}

export function groupTodosByFolder(todos: Todo[], inboxLabel: string): FolderView[] {
	const open = todos.filter((t) => !t.done);
	const lists = new Map<string, Map<string, Todo[]>>();
	for (const td of open) {
		const l = td.list || inboxLabel;
		const s = td.section || "";
		if (!lists.has(l)) lists.set(l, new Map());
		const secs = lists.get(l)!;
		if (!secs.has(s)) secs.set(s, []);
		secs.get(s)!.push(td);
	}
	const out: FolderView[] = [];
	for (const [list, secs] of lists) {
		const sections = [...secs.entries()].map(([section, todos]) => ({ section, todos }));
		const source = sections[0].todos[0].source;
		out.push(source ? { list, source, sections } : { list, sections });
	}
	return out;
}

/* ---------------- Habits ---------------- */

export interface HabitView {
	habit: Habit;
	counts: Map<string, number>;
	doneToday: boolean;
	countToday: number;
	streak: number;
	/** last N days (oldest → today): true when the goal was reached */
	last: { date: string; done: boolean; today: boolean }[];
}

export function buildHabitView(
	habit: Habit,
	log: HabitLog,
	today: string,
	lastDays = 7
): HabitView {
	const counts = log.get(habit.id) ?? new Map<string, number>();
	const countToday = counts.get(today) ?? 0;
	const last: HabitView["last"] = [];
	for (let i = lastDays - 1; i >= 0; i--) {
		const d = addDays(today, -i);
		last.push({ date: d, done: (counts.get(d) ?? 0) >= habit.goal, today: d === today });
	}
	return {
		habit,
		counts,
		doneToday: !habit.countable && countToday >= habit.goal,
		countToday,
		streak: streak(counts, today, habit.goal, habit.cadence),
		last,
	};
}

/** A habit group: a category (icon shared by ≥2) or a single habit. */
export interface HabitGroup {
	/** category when ≥2 habits share the icon, otherwise null */
	category: { icon: string; name: string } | null;
	habits: HabitView[];
}

/**
 * Habits grouped as in the plugin: when ≥2 habits share the same icon they form
 * a category (name taken from `categories:` or from the icon).
 */
export function buildHabitGroups(data: TrackerData, today: string): HabitGroup[] {
	const byIcon = new Map<string, Habit[]>();
	for (const h of data.habits) {
		if (!h.icon) continue;
		if (!byIcon.has(h.icon)) byIcon.set(h.icon, []);
		byIcon.get(h.icon)!.push(h);
	}
	const catName = (icon: string) =>
		(data.categories ?? []).find((c) => c.icon === icon)?.name ||
		icon.replace(/^lucide-/, "");

	const groups: HabitGroup[] = [];
	const rendered = new Set<string>();
	for (const habit of data.habits) {
		const group = habit.icon ? byIcon.get(habit.icon) : null;
		if (group && group.length >= 2) {
			if (rendered.has(habit.icon)) continue;
			rendered.add(habit.icon);
			groups.push({
				category: { icon: habit.icon, name: catName(habit.icon) },
				habits: group.map((h) => buildHabitView(h, data.log, today)),
			});
		} else {
			groups.push({ category: null, habits: [buildHabitView(habit, data.log, today)] });
		}
	}
	return groups;
}

/* ---------------- Reminders (notifications) ---------------- */

export interface Reminder {
	kind: "habit" | "todo";
	id: string;
	title: string;
	/** "HH:mm" */
	time: string;
	/** todos only: the event date (habit reminders are daily) */
	date?: string;
}

/**
 * Every reminder declared in the data:
 * - habits with `reminders: ["HH:mm", …]` → one per day, per time;
 * - open todos with `📅 date ⏰ time` → one reminder at that day's time.
 * Clients use this list to schedule native notifications.
 */
export function collectReminders(data: TrackerData): Reminder[] {
	const out: Reminder[] = [];
	for (const h of data.habits) {
		for (const time of h.reminders) {
			out.push({ kind: "habit", id: h.id, title: h.name, time });
		}
	}
	for (const t of data.todos) {
		if (!t.done && t.due && t.time) {
			out.push({ kind: "todo", id: t.raw, title: t.text, time: t.time, date: t.due });
		}
	}
	return out;
}

export type { Category, Habit, HabitLog, Priority, Todo, TrackerData };
