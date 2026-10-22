import { addDays, streak } from "./parser";
import { Category, Habit, HabitLog, Priority, Todo, TrackerData } from "./types";

/* View-model puro e condiviso: trasforma i dati grezzi del tracker in strutture
   pronte da disegnare (gruppi di task, righe abitudini con streak/striscia).
   Nessuna dipendenza dal DOM: ogni client disegna a modo suo. */

export type TodoGroupId = "today" | "next7" | "later" | "overdue" | "nodate";

export interface TodoGroup {
	id: TodoGroupId;
	todos: Todo[];
	/** true per il gruppo degli eventi scaduti/mancati (stile visivo d'allerta) */
	overdue: boolean;
}

/**
 * Ordine dei gruppi: gli eventi con una data **futura** (e quelli di oggi) stanno
 * **sopra** quelli **mancati/scaduti**; le task senza data chiudono in fondo.
 * (Richiesta esplicita: futuro sopra, missati sotto.)
 */
const GROUP_ORDER: TodoGroupId[] = ["today", "next7", "later", "overdue", "nodate"];

function sortDated(a: Todo, b: Todo): number {
	const d = (a.due ?? "9999").localeCompare(b.due ?? "9999");
	if (d !== 0) return d;
	const t = (a.time ?? "99:99").localeCompare(b.time ?? "99:99");
	if (t !== 0) return t;
	return a.priority - b.priority;
}

function sortByPriority(a: Todo, b: Todo): number {
	return a.priority - b.priority || (a.time ?? "99:99").localeCompare(b.time ?? "99:99");
}

/** Raggruppa le task aperte per scadenza, col nuovo ordinamento (futuro sopra i missati). */
export function groupTodos(todos: Todo[], today: string): TodoGroup[] {
	const week = addDays(today, 7);
	const open = todos.filter((t) => !t.done);
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
		list.sort(id === "nodate" ? sortByPriority : sortDated);
		groups.push({ id, todos: list, overdue: id === "overdue" });
	}
	return groups;
}

/** Task completate, più recenti prima (per la sezione "Completate"). */
export function doneTodos(todos: Todo[], limit = 30): Todo[] {
	return todos
		.filter((t) => t.done)
		.sort((a, b) => (b.doneDate ?? "").localeCompare(a.doneDate ?? ""))
		.slice(0, limit);
}

/** Task aperte raggruppate per lista → sezione (vista a cartelle). */
export interface FolderView {
	list: string;
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
		out.push({
			list,
			sections: [...secs.entries()].map(([section, todos]) => ({ section, todos })),
		});
	}
	return out;
}

/* ---------------- Abitudini ---------------- */

export interface HabitView {
	habit: Habit;
	counts: Map<string, number>;
	doneToday: boolean;
	countToday: number;
	streak: number;
	/** ultimi N giorni (più vecchio → oggi): true se raggiunto il goal */
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

/** Un gruppo di abitudini: una categoria (icona condivisa da ≥2) o una singola. */
export interface HabitGroup {
	/** categoria quando ≥2 abitudini condividono l'icona, altrimenti null */
	category: { icon: string; name: string } | null;
	habits: HabitView[];
}

/**
 * Abitudini raggruppate come nel plugin: quando ≥2 abitudini condividono la
 * stessa icona formano una categoria (nome preso da `categories:` o dall'icona).
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

/* ---------------- Promemoria (notifiche) ---------------- */

export interface Reminder {
	kind: "habit" | "todo";
	id: string;
	title: string;
	/** "HH:mm" */
	time: string;
	/** solo per i todo: la data dell'evento (i promemoria abitudine sono giornalieri) */
	date?: string;
}

/**
 * Elenco di tutti i promemoria dichiarati nei dati:
 * - abitudini con `reminders: ["HH:mm", …]` → uno al giorno per orario;
 * - todo aperti con `📅 data ⏰ orario` → un promemoria all'orario di quel giorno.
 * I client lo usano per programmare le notifiche native.
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
