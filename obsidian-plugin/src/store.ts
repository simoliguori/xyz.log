import { App, TFile, normalizePath } from "obsidian";
import {
	appendLine,
	parseHabits,
	parseLog,
	parseTodos,
	replaceLine,
	serializeTodo,
	todayISO,
	toggleLog,
	toggleTodoLine,
} from "./parser";
import { Habit, HabitLog, Priority, Todo } from "./types";

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
		return {
			habits: parseHabits(await read(this.habitsPath)),
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
}
