// Task ordering for the To-do tile. "date" keeps the default date grouping; the
// others render a flat, sorted list. A separate "draggable" toggle lets the user
// override the order by hand (persisted by reordering Todo.md).

import { Priority, type Todo } from "@xyzlog/core";

export type TodoSort = "date" | "added-desc" | "added-asc" | "priority" | "due-asc" | "due-desc";

export const TODO_SORTS: TodoSort[] = ["date", "priority", "added-desc", "added-asc", "due-asc", "due-desc"];

/** Highest → Lowest, with "no priority" last. */
const PRIO_RANK: Record<Priority, number> = {
	[Priority.Highest]: 0,
	[Priority.High]: 1,
	[Priority.Medium]: 2,
	[Priority.Low]: 3,
	[Priority.Lowest]: 4,
	[Priority.None]: 5,
};

export function sortLabel(s: TodoSort, lang: "it" | "en"): string {
	const it = lang === "it";
	switch (s) {
		case "added-desc":
			return it ? "Aggiunta (recenti)" : "Added (newest)";
		case "added-asc":
			return it ? "Aggiunta (vecchie)" : "Added (oldest)";
		case "priority":
			return it ? "Priorità" : "Priority";
		case "due-asc":
			return it ? "Scadenza (vicina)" : "Due (nearest)";
		case "due-desc":
			return it ? "Scadenza (lontana)" : "Due (furthest)";
		default:
			return it ? "Per data" : "By date";
	}
}

const dueKey = (t: Todo) => t.due ?? "9999-99-99";

/** Comparator for a flat sort (not used for "date"). Ties break by insertion order. */
export function sortComparator(s: TodoSort): (a: Todo, b: Todo) => number {
	switch (s) {
		case "added-desc":
			return (a, b) => b.lineNo - a.lineNo;
		case "added-asc":
			return (a, b) => a.lineNo - b.lineNo;
		case "priority":
			return (a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || a.lineNo - b.lineNo;
		case "due-asc":
			return (a, b) => dueKey(a).localeCompare(dueKey(b)) || a.lineNo - b.lineNo;
		case "due-desc":
			return (a, b) => {
				// undated always last, regardless of direction
				if (!a.due && !b.due) return a.lineNo - b.lineNo;
				if (!a.due) return 1;
				if (!b.due) return -1;
				return b.due.localeCompare(a.due) || a.lineNo - b.lineNo;
			};
		default:
			return (a, b) => a.lineNo - b.lineNo;
	}
}
