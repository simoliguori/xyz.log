import { Priority } from "./types";

export type Lang = "en" | "it";

let LANG: Lang = "en";
export function setLang(l: Lang): void {
	LANG = l === "it" ? "it" : "en";
}
export function getLang(): Lang {
	return LANG;
}
export function locale(): string {
	return LANG === "it" ? "it-IT" : "en-GB";
}

/** Static strings: key → { en, it }. */
const S = {
	habits: { en: "Habits", it: "Abitudini" },
	todos: { en: "To-do", it: "Todo" },
	tasks: { en: "Tasks", it: "Task" },
	history: { en: "History", it: "Cronologia" },
	today: { en: "Today", it: "Oggi" },
	dueToday: { en: "today", it: "oggi" },
	newHabit: { en: "New habit…", it: "Nuova abitudine…" },
	newTask: { en: "New task…", it: "Nuova attività…" },
	priority: { en: "priority", it: "priorità" },
	add: { en: "Add", it: "Aggiungi" },
	noHabits: { en: "No habits yet. Add one above.", it: "Nessuna abitudine. Aggiungila qui sopra." },
	noHabitsShort: { en: "No habits.", it: "Nessuna abitudine." },
	allDone: { en: "All done ✨", it: "Tutto fatto ✨" },
	overdue: { en: "Overdue", it: "In ritardo" },
	next7: { en: "Next 7 days", it: "Prossimi 7 giorni" },
	later: { en: "Later", it: "Più avanti" },
	noDate: { en: "No date", it: "Senza data" },
	renameCategory: { en: "Rename category", it: "Rinomina categoria" },
	chooseIcon: { en: "Choose an icon (optional)", it: "Scegli un'icona (opzionale)" },
	searchIcon: { en: "Search an icon…", it: "Cerca un'icona…" },
	none: { en: "None", it: "Nessuna" },
	reopen: { en: "Reopen", it: "Riapri" },
	complete: { en: "Complete", it: "Completa" },
	delete: { en: "Delete", it: "Elimina" },
	settings: { en: "Settings", it: "Impostazioni" },
	editTask: { en: "Edit task", it: "Modifica attività" },
	save: { en: "Save", it: "Salva" },
	cancel: { en: "Cancel", it: "Annulla" },
	clickToRename: { en: "Click to rename", it: "Clicca per rinominare" },
	category: { en: "Category", it: "Categoria" },
	noCategory: { en: "No category", it: "Nessuna categoria" },
	hideSettings: { en: "Hide settings", it: "Nascondi impostazioni" },
	perDay: { en: "Times per day", it: "Volte al giorno" },
	freeCount: { en: "Free count (unlimited)", it: "Conteggio libero (infinito)" },
	cadence: { en: "Every N days", it: "Ogni N giorni" },
	reminders: { en: "Reminders", it: "Promemoria" },
	dueDate: { en: "Due date", it: "Scadenza" },
	inbox: { en: "Inbox", it: "Inbox" },
	// priorities
	prioHighest: { en: "highest", it: "massima" },
	prioHigh: { en: "high", it: "alta" },
	prioMedium: { en: "medium", it: "media" },
	prioNone: { en: "normal", it: "normale" },
	prioLow: { en: "low", it: "bassa" },
	prioLowest: { en: "lowest", it: "minima" },
	// settings
	setFolderName: { en: "Data folder", it: "Cartella dei dati" },
	setFolderDesc: {
		en: "Vault folder containing Habits.md, Habit Log.md and Todo.md.",
		it: "Cartella del vault che contiene Habits.md, Habit Log.md e Todo.md.",
	},
	setHeatmapName: { en: "Heatmap weeks", it: "Settimane nella heatmap" },
	setHeatmapDesc: {
		en: "How many weeks of history to show when a habit is expanded (52 ≈ GitHub).",
		it: "Quante settimane di cronologia mostrare quando espandi un'abitudine (52 ≈ come GitHub).",
	},
	setLangName: { en: "Language", it: "Lingua" },
	setLangDesc: { en: "Interface language.", it: "Lingua dell'interfaccia." },
	// import TickTick
	setImportName: { en: "Import from TickTick", it: "Importa da TickTick" },
	setImportDesc: {
		en: "Bring your TickTick tasks into Todo.md from a backup CSV.",
		it: "Porta le tue attività TickTick in Todo.md da un backup CSV.",
	},
	importButton: { en: "Choose CSV…", it: "Scegli CSV…" },
	importTickTickTitle: { en: "Import from TickTick", it: "Importa da TickTick" },
	importTickTickHelp: {
		en: "In TickTick: Settings → Backup → download the CSV, then pick it here. Tasks are added to Todo.md, grouped by list; your habits are untouched.",
		it: "In TickTick: Impostazioni → Backup → scarica il CSV, poi selezionalo qui. Le attività vengono aggiunte a Todo.md, raggruppate per lista; le abitudini non vengono toccate.",
	},
	importAction: { en: "Import", it: "Importa" },
	importNothing: {
		en: "No tasks found. Make sure it's a TickTick backup CSV.",
		it: "Nessuna attività trovata. Assicurati che sia un backup CSV di TickTick.",
	},
	// commands / ribbon
	openTracker: { en: "Open xyz.log", it: "Apri xyz.log" },
	insertBlock: { en: "Insert xyz.log block", it: "Inserisci blocco xyz.log" },
	// export tasks from a note
	exportTasks: { en: "Export tasks into xyz.log", it: "Esporta le task in xyz.log" },
	exportNone: { en: "No open tasks to export here.", it: "Nessuna task aperta da esportare qui." },
	exportUpToDate: {
		en: "These tasks are already in xyz.log.",
		it: "Queste task sono già in xyz.log.",
	},
	openNote: { en: "Open the note", it: "Apri la nota" },
} as const;

export function t(key: keyof typeof S): string {
	return S[key][LANG];
}

const PRIO_KEY: Record<Priority, keyof typeof S> = {
	[Priority.Highest]: "prioHighest",
	[Priority.High]: "prioHigh",
	[Priority.Medium]: "prioMedium",
	[Priority.None]: "prioNone",
	[Priority.Low]: "prioLow",
	[Priority.Lowest]: "prioLowest",
};
export function prioLabel(p: Priority): string {
	return t(PRIO_KEY[p]);
}

/** Parameterized strings. */
export const tf = {
	iconsCount: (n: number) => (LANG === "it" ? `${n} icone` : `${n} icons`),
	heatmapCaption: (done: number, weeks: number) =>
		LANG === "it"
			? `${done} completamenti nelle ultime ${weeks} settimane`
			: `${done} completions in the last ${weeks} weeks`,
	completed: (n: number) => (LANG === "it" ? `Completate (${n})` : `Completed (${n})`),
	markToday: (name: string) =>
		LANG === "it" ? `Segna ${name} per oggi` : `Mark ${name} for today`,
	decrementNamed: (name: string) =>
		LANG === "it" ? `Togli un conteggio a ${name}` : `Remove one from ${name}`,
	deleteNamed: (name: string) => (LANG === "it" ? `Elimina ${name}` : `Delete ${name}`),
	iconOf: (name: string) => (LANG === "it" ? `Icona di ${name}` : `Icon of ${name}`),
	deleteHabitConfirm: (name: string) =>
		LANG === "it"
			? `Eliminare l'abitudine "${name}"? La cronologia in Habit Log resta intatta.`
			: `Delete habit "${name}"? Its history in Habit Log is kept.`,
	habitNotFound: (id: string, path: string) =>
		LANG === "it"
			? `Abitudine "${id}" non trovata in ${path}.`
			: `Habit "${id}" not found in ${path}.`,
	importFound: (tasks: number, lists: number) =>
		LANG === "it"
			? `Trovate ${tasks} attività in ${lists} liste.`
			: `Found ${tasks} tasks across ${lists} lists.`,
	exported: (n: number, note: string) =>
		LANG === "it"
			? `${n === 1 ? "1 task esportata" : `${n} task esportate`} da "${note}" in xyz.log.`
			: `Exported ${n === 1 ? "1 task" : `${n} tasks`} from "${note}" into xyz.log.`,
	importDone: (n: number) =>
		LANG === "it" ? `Importate ${n} attività da TickTick.` : `Imported ${n} tasks from TickTick.`,
};
