import { App, getIconIds, Modal, setIcon } from "obsidian";
import type TodoHabitsPlugin from "./main";
import {
	addDays,
	PRIORITY_EMOJI,
	PRIORITY_LABEL,
	streak,
	todayISO,
} from "./parser";
import { Habit, Priority, Todo } from "./types";
import { TrackerData } from "./store";

const PRIO_CLASS: Record<Priority, string> = {
	[Priority.Highest]: "th-prio-highest",
	[Priority.High]: "th-prio-high",
	[Priority.Medium]: "th-prio-medium",
	[Priority.None]: "th-prio-none",
	[Priority.Low]: "th-prio-low",
	[Priority.Lowest]: "th-prio-lowest",
};

export interface RenderOptions {
	/** intestazione con la data (attiva nella vista, spenta di default negli embed) */
	header: boolean;
	habits: boolean;
	todos: boolean;
	/** layout a croce: tutte le funzioni, una per angolo (griglia 2×2) */
	cross: boolean;
	/** se presente, mostra solo questa abitudine con la heatmap già espansa */
	habitId?: string;
}

/** Griglia di icone lucide con ricerca, per scegliere l'icona di un'abitudine. */
class IconPickerModal extends Modal {
	private onChooseCb: (iconId: string) => void;

	constructor(app: App, onChoose: (iconId: string) => void) {
		super(app);
		this.onChooseCb = onChoose;
	}

	onOpen(): void {
		this.modalEl.addClass("th-icon-modal");
		const { contentEl } = this;
		contentEl.empty();

		const top = contentEl.createDiv({ cls: "th-icon-top" });
		const search = top.createEl("input", {
			cls: "th-icon-search",
			attr: { type: "text", placeholder: "Cerca un'icona…" },
		});
		const none = top.createEl("button", { cls: "th-icon-none", text: "Nessuna" });
		none.onclick = () => {
			this.onChooseCb("");
			this.close();
		};

		const grid = contentEl.createDiv({ cls: "th-icon-grid" });
		const footer = contentEl.createDiv({ cls: "th-icon-footer" });
		const hoverName = footer.createDiv({ cls: "th-icon-hovername" });
		const counter = footer.createDiv({ cls: "th-icon-count" });

		const tiles: [string, HTMLElement][] = [];
		for (const id of getIconIds()) {
			const name = id.replace(/^lucide-/, "");
			const tile = grid.createEl("button", {
				cls: "th-icon-tile",
				attr: { "aria-label": name, title: name },
			});
			setIcon(tile, id);
			tile.onclick = () => {
				this.onChooseCb(id);
				this.close();
			};
			tile.onmouseenter = () => hoverName.setText(name);
			tiles.push([name, tile]);
		}
		grid.onmouseleave = () => hoverName.setText("");

		const updateCount = (n: number) => counter.setText(`${n} icone`);
		updateCount(tiles.length);

		search.oninput = () => {
			const q = search.value.trim().toLowerCase();
			let shown = 0;
			for (const [name, tile] of tiles) {
				const hide = q !== "" && !name.includes(q);
				tile.toggleClass("th-hidden", hide);
				if (!hide) shown++;
			}
			updateCount(shown);
		};
		search.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Rendering condiviso tra la vista dedicata e i code block `todo-habits`
 * incorporati nelle note.
 */
export class TrackerRenderer {
	private expanded = new Set<string>();
	/** abitudine selezionata nel riquadro Cronologia del layout a croce */
	private historyHabitId: string | null = null;

	constructor(
		private plugin: TodoHabitsPlugin,
		private root: HTMLElement,
		private opts: RenderOptions
	) {
		if (opts.habitId) this.expanded.add(opts.habitId);
	}

	async render(): Promise<void> {
		const data = await this.plugin.store.readAll();
		const root = this.root;
		const scrollTop = root.scrollTop;
		root.empty();
		root.addClass("th-root");

		if (this.opts.cross) {
			this.renderCross(root, data);
			root.scrollTop = scrollTop;
			return;
		}

		if (this.opts.header) this.renderHeader(root);
		if (this.opts.habitId) {
			this.renderSingleHabit(root, data);
		} else if (this.opts.habits) {
			this.renderHabits(root, data);
		}
		if (this.opts.todos) this.renderTodos(root, data);

		root.scrollTop = scrollTop;
	}

	/* ---------------- Layout a croce (griglia 2×2) ---------------- */

	private renderCross(root: HTMLElement, data: TrackerData): void {
		root.addClass("th-cross");
		if (this.opts.header) this.renderHeader(root);
		const today = todayISO();

		const grid = root.createDiv({ cls: "th-cross-grid" });
		// sinistra (alta, due blocchi): todo scrollabile
		const todoCell = grid.createDiv({ cls: "th-cross-cell th-cross-cell--todo" });
		// destra alto: abitudini — destra basso: cronologia di un'abitudine a scelta
		const habitsCell = grid.createDiv({ cls: "th-cross-cell th-cross-cell--habits" });
		const historyCell = grid.createDiv({ cls: "th-cross-cell th-cross-cell--history" });

		this.renderTodos(todoCell, data);
		this.renderHabits(habitsCell, data);
		this.renderHistoryCell(historyCell, data, today);
	}

	private renderHistoryCell(cell: HTMLElement, data: TrackerData, today: string): void {
		const section = cell.createDiv({ cls: "th-section" });
		const head = section.createDiv({ cls: "th-history-head" });
		head.createEl("h2", { text: "Cronologia", cls: "th-section-title" });

		if (data.habits.length === 0) {
			section.createDiv({ cls: "th-empty", text: "Nessuna abitudine." });
			return;
		}

		const current =
			this.historyHabitId && data.habits.some((h) => h.id === this.historyHabitId)
				? this.historyHabitId
				: data.habits[0].id;

		const sel = head.createEl("select", { cls: "th-history-select" });
		for (const h of data.habits) {
			sel.createEl("option", { text: h.name, attr: { value: h.id } });
		}
		sel.value = current;
		sel.onchange = () => {
			this.historyHabitId = sel.value;
			void this.render();
		};

		const habit = data.habits.find((h) => h.id === current)!;
		this.renderHeatmap(section, data.log.get(habit.id) ?? new Map(), today);
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

	private renderSingleHabit(root: HTMLElement, data: TrackerData): void {
		const habit = data.habits.find((h) => h.id === this.opts.habitId);
		if (!habit) {
			root.createDiv({
				cls: "th-empty",
				text: `Abitudine "${this.opts.habitId}" non trovata in ${this.plugin.store.habitsPath}.`,
			});
			return;
		}
		const section = root.createDiv({ cls: "th-section" });
		this.renderHabitRow(section, habit, data.log.get(habit.id) ?? new Map(), todayISO());
	}

	private renderHabits(root: HTMLElement, data: TrackerData): void {
		const section = root.createDiv({ cls: "th-section" });
		section.createEl("h2", { text: "Abitudini", cls: "th-section-title" });

		this.renderHabitAddForm(section);

		if (data.habits.length === 0) {
			section.createDiv({
				cls: "th-empty",
				text: "Nessuna abitudine definita. Aggiungila qui sopra.",
			});
			return;
		}

		const today = todayISO();

		// la lista scorre (nel layout a croce): titolo e form di aggiunta restano fissi sopra
		const list = section.createDiv({ cls: "th-habit-scroll" });

		// raggruppa per icona: le abitudini che condividono un'icona formano una categoria
		const byIcon = new Map<string, Habit[]>();
		for (const h of data.habits) {
			if (!h.icon) continue;
			if (!byIcon.has(h.icon)) byIcon.set(h.icon, []);
			byIcon.get(h.icon)!.push(h);
		}

		const renderedCats = new Set<string>();
		for (const habit of data.habits) {
			const group = habit.icon ? byIcon.get(habit.icon) : null;
			if (group && group.length >= 2) {
				if (renderedCats.has(habit.icon)) continue;
				renderedCats.add(habit.icon);
				this.renderCategory(list, habit.icon, group, data, today);
			} else {
				this.renderHabitRow(list, habit, data.log.get(habit.id) ?? new Map(), today);
			}
		}
	}

	private renderCategory(
		parent: HTMLElement,
		icon: string,
		habs: Habit[],
		data: TrackerData,
		today: string
	): void {
		const saved = (data.categories ?? []).find((c) => c.icon === icon);
		const name = saved?.name || icon.replace(/^lucide-/, "");
		const cat = parent.createDiv({ cls: "th-category" });
		const head = cat.createDiv({ cls: "th-category-head" });
		const ic = head.createDiv({ cls: "th-category-icon" });
		setIcon(ic, icon);
		const nameEl = head.createEl("span", {
			cls: "th-category-name",
			text: name,
			attr: { title: "Rinomina categoria" },
		});
		head.createSpan({ cls: "th-group-count", text: String(habs.length) });

		nameEl.onclick = () => {
			const input = document.createElement("input");
			input.type = "text";
			input.value = name;
			input.className = "th-category-name-input";
			nameEl.replaceWith(input);
			input.focus();
			input.select();
			let done = false;
			const commit = async (save: boolean) => {
				if (done) return;
				done = true;
				const v = input.value.trim();
				if (save && v && v !== name) {
					await this.plugin.store.setCategoryName(icon, v);
				} else {
					void this.render();
				}
			};
			input.onkeydown = (e) => {
				if (e.key === "Enter") void commit(true);
				if (e.key === "Escape") void commit(false);
			};
			input.onblur = () => void commit(true);
		};

		const body = cat.createDiv({ cls: "th-category-body" });
		for (const h of habs) {
			this.renderHabitRow(body, h, data.log.get(h.id) ?? new Map(), today);
		}
	}

	/** API del plugin Iconize (obsidian-icon-folder), se installato: per icone custom. */
	private iconizeApi(): { getIconByName: (n: string) => unknown; setIconForNode: (n: string, el: HTMLElement) => void } | null {
		// `plugins` non è nei tipi pubblici di Obsidian
		return (this.plugin.app as any).plugins?.getPlugin("obsidian-icon-folder")?.api ?? null;
	}

	private applyHabitIcon(el: HTMLElement, habit: Habit): void {
		el.empty();
		if (habit.icon) {
			setIcon(el, habit.icon);
			if (el.childElementCount > 0) return;
			const api = this.iconizeApi();
			if (api && api.getIconByName(habit.icon)) {
				api.setIconForNode(habit.icon, el);
				return;
			}
		}
		if (habit.emoji) {
			el.setText(habit.emoji);
		} else {
			setIcon(el, "shapes");
		}
	}

	private renderHabitAddForm(section: HTMLElement): void {
		const form = section.createDiv({ cls: "th-add th-habit-add" });
		let chosenIcon = "";
		const iconBtn = form.createEl("button", {
			cls: "th-icon-btn th-add-icon",
			attr: { type: "button", "aria-label": "Scegli un'icona (opzionale)" },
		});
		setIcon(iconBtn, "shapes");
		iconBtn.onclick = () => {
			new IconPickerModal(this.plugin.app, (iconId) => {
				chosenIcon = iconId;
				iconBtn.empty();
				setIcon(iconBtn, iconId || "shapes");
			}).open();
		};
		const input = form.createEl("input", {
			cls: "th-add-text",
			attr: { type: "text", placeholder: "Nuova abitudine…" },
		});
		const btn = form.createEl("button", { cls: "th-add-btn", attr: { "aria-label": "Aggiungi abitudine" } });
		setIcon(btn, "plus");

		const submit = async () => {
			const name = input.value.trim();
			if (!name) return;
			await this.plugin.store.addHabit(name, "", chosenIcon);
			input.value = "";
			chosenIcon = "";
			iconBtn.empty();
			setIcon(iconBtn, "shapes");
		};
		btn.onclick = submit;
		input.onkeydown = (e) => {
			if (e.key === "Enter") void submit();
		};
	}

	private renderHabitRow(
		parent: HTMLElement,
		habit: Habit,
		dates: Map<string, number>,
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

		const iconBtn = row.createEl("button", {
			cls: "th-icon-btn",
			attr: { "aria-label": `Icona di ${habit.name}` },
		});
		this.applyHabitIcon(iconBtn, habit);
		iconBtn.onclick = (e) => {
			e.stopPropagation();
			new IconPickerModal(this.plugin.app, (iconId) =>
				void this.plugin.store.setHabitIcon(habit.id, iconId)
			).open();
		};

		const name = row.createDiv({ cls: "th-habit-name" });
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

		const del = row.createEl("button", {
			cls: "th-del",
			attr: { "aria-label": `Elimina ${habit.name}` },
		});
		setIcon(del, "x");
		del.onclick = (e) => {
			e.stopPropagation();
			if (confirm(`Eliminare l'abitudine "${habit.name}"? La cronologia in Habit Log resta intatta.`)) {
				void this.plugin.store.deleteHabit(habit.id);
			}
		};

		row.onclick = () => {
			if (this.expanded.has(habit.id)) this.expanded.delete(habit.id);
			else this.expanded.add(habit.id);
			void this.render();
		};

		if (this.expanded.has(habit.id)) {
			this.renderHeatmap(card, dates, today);
		}
	}

	/** Heatmap tipo GitHub: colonne = settimane (lun→dom), mesi segnati in alto,
	 *  ultima colonna = settimana corrente. */
	private renderHeatmap(parent: HTMLElement, dates: Map<string, number>, today: string): void {
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

		// la lista scorre: titolo e form di aggiunta restano fissi sopra
		const list = section.createDiv({ cls: "th-todo-scroll" });

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
			list.createDiv({ cls: "th-empty", text: "Tutto fatto ✨" });
		}

		for (const [label, todos, cls] of groups) {
			if (todos.length === 0) continue;
			const group = list.createDiv({ cls: `th-group ${cls}` });
			const h = group.createEl("h3", { cls: "th-group-title" });
			h.createSpan({ text: label });
			h.createSpan({ cls: "th-group-count", text: String(todos.length) });
			for (const todo of todos.sort(byPrioThenDue)) {
				this.renderTodoRow(group, todo, today);
			}
		}

		const doneTodos = data.todos.filter((t) => t.done);
		if (doneTodos.length > 0) {
			const details = list.createEl("details", { cls: "th-done-group" });
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
		const rest = todo.text;
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
