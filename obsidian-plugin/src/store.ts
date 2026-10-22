import { App, TFile, normalizePath } from "obsidian";
import {
	addHabitToFrontmatter,
	appendLine,
	logLine,
	parseCategories,
	parseHabits,
	parseLog,
	parseTodos,
	removeHabitFromFrontmatter,
	replaceLine,
	serializeTodo,
	setCategoryNameInFrontmatter,
	setHabitFieldsInFrontmatter,
	serializeTimeList,
	setHabitIconInFrontmatter,
	slugifyHabitId,
	todayISO,
	toggleLog,
	toggleTodoLine,
} from "./parser";
import { Category, Habit, HabitLog, Priority, Todo } from "./types";

const HABITS_TEMPLATE = `---
habits:
  - id: esempio
    name: Esempio
    emoji: "✨"
---

# Abitudini

Definisci le abitudini nel frontmatter qui sopra (vedi docs/DATA_FORMAT.md del progetto).
`;

const LOG_TEMPLATE = `# Cronologia abitudini

`;

const TODO_TEMPLATE = `# Todo

- [ ] La mia prima attività 🔼 📅 ${todayISO()}
`;

export interface TrackerData {
	habits: Habit[];
	categories: Category[];
	log: HabitLog;
	todos: Todo[];
}

export class Store {
	constructor(private app: App, private getFolder: () => string) {}

	get habitsPath(): string {
		return normalizePath(`${this.getFolder()}/Habits.md`);
	}
	get logPath(): string {
		return normalizePath(`${this.getFolder()}/Habit Log.md`);
	}
	get todoPath(): string {
		return normalizePath(`${this.getFolder()}/Todo.md`);
	}

	isTrackedPath(path: string): boolean {
		return [this.habitsPath, this.logPath, this.todoPath].includes(path);
	}

	private async ensureFile(path: string, template: string): Promise<TFile> {
		const existing = this.app.vault.getFileByPath(path);
		if (existing) return existing;
		const folder = path.substring(0, path.lastIndexOf("/"));
		if (folder && !this.app.vault.getFolderByPath(folder)) {
			await this.app.vault.createFolder(folder);
		}
		return this.app.vault.create(path, template);
	}

	async ensureFiles(): Promise<void> {
		await this.ensureFile(this.habitsPath, HABITS_TEMPLATE);
		await this.ensureFile(this.logPath, LOG_TEMPLATE);
		await this.ensureFile(this.todoPath, TODO_TEMPLATE);
	}

	async readAll(): Promise<TrackerData> {
		await this.ensureFiles();
		const read = async (path: string) => {
			const f = this.app.vault.getFileByPath(path);
			return f ? this.app.vault.cachedRead(f) : "";
		};
		const habitsContent = await read(this.habitsPath);
		return {
			habits: parseHabits(habitsContent),
			categories: parseCategories(habitsContent),
			log: parseLog(await read(this.logPath)),
			todos: parseTodos(await read(this.todoPath)),
		};
	}

	private async process(path: string, fn: (data: string) => string) {
		const f = this.app.vault.getFileByPath(path);
		if (!f) return;
		await this.app.vault.process(f, fn);
	}

	async toggleHabit(habitId: string, date: string): Promise<void> {
		await this.process(this.logPath, (data) => toggleLog(data, date, habitId));
	}

	async toggleTodo(todo: Todo): Promise<void> {
		await this.process(this.todoPath, (data) =>
			replaceLine(data, todo.raw, (l) => toggleTodoLine(l, todayISO()))
		);
	}

	async deleteTodo(todo: Todo): Promise<void> {
		await this.process(this.todoPath, (data) =>
			replaceLine(data, todo.raw, () => null)
		);
	}

	async addTodo(
		text: string,
		priority: Priority,
		due: string | null
	): Promise<void> {
		await this.process(this.todoPath, (data) =>
			appendLine(data, serializeTodo(text, priority, due))
		);
	}

	/** Crea una nuova abitudine, generando uno slug id univoco dal nome. */
	async addHabit(name: string, emoji: string, icon: string): Promise<void> {
		await this.ensureFiles();
		await this.process(this.habitsPath, (data) => {
			const existing = parseHabits(data);
			const base = slugifyHabitId(name);
			let id = base;
			let n = 2;
			while (existing.some((h) => h.id === id)) id = `${base}-${n++}`;
			return addHabitToFrontmatter(data, { id, name, emoji, icon });
		});
	}

	async deleteHabit(id: string): Promise<void> {
		await this.process(this.habitsPath, (data) =>
			removeHabitFromFrontmatter(data, id)
		);
	}

	async setHabitIcon(id: string, iconName: string): Promise<void> {
		await this.process(this.habitsPath, (data) =>
			setHabitIconInFrontmatter(data, id, iconName)
		);
	}

	async setCategoryName(icon: string, name: string): Promise<void> {
		await this.process(this.habitsPath, (data) =>
			setCategoryNameInFrontmatter(data, icon, name)
		);
	}

	async setHabitFields(
		id: string,
		fields: Record<string, string | number>
	): Promise<void> {
		await this.process(this.habitsPath, (data) =>
			setHabitFieldsInFrontmatter(data, id, fields)
		);
	}

	/** Imposta gli orari di promemoria (lista vuota = rimuove il campo). */
	async setHabitReminders(id: string, times: string[]): Promise<void> {
		const value = times.length ? serializeTimeList(times) : "";
		await this.process(this.habitsPath, (data) =>
			setHabitFieldsInFrontmatter(data, id, { reminders: value })
		);
	}

	/** Aggiunge un completamento (abitudini contabili: più volte nello stesso giorno). */
	async incrementHabit(habitId: string, date: string): Promise<void> {
		await this.process(this.logPath, (data) => appendLine(data, logLine(date, habitId)));
	}

	/** Rimuove un singolo completamento per (data, abitudine). */
	async decrementHabit(habitId: string, date: string): Promise<void> {
		await this.process(this.logPath, (data) => {
			const lines = data.split(/\r?\n/);
			const target = logLine(date, habitId);
			const idx = lines.findIndex((l) => l.trim() === target);
			if (idx >= 0) lines.splice(idx, 1);
			return lines.join("\n");
		});
	}
}
