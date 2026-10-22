import { Priority } from "./types";
import { TodoGroupId } from "./viewmodel";

/* i18n condiviso (minimale): etichette usate dal view-model e dai client.
   I client possono comunque avere stringhe proprie. */

export type Lang = "en" | "it";

export function locale(lang: Lang): string {
	return lang === "it" ? "it-IT" : "en-GB";
}

export const GROUP_LABEL: Record<TodoGroupId, { en: string; it: string }> = {
	today: { en: "Today", it: "Oggi" },
	next7: { en: "Next 7 days", it: "Prossimi 7 giorni" },
	later: { en: "Later", it: "Più avanti" },
	overdue: { en: "Overdue", it: "In ritardo" },
	nodate: { en: "No date", it: "Senza data" },
};

export const PRIORITY_LABEL: Record<Priority, { en: string; it: string }> = {
	[Priority.Highest]: { en: "highest", it: "massima" },
	[Priority.High]: { en: "high", it: "alta" },
	[Priority.Medium]: { en: "medium", it: "media" },
	[Priority.None]: { en: "normal", it: "normale" },
	[Priority.Low]: { en: "low", it: "bassa" },
	[Priority.Lowest]: { en: "lowest", it: "minima" },
};

export const UI = {
	habits: { en: "Habits", it: "Abitudini" },
	tasks: { en: "Tasks", it: "Attività" },
	todos: { en: "To-do", it: "Todo" },
	history: { en: "History", it: "Cronologia" },
	today: { en: "Today", it: "Oggi" },
	allDone: { en: "All done", it: "Tutto fatto" },
	noHabits: { en: "No habits yet.", it: "Nessuna abitudine." },
	newTask: { en: "New task…", it: "Nuova attività…" },
	newHabit: { en: "New habit…", it: "Nuova abitudine…" },
	add: { en: "Add", it: "Aggiungi" },
	inbox: { en: "Inbox", it: "Inbox" },
	completed: { en: "Completed", it: "Completate" },
	settings: { en: "Settings", it: "Impostazioni" },
	perDay: { en: "Times per day", it: "Volte al giorno" },
	freeCount: { en: "Free count", it: "Conteggio libero" },
	cadence: { en: "Every N days", it: "Ogni N giorni" },
	reminders: { en: "Reminders", it: "Promemoria" },
	dueToday: { en: "today", it: "oggi" },
	tomorrow: { en: "tomorrow", it: "domani" },
} as const;

export function groupLabel(id: TodoGroupId, lang: Lang): string {
	return GROUP_LABEL[id][lang];
}

export function ui(key: keyof typeof UI, lang: Lang): string {
	return UI[key][lang];
}
