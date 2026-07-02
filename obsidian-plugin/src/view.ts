import { ItemView, WorkspaceLeaf, setIcon } from "obsidian";
import type TodoHabitsPlugin from "./main";
import {
	addDays,
	PRIORITY_EMOJI,
	PRIORITY_LABEL,
	streak,
	todayISO,
	toISO,
} from "./parser";
import { Habit, Priority, Todo } from "./types";
import { TrackerData } from "./store";

export const VIEW_TYPE = "todo-habits-view";

const PRIO_CLASS: Record<Priority, string> = {
	[Priority.Highest]: "th-prio-highest",
	[Priority.High]: "th-prio-high",
	[Priority.Medium]: "th-prio-medium",
	[Priority.None]: "th-prio-none",
	[Priority.Low]: "th-prio-low",
	[Priority.Lowest]: "th-prio-lowest",
};

export class TrackerView extends ItemView {
	private expanded = new Set<string>();

	constructor(leaf: WorkspaceLeaf, private plugin: TodoHabitsPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "Todo & Habits";
	}

	getIcon(): string {
		return "calendar-check";
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async render(): Promise<void> {
		const data = await this.plugin.store.readAll();
		const root = this.contentEl;
		const scrollTop = root.scrollTop;
		root.empty();
		root.addClass("th-root");

		this.renderHeader(root);
		this.renderHabits(root, data);
		this.renderTodos(root, data);

		root.scrollTop = scrollTop;
	}

	private renderHeader(root: HTMLElement): void {
		const header = root.createDiv({ cls: "th-header" });
		const date = new Date().toLocaleDateString("it-IT", {
			weekday: "long",
			day: "numeric",
			month: "long",
		});
		header.createEl("h1", { text: date, cls: "th-title" });
	}

	/* ---------------- Abitudini ---------------- */

	private renderHabits(root: HTMLElement, data: TrackerData): void {
		const section = root.createDiv({ cls: "th-section" });
		section.createEl("h2", { text: "Abitudini", cls: "th-section-title" });

		if (data.habits.length === 0) {
			section.createDiv({
				cls: "th-empty",
				text: `Nessuna abitudine definita. Aggiungile nel frontmatter di ${this.plugin.store.habitsPath}.`,
			});
			return;
		}

		const today = todayISO();
		for (const habit of data.habits) {
			const dates = data.log.get(habit.id) ?? new Set<string>();
			this.renderHabitRow(section, habit, dates, today);
		}
	}

	private renderHabitRow(
		parent: HTMLElement,
		habit: Habit,
		dates: Set<string>,
		today: string
	): void {
		const card = parent.createDiv({ cls: "th-habit" });
		const row = card.createDiv({ cls: "th-habit-row" });

		const check = row.createEl("button", {
			cls: `th-check ${dates.has(today) ? "is-done" : ""}`,
			attr: { "aria-label": `Segna ${habit.name} per oggi` },
		});
		setIcon(check, "check");
		check.onclick = async (e) => {
			e.stopPropagation();
			await this.plugin.store.toggleHabit(habit.id, today);
		};

		const name = row.createDiv({ cls: "th-habit-name" });
		name.createSpan({ text: habit.emoji ? `${habit.emoji} ` : "" });
		name.createSpan({ text: habit.name });

		const s = streak(dates, today);
		if (s > 0) {
			row.createSpan({ cls: "th-streak", text: `${s}×` });
		}

		// pallini degli ultimi 7 giorni
		const strip = row.createDiv({ cls: "th-strip" });
		for (let i = 6; i >= 0; i--) {
			const d = addDays(today, -i);
			strip.createDiv({
				cls: `th-dot ${dates.has(d) ? "is-done" : ""} ${d === today ? "is-today" : ""}`,
				attr: { "aria-label": d },
			});
		}

		row.onclick = () => {
			if (this.expanded.has(habit.id)) this.expanded.delete(habit.id);
			else this.expanded.add(habit.id);
			this.render();
		};

		if (this.expanded.has(habit.id)) {
			this.renderHeatmap(card, dates, today);
		}
	}

	/** Heatmap tipo GitHub: colonne = settimane (lun→dom), mesi segnati in alto,
	 *  ultima colonna = settimana corrente. */
	private renderHeatmap(parent: HTMLElement, dates: Set<string>, today: string): void {
		const weeks = this.plugin.settings.heatmapWeeks;
		const scroller = parent.createDiv({ cls: "th-heatmap" });
		const monthsRow = scroller.createDiv({ cls: "th-heatmap-months" });
		const grid = scroller.createDiv({ cls: "th-heatmap-grid" });

		const t = new Date();
		const dow = (t.getDay() + 6) % 7; // 0 = lunedì
		const mondayOfThisWeek = addDays(today, -dow);
		const start = addDays(mondayOfThisWeek, -(weeks - 1) * 7);

		let done = 0;
		let prevMonth = "";
		for (let w = 0; w < weeks; w++) {
			const weekStart = addDays(start, w * 7);
			const month = weekStart.slice(0, 7); // YYYY-MM
			const label = monthsRow.createDiv({ cls: "th-heatmap-month" });
			if (month !== prevMonth) {
				label.setText(this.monthShort(weekStart));
				prevMonth = month;
			}

			const col = grid.createDiv({ cls: "th-heatmap-col" });
			for (let d = 0; d < 7; d++) {
				const date = addDays(start, w * 7 + d);
				const cell = col.createDiv({ cls: "th-cell", attr: { "aria-label": date } });
				if (date > today) {
					cell.addClass("is-future");
				} else if (dates.has(date)) {
					cell.addClass("is-done");
					done++;
				}
				if (date === today) cell.addClass("is-today");
			}
		}

		parent.createDiv({
			cls: "th-heatmap-caption",
			text: `${done} completamenti nelle ultime ${weeks} settimane`,
		});

		// parti dalla settimana corrente (in fondo a destra)
		requestAnimationFrame(() => {
			scroller.scrollLeft = scroller.scrollWidth;
		});
	}

	private monthShort(iso: string): string {
		const [y, m, d] = iso.split("-").map(Number);
		return new Date(y, m - 1, d).toLocaleDateString("it-IT", { month: "short" });
	}

	/* ---------------- Todo ---------------- */

	private renderTodos(root: HTMLElement, data: TrackerData): void {
		const section = root.createDiv({ cls: "th-section" });
		section.createEl("h2", { text: "Todo", cls: "th-section-title" });

		this.renderAddForm(section);

		const today = todayISO();
		const week = addDays(today, 7);
		const open = data.todos.filter((t) => !t.done);
		const byPrioThenDue = (a: Todo, b: Todo) =>
			a.priority - b.priority || (a.due ?? "9999").localeCompare(b.due ?? "9999");

		const groups: [string, Todo[], string][] = [
			["In ritardo", open.filter((t) => t.due && t.due < today), "th-group-overdue"],
			["Oggi", open.filter((t) => t.due === today), ""],
			["Prossimi 7 giorni", open.filter((t) => t.due && t.due > today && t.due <= week), ""],
			["Più avanti", open.filter((t) => t.due && t.due > week), ""],
			["Senza data", open.filter((t) => !t.due), ""],
		];

		if (open.length === 0) {
			section.createDiv({ cls: "th-empty", text: "Tutto fatto ✨" });
		}

		for (const [label, todos, cls] of groups) {
			if (todos.length === 0) continue;
			const group = section.createDiv({ cls: `th-group ${cls}` });
			const h = group.createEl("h3", { cls: "th-group-title" });
			h.createSpan({ text: label });
			h.createSpan({ cls: "th-group-count", text: String(todos.length) });
			for (const todo of todos.sort(byPrioThenDue)) {
				this.renderTodoRow(group, todo, today);
			}
		}

		const doneTodos = data.todos.filter((t) => t.done);
		if (doneTodos.length > 0) {
			const details = section.createEl("details", { cls: "th-done-group" });
			details.createEl("summary", { text: `Completate (${doneTodos.length})` });
			for (const todo of doneTodos
				.sort((a, b) => (b.doneDate ?? "").localeCompare(a.doneDate ?? ""))
				.slice(0, 30)) {
				this.renderTodoRow(details, todo, today);
			}
		}
	}

	private renderAddForm(section: HTMLElement): void {
		const form = section.createDiv({ cls: "th-add" });
		const input = form.createEl("input", {
			cls: "th-add-text",
			attr: { type: "text", placeholder: "Nuova attività…" },
		});
		const date = form.createEl("input", {
			cls: "th-add-date",
			attr: { type: "date", "aria-label": "Scadenza" },
		});
		const prio = form.createEl("select", { cls: "th-add-prio" });
		for (const p of [
			Priority.None,
			Priority.Lowest,
			Priority.Low,
			Priority.Medium,
			Priority.High,
			Priority.Highest,
		]) {
			prio.createEl("option", {
				text: p === Priority.None ? "priorità" : `${PRIORITY_EMOJI[p]} ${PRIORITY_LABEL[p]}`,
				attr: { value: String(p) },
			});
		}
		prio.value = String(Priority.None);
		const btn = form.createEl("button", { cls: "th-add-btn", attr: { "aria-label": "Aggiungi" } });
		setIcon(btn, "plus");

		const submit = async () => {
			const text = input.value.trim();
			if (!text) return;
			await this.plugin.store.addTodo(
				text,
				Number(prio.value) as Priority,
				date.value || null
			);
			input.value = "";
		};
		btn.onclick = submit;
		input.onkeydown = (e) => {
			if (e.key === "Enter") void submit();
		};
	}

	private renderTodoRow(parent: HTMLElement, todo: Todo, today: string): void {
		const row = parent.createDiv({ cls: `th-todo ${todo.done ? "is-done" : ""}` });

		const check = row.createEl("button", {
			cls: `th-check th-check-sm ${todo.done ? "is-done" : ""}`,
			attr: { "aria-label": todo.done ? "Riapri" : "Completa" },
		});
		setIcon(check, "check");
		check.onclick = () => void this.plugin.store.toggleTodo(todo);

		if (todo.priority !== Priority.None) {
			row.createSpan({
				cls: `th-prio-dot ${PRIO_CLASS[todo.priority]}`,
				attr: { "aria-label": `Priorità ${PRIORITY_LABEL[todo.priority]}` },
			});
		}

		const text = row.createDiv({ cls: "th-todo-text" });
		// evidenzia i #tag inline
		let rest = todo.text;
		const tagRe = /#[\w/-]+/g;
		let last = 0;
		for (const m of rest.matchAll(tagRe)) {
			if (m.index! > last) text.createSpan({ text: rest.slice(last, m.index) });
			text.createSpan({ cls: "th-tag", text: m[0] });
			last = m.index! + m[0].length;
		}
		if (last < rest.length) text.createSpan({ text: rest.slice(last) });

		if (todo.due) {
			const overdue = !todo.done && todo.due < today;
			row.createSpan({
				cls: `th-due ${overdue ? "is-overdue" : ""}`,
				text: todo.due === today ? "oggi" : this.formatDue(todo.due),
			});
		}

		const del = row.createEl("button", {
			cls: "th-del",
			attr: { "aria-label": "Elimina" },
		});
		setIcon(del, "x");
		del.onclick = () => void this.plugin.store.deleteTodo(todo);
	}

	private formatDue(iso: string): string {
		const [y, m, d] = iso.split("-").map(Number);
		const date = new Date(y, m - 1, d);
		const sameYear = y === new Date().getFullYear();
		return date.toLocaleDateString("it-IT", {
			day: "numeric",
			month: "short",
			...(sameYear ? {} : { year: "numeric" }),
		});
	}
}
