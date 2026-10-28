import { App, getIconIds, Modal, Platform, setIcon } from "obsidian";
import type XyzlogPlugin from "./main";
import { addDays, PRIORITY_EMOJI, serializeTodo, streak, todayISO } from "./parser";
import { Habit, Priority, Todo } from "./types";
import { TrackerData } from "./store";
import { locale, prioLabel, t, tf } from "./strings";

const PRIO_CLASS: Record<Priority, string> = {
	[Priority.Highest]: "th-prio-highest",
	[Priority.High]: "th-prio-high",
	[Priority.Medium]: "th-prio-medium",
	[Priority.None]: "th-prio-none",
	[Priority.Low]: "th-prio-low",
	[Priority.Lowest]: "th-prio-lowest",
};

export interface RenderOptions {
	/** header with the date (on in the view, off by default in embeds) */
	header: boolean;
	habits: boolean;
	todos: boolean;
	/** dashboard layout: todos on the left, habits + history on the right */
	cross: boolean;
	/** folder view: todos grouped by list → section, with descriptions */
	folders: boolean;
	/** if present, show only this habit with its heatmap already expanded */
	habitId?: string;
}

/** Text with markdown links `[t](url)`, bare URLs and #tags made clickable. */
function renderRich(el: HTMLElement, text: string): void {
	const re = /\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s)]+)|(#[\w/-]+)/g;
	let last = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		if (m.index > last) el.appendText(text.slice(last, m.index));
		if (m[1] !== undefined) {
			const a = el.createEl("a", { text: m[1], href: m[2], cls: "th-link" });
			a.setAttr("target", "_blank");
			a.setAttr("rel", "noopener");
		} else if (m[3] !== undefined) {
			const a = el.createEl("a", { text: m[3], href: m[3], cls: "th-link" });
			a.setAttr("target", "_blank");
			a.setAttr("rel", "noopener");
		} else if (m[4] !== undefined) {
			el.createSpan({ cls: "th-tag", text: m[4] });
		}
		last = m.index + m[0].length;
	}
	if (last < text.length) el.appendText(text.slice(last));
}

/** Scrollable containers whose scroll position is preserved across renders. */
const TH_SCROLLERS = [
	".th-todo-scroll",
	".th-habit-scroll",
	".th-cross-cell--todo",
	".th-cross-cell--habits",
	".th-cross-cell--history",
];

/** Completion sound: a soft two-note "ding" (Web Audio, no external file).
   Same character as the desktop widget. */
let thAudioCtx: AudioContext | null = null;
function playCheckSound(): void {
	try {
		const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
			|| (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctx) return;
		if (!thAudioCtx) thAudioCtx = new Ctx();
		const ctx = thAudioCtx;
		if (ctx.state === "suspended") void ctx.resume();
		const now = ctx.currentTime;

		const master = ctx.createGain();
		master.connect(ctx.destination);
		master.gain.setValueAtTime(0.0001, now);
		master.gain.exponentialRampToValueAtTime(0.09, now + 0.015);
		master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

		// two notes a fifth apart (A5 → E6), soft, with a small tail
		const notes: [number, number][] = [
			[880, 0],
			[1318.51, 0.08],
		];
		for (const [freq, t] of notes) {
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.type = "sine";
			o.frequency.setValueAtTime(freq, now + t);
			o.connect(g);
			g.connect(master);
			g.gain.setValueAtTime(0.0001, now + t);
			g.gain.exponentialRampToValueAtTime(0.9, now + t + 0.02);
			g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.42);
			o.start(now + t);
			o.stop(now + t + 0.45);
		}
	} catch (e) {
		/* audio not available: ignore */
	}
}

/** Collapse the element (height → 0) then run `fn`, so the rows below slide up. */
function collapseThenRun(el: HTMLElement, fn: () => void): void {
	el.style.maxHeight = `${el.scrollHeight}px`;
	el.style.overflow = "hidden";
	void el.offsetHeight; // reflow
	el.addClass("th-collapsing");
	window.setTimeout(fn, 240);
}

/** Searchable grid of lucide icons, to pick a habit's icon. */
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
			attr: { type: "text", placeholder: t("searchIcon") },
		});
		const none = top.createEl("button", { cls: "th-icon-none", text: t("none") });
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

		const updateCount = (n: number) => counter.setText(tf.iconsCount(n));
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

/** (Translucent) popup to edit a task's text, date, time and priority. */
class TaskEditModal extends Modal {
	constructor(private plugin: XyzlogPlugin, private todo: Todo) {
		super(plugin.app);
	}

	onOpen(): void {
		this.modalEl.addClass("th-task-modal");
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h3", { cls: "th-tm-title", text: t("editTask") });

		const textInput = contentEl.createEl("input", {
			cls: "th-tm-text",
			attr: { type: "text", value: this.todo.text, placeholder: t("newTask") },
		});

		const dateRow = contentEl.createDiv({ cls: "th-tm-row" });
		const dateInput = dateRow.createEl("input", {
			cls: "th-tm-date",
			attr: { type: "date", value: this.todo.due ?? "" },
		});
		const timeInput = dateRow.createEl("input", {
			cls: "th-tm-time",
			attr: { type: "time", value: this.todo.time ?? "" },
		});
		const prio = dateRow.createEl("select", { cls: "th-tm-prio" });
		for (const p of [
			Priority.None,
			Priority.Lowest,
			Priority.Low,
			Priority.Medium,
			Priority.High,
			Priority.Highest,
		]) {
			prio.createEl("option", {
				text: p === Priority.None ? t("priority") : `${PRIORITY_EMOJI[p]} ${prioLabel(p)}`,
				attr: { value: String(p) },
			});
		}
		prio.value = String(this.todo.priority);

		const actions = contentEl.createDiv({ cls: "th-tm-actions" });
		const cancel = actions.createEl("button", { cls: "th-tm-cancel", text: t("cancel") });
		cancel.onclick = () => this.close();
		const save = actions.createEl("button", { cls: "th-tm-save", text: t("save") });
		const commit = () => {
			void this.plugin.store.updateTodo(this.todo, {
				text: textInput.value.trim() || this.todo.text,
				priority: Number(prio.value) as Priority,
				due: dateInput.value || null,
				time: timeInput.value || null,
			});
			this.close();
		};
		save.onclick = commit;
		textInput.onkeydown = (e) => {
			if (e.key === "Enter") commit();
		};
		textInput.focus();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}

/**
 * Shared rendering between the dedicated view and the `xyz.log` code blocks
 * embedded in notes.
 */
export class TrackerRenderer {
	private expanded = new Set<string>();
	/** keys of collapsed groups/categories, to preserve the collapse across renders */
	private collapsed = new Set<string>();
	/** settings panel open under the expanded habit */
	private settingsOpen = new Set<string>();
	/** active page of the mobile swipe (0 = habits, 1 = tasks) */
	private swipeIndex = 0;
	/** line of the just-created task, to animate its appearance */
	private pendingNew: string | null = null;

	constructor(
		private plugin: XyzlogPlugin,
		private root: HTMLElement,
		private opts: RenderOptions
	) {
		if (opts.habitId) this.expanded.add(opts.habitId);
	}

	async render(): Promise<void> {
		const data = await this.plugin.store.readAll();
		const root = this.root;
		const scroll = this.captureScroll();
		root.empty();
		root.addClass("th-root");

		if (this.opts.cross) {
			this.renderCross(root, data);
			this.restoreScroll(scroll);
			return;
		}

		if (this.opts.header) this.renderHeader(root);
		if (this.opts.habitId) {
			this.renderSingleHabit(root, data);
		} else if (this.useSwipe()) {
			this.renderSwipe(root, data);
		} else {
			if (this.opts.habits) this.renderHabits(root, data);
			if (this.opts.folders) {
				this.renderFolders(root, data);
			} else if (this.opts.todos) {
				this.renderTodos(root, data);
			}
		}

		this.restoreScroll(scroll);
	}

	/** On mobile, when showing both habits and tasks, swipe between them (or use
	   the two tabs on top) instead of stacking them. */
	private useSwipe(): boolean {
		return (
			Platform.isMobile &&
			this.opts.habits &&
			this.opts.todos &&
			!this.opts.folders &&
			!this.opts.cross &&
			!this.opts.habitId
		);
	}

	private renderSwipe(root: HTMLElement, data: TrackerData): void {
		const wrap = root.createDiv({ cls: "th-swipe-wrap" });
		const tabs = wrap.createDiv({ cls: "th-swipe-tabs" });
		const tabH = tabs.createEl("button", { cls: "th-swipe-tab", text: t("habits") });
		const tabT = tabs.createEl("button", { cls: "th-swipe-tab", text: t("todos") });

		const track = wrap.createDiv({ cls: "th-swipe-track" });
		const paneH = track.createDiv({ cls: "th-swipe-pane" });
		const paneT = track.createDiv({ cls: "th-swipe-pane" });
		this.renderHabits(paneH, data);
		this.renderTodos(paneT, data);

		const setActive = (i: number) => {
			this.swipeIndex = i;
			tabH.toggleClass("is-active", i === 0);
			tabT.toggleClass("is-active", i === 1);
		};
		setActive(this.swipeIndex);

		tabH.onclick = () => track.scrollTo({ left: 0, behavior: "smooth" });
		tabT.onclick = () => track.scrollTo({ left: track.clientWidth, behavior: "smooth" });
		track.onscroll = () => {
			const i = track.scrollLeft > track.clientWidth / 2 ? 1 : 0;
			if (i !== this.swipeIndex) setActive(i);
		};

		// restore the active page after the re-render (no animation)
		requestAnimationFrame(() => {
			track.scrollLeft = this.swipeIndex * track.clientWidth;
		});
	}

	/** Scroll position of the containers, so checking off doesn't jump to the top. */
	private captureScroll(): Record<string, number> {
		const out: Record<string, number> = { __root: this.root.scrollTop };
		for (const sel of TH_SCROLLERS) {
			const el = this.root.querySelector(sel) as HTMLElement | null;
			if (el) out[sel] = el.scrollTop;
		}
		return out;
	}

	private restoreScroll(s: Record<string, number>): void {
		this.root.scrollTop = s.__root ?? 0;
		for (const sel of TH_SCROLLERS) {
			if (!(sel in s)) continue;
			const el = this.root.querySelector(sel) as HTMLElement | null;
			if (el) el.scrollTop = s[sel];
		}
	}

	private collapsibleOpen(key: string): Record<string, string> {
		return this.collapsed.has(key) ? {} : { open: "" };
	}

	private trackCollapse(details: HTMLDetailsElement, key: string): void {
		details.ontoggle = () => {
			if (details.open) this.collapsed.delete(key);
			else this.collapsed.add(key);
		};
	}

	private renderHeader(root: HTMLElement): void {
		const header = root.createDiv({ cls: "th-header" });
		const date = new Date().toLocaleDateString(locale(), {
			weekday: "long",
			day: "numeric",
			month: "long",
		});
		header.createEl("h1", { text: date, cls: "th-title" });
	}

	/* ---------------- Dashboard layout ---------------- */

	private renderCross(root: HTMLElement, data: TrackerData): void {
		root.addClass("th-cross");
		// dashboard split: tasks left, habits right. No date on top and no history
		// (redundant: habits already expand on their own).
		const grid = root.createDiv({ cls: "th-cross-grid" });
		const todoCell = grid.createDiv({ cls: "th-cross-cell th-cross-cell--todo" });
		const habitsCell = grid.createDiv({ cls: "th-cross-cell th-cross-cell--habits" });

		this.renderTodos(todoCell, data);
		this.renderHabits(habitsCell, data);
	}

	/** History overview: one compact row per habit, grouped by category. */
	private renderHistoryCell(cell: HTMLElement, data: TrackerData, today: string): void {
		const section = cell.createDiv({ cls: "th-section" });
		section.createEl("h2", { text: t("history"), cls: "th-section-title" });

		if (data.habits.length === 0) {
			section.createDiv({ cls: "th-empty", text: t("noHabitsShort") });
			return;
		}

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
				const saved = (data.categories ?? []).find((c) => c.icon === habit.icon);
				const name = saved?.name || habit.icon.replace(/^lucide-/, "");
				const head = section.createDiv({ cls: "th-hist-cat" });
				const ic = head.createDiv({ cls: "th-category-icon" });
				setIcon(ic, habit.icon);
				head.createSpan({ text: name });
				for (const h of group) this.renderHistoryLine(section, h, data, today);
			} else {
				this.renderHistoryLine(section, habit, data, today);
			}
		}
	}

	/** One row: habit name + compact strip of the last days. */
	private renderHistoryLine(
		parent: HTMLElement,
		habit: Habit,
		data: TrackerData,
		today: string
	): void {
		const dates = data.log.get(habit.id) ?? new Map<string, number>();
		const line = parent.createDiv({ cls: "th-hist-line" });
		line.createSpan({ cls: "th-hist-name", text: habit.name, attr: { title: habit.name } });
		const s = streak(dates, today);
		if (s > 0) line.createSpan({ cls: "th-streak", text: `${s}×` });
		const strip = line.createDiv({ cls: "th-hist-strip" });
		const DAYS = 28;
		for (let i = DAYS - 1; i >= 0; i--) {
			const d = addDays(today, -i);
			strip.createDiv({
				cls: `th-cell ${dates.has(d) ? "is-done" : ""} ${d === today ? "is-today" : ""}`,
				attr: { "aria-label": d },
			});
		}
	}

	/* ---------------- Habits ---------------- */

	private renderSingleHabit(root: HTMLElement, data: TrackerData): void {
		const habit = data.habits.find((h) => h.id === this.opts.habitId);
		if (!habit) {
			root.createDiv({
				cls: "th-empty",
				text: tf.habitNotFound(this.opts.habitId ?? "", this.plugin.store.habitsPath),
			});
			return;
		}
		const section = root.createDiv({ cls: "th-section" });
		this.renderHabitRow(section, habit, data.log.get(habit.id) ?? new Map(), todayISO());
	}

	private renderHabits(root: HTMLElement, data: TrackerData): void {
		const section = root.createDiv({ cls: "th-section" });
		section.createEl("h2", { text: t("habits"), cls: "th-section-title" });

		this.renderHabitAddForm(section, data);

		if (data.habits.length === 0) {
			section.createDiv({ cls: "th-empty", text: t("noHabits") });
			return;
		}

		const today = todayISO();
		const list = section.createDiv({ cls: "th-habit-scroll" });

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
		const key = `c:${icon}`;
		const cat = parent.createEl("details", { cls: "th-category", attr: this.collapsibleOpen(key) });
		this.trackCollapse(cat, key);
		const head = cat.createEl("summary", { cls: "th-category-head" });
		const ic = head.createDiv({ cls: "th-category-icon" });
		setIcon(ic, icon);
		const nameEl = head.createEl("span", {
			cls: "th-category-name",
			text: name,
			attr: { title: t("renameCategory") },
		});
		// animated chevron to collapse/expand the category (in place of the counter)
		const chevron = head.createDiv({ cls: "th-cat-chevron", attr: { "aria-hidden": "true" } });
		setIcon(chevron, "chevron-down");

		nameEl.onclick = (e) => {
			e.preventDefault();
			e.stopPropagation();
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

	private iconizeApi(): { getIconByName: (n: string) => unknown; setIconForNode: (n: string, el: HTMLElement) => void } | null {
		// `plugins` is not part of Obsidian's public types
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

	/** Existing categories (icon shared by ≥2 habits, or named in the frontmatter). */
	private existingCategories(data: TrackerData): { icon: string; name: string }[] {
		const count = new Map<string, number>();
		for (const h of data.habits) if (h.icon) count.set(h.icon, (count.get(h.icon) ?? 0) + 1);
		const cats: { icon: string; name: string }[] = [];
		const seen = new Set<string>();
		for (const c of (data.categories ?? [])) {
			if (c.icon && !seen.has(c.icon)) {
				seen.add(c.icon);
				cats.push({ icon: c.icon, name: c.name || c.icon.replace(/^lucide-/, "") });
			}
		}
		for (const [icon, n] of count) {
			if (n >= 2 && !seen.has(icon)) {
				seen.add(icon);
				cats.push({ icon, name: icon.replace(/^lucide-/, "") });
			}
		}
		return cats;
	}

	private renderHabitAddForm(section: HTMLElement, data: TrackerData): void {
		const form = section.createDiv({ cls: "th-add th-habit-add" });
		let chosenIcon = "";
		const iconBtn = form.createEl("button", {
			cls: "th-icon-btn th-add-icon",
			attr: { type: "button", "aria-label": t("chooseIcon") },
		});
		setIcon(iconBtn, "shapes");

		const cats = this.existingCategories(data);
		const catSel = form.createEl("select", {
			cls: "th-add-cat",
			attr: { "aria-label": t("category") },
		});
		catSel.createEl("option", { text: t("noCategory"), attr: { value: "" } });
		for (const c of cats) {
			catSel.createEl("option", { text: c.name, attr: { value: c.icon } });
		}
		const setIconBtn = (icon: string) => {
			iconBtn.empty();
			setIcon(iconBtn, icon || "shapes");
		};
		catSel.onchange = () => {
			chosenIcon = catSel.value;
			setIconBtn(chosenIcon);
		};

		iconBtn.onclick = () => {
			new IconPickerModal(this.plugin.app, (iconId) => {
				chosenIcon = iconId;
				catSel.value = cats.some((c) => c.icon === iconId) ? iconId : "";
				setIconBtn(iconId);
			}).open();
		};
		const input = form.createEl("input", {
			cls: "th-add-text",
			attr: { type: "text", placeholder: t("newHabit") },
		});
		const btn = form.createEl("button", { cls: "th-add-btn", attr: { "aria-label": t("add") } });
		setIcon(btn, "plus");

		const submit = async () => {
			const name = input.value.trim();
			if (!name) return;
			await this.plugin.store.addHabit(name, "", chosenIcon);
			input.value = "";
			chosenIcon = "";
			catSel.value = "";
			setIconBtn("");
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
		const countToday = dates.get(today) ?? 0;
		const counterMode = habit.countable || habit.goal > 1;
		const doneToday = !habit.countable && countToday >= habit.goal;
		const card = parent.createDiv({ cls: `th-habit ${doneToday ? "is-done" : ""}` });
		const row = card.createDiv({ cls: "th-habit-row" });

		if (counterMode) {
			// several times a day (goal > 1) or free count (countable):
			// tap = +1; the "−" button next to it = −1 (works on mobile too, where
			// there's no right-click).
			const counter = row.createEl("button", {
				cls: `th-count ${doneToday ? "is-done" : ""}`,
				attr: { "aria-label": tf.markToday(habit.name), title: tf.markToday(habit.name) },
			});
			if (habit.goal > 1) {
				// compact fraction (½ style): current on top, goal below
				counter.addClass("th-count-frac");
				counter.createEl("sup", { text: String(countToday) });
				counter.createSpan({ cls: "th-frac-slash", text: "⁄" });
				counter.createEl("sub", { text: String(habit.goal) });
			} else {
				counter.setText(String(countToday));
			}
			const atGoal = !habit.countable && countToday >= habit.goal;
			counter.onclick = (e) => {
				e.stopPropagation();
				if (atGoal) return; // goal reached: don't go further
				playCheckSound();
				counter.addClass("th-pop");
				void this.plugin.store.incrementHabit(habit.id, today);
			};
			counter.oncontextmenu = (e) => {
				e.preventDefault();
				e.stopPropagation();
				if ((dates.get(today) ?? 0) > 0) void this.plugin.store.decrementHabit(habit.id, today);
			};
			const minus = row.createEl("button", {
				cls: `th-count-minus ${countToday > 0 ? "" : "th-hidden"}`,
				text: "−",
				attr: { "aria-label": tf.decrementNamed(habit.name), title: tf.decrementNamed(habit.name) },
			});
			minus.onclick = (e) => {
				e.stopPropagation();
				if ((dates.get(today) ?? 0) > 0) void this.plugin.store.decrementHabit(habit.id, today);
			};
		} else {
			const check = row.createEl("button", {
				cls: `th-check ${dates.has(today) ? "is-done" : ""}`,
				attr: { "aria-label": tf.markToday(habit.name) },
			});
			setIcon(check, "check");
			check.onclick = (e) => {
				e.stopPropagation();
				if (!dates.has(today)) {
					playCheckSound();
					check.addClass("th-pop");
				}
				void this.plugin.store.toggleHabit(habit.id, today);
			};
		}

		// no icon for a single habit: icons are only for the category
		const name = row.createDiv({ cls: "th-habit-name" });
		name.createSpan({ text: habit.name });

		const s = streak(dates, today);
		if (s > 0) {
			row.createSpan({ cls: "th-streak", text: `${s}×` });
		}

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
			attr: { "aria-label": tf.deleteNamed(habit.name) },
		});
		setIcon(del, "x");
		del.onclick = (e) => {
			e.stopPropagation();
			if (confirm(tf.deleteHabitConfirm(habit.name))) {
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
			this.renderHabitSettings(card, habit);
		}
	}

	/** Habit settings panel (under the heatmap, when expanded):
	   times per day, free count, cadence and reminders. */
	private renderHabitSettings(card: HTMLElement, habit: Habit): void {
		const key = `s:${habit.id}`;
		const open = this.settingsOpen.has(key);
		const toggle = card.createEl("button", {
			cls: "th-habit-settings-toggle",
			text: open ? t("hideSettings") : t("settings"),
		});
		toggle.onclick = (e) => {
			e.stopPropagation();
			if (open) this.settingsOpen.delete(key);
			else this.settingsOpen.add(key);
			void this.render();
		};
		if (!open) return;

		const panel = card.createDiv({ cls: "th-habit-settings" });

		// — times per day (goal) —
		const goalRow = panel.createDiv({ cls: "th-setting" });
		goalRow.createSpan({ cls: "th-setting-label", text: t("perDay") });
		const stepper = goalRow.createDiv({ cls: "th-stepper" });
		const minusG = stepper.createEl("button", { cls: "th-step-btn", text: "−" });
		const goalVal = stepper.createSpan({ cls: "th-step-val", text: String(habit.goal) });
		const plusG = stepper.createEl("button", { cls: "th-step-btn", text: "+" });
		const setGoal = (v: number) => {
			const g = Math.max(1, v);
			goalVal.setText(String(g));
			void this.plugin.store.setHabitFields(habit.id, { goal: g === 1 ? "" : g });
		};
		minusG.onclick = (e) => { e.stopPropagation(); setGoal(habit.goal - 1); };
		plusG.onclick = (e) => { e.stopPropagation(); setGoal(habit.goal + 1); };

		// — free count (countable) —
		const cntRow = panel.createDiv({ cls: "th-setting" });
		cntRow.createSpan({ cls: "th-setting-label", text: t("freeCount") });
		const cntToggle = cntRow.createEl("button", {
			cls: `th-toggle ${habit.countable ? "is-on" : ""}`,
			attr: { "aria-label": t("freeCount") },
		});
		cntToggle.createSpan({ cls: "th-toggle-knob" });
		cntToggle.onclick = (e) => {
			e.stopPropagation();
			void this.plugin.store.setHabitFields(habit.id, {
				countable: habit.countable ? "" : "true",
			});
		};

		// — cadence (every N days) —
		const cadRow = panel.createDiv({ cls: "th-setting" });
		cadRow.createSpan({ cls: "th-setting-label", text: t("cadence") });
		const cadStep = cadRow.createDiv({ cls: "th-stepper" });
		const minusC = cadStep.createEl("button", { cls: "th-step-btn", text: "−" });
		const cadVal = cadStep.createSpan({ cls: "th-step-val", text: String(habit.cadence) });
		const plusC = cadStep.createEl("button", { cls: "th-step-btn", text: "+" });
		const setCad = (v: number) => {
			const c = Math.max(1, v);
			cadVal.setText(String(c));
			void this.plugin.store.setHabitFields(habit.id, { cadence: c === 1 ? "" : c });
		};
		minusC.onclick = (e) => { e.stopPropagation(); setCad(habit.cadence - 1); };
		plusC.onclick = (e) => { e.stopPropagation(); setCad(habit.cadence + 1); };

		// — reminders (notifications) —
		const remRow = panel.createDiv({ cls: "th-setting th-setting-col" });
		remRow.createSpan({ cls: "th-setting-label", text: t("reminders") });
		const chips = remRow.createDiv({ cls: "th-rem-chips" });
		for (const time of habit.reminders) {
			const chip = chips.createSpan({ cls: "th-rem-chip", text: time });
			const x = chip.createSpan({ cls: "th-rem-chip-x", text: "×" });
			x.onclick = (e) => {
				e.stopPropagation();
				void this.plugin.store.setHabitReminders(
					habit.id,
					habit.reminders.filter((r) => r !== time)
				);
			};
		}
		const addWrap = chips.createDiv({ cls: "th-rem-add" });
		const timeInput = addWrap.createEl("input", {
			cls: "th-rem-input",
			attr: { type: "time" },
		});
		const addBtn = addWrap.createEl("button", { cls: "th-rem-addbtn", text: "+" });
		addBtn.onclick = (e) => {
			e.stopPropagation();
			const v = timeInput.value.trim();
			if (!/^\d{1,2}:\d{2}$/.test(v) || habit.reminders.includes(v)) return;
			void this.plugin.store.setHabitReminders(
				habit.id,
				[...habit.reminders, v].sort()
			);
		};
	}

	/** GitHub-style heatmap: columns = weeks (Mon→Sun), months labelled on top. */
	private renderHeatmap(parent: HTMLElement, dates: Map<string, number>, today: string): void {
		const weeks = this.plugin.settings.heatmapWeeks;
		const scroller = parent.createDiv({ cls: "th-heatmap" });
		const monthsRow = scroller.createDiv({ cls: "th-heatmap-months" });
		const grid = scroller.createDiv({ cls: "th-heatmap-grid" });

		const t0 = new Date();
		const dow = (t0.getDay() + 6) % 7; // 0 = Monday
		const mondayOfThisWeek = addDays(today, -dow);
		const start = addDays(mondayOfThisWeek, -(weeks - 1) * 7);

		let done = 0;
		let prevMonth = "";
		for (let w = 0; w < weeks; w++) {
			const weekStart = addDays(start, w * 7);
			const month = weekStart.slice(0, 7);
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

		parent.createDiv({ cls: "th-heatmap-caption", text: tf.heatmapCaption(done, weeks) });

		requestAnimationFrame(() => {
			scroller.scrollLeft = scroller.scrollWidth;
		});
	}

	private monthShort(iso: string): string {
		const [y, m, d] = iso.split("-").map(Number);
		return new Date(y, m - 1, d).toLocaleDateString(locale(), { month: "short" });
	}

	/* ---------------- Todos (by date) ---------------- */

	private renderTodos(root: HTMLElement, data: TrackerData): void {
		const section = root.createDiv({ cls: "th-section" });
		section.createEl("h2", { text: t("todos"), cls: "th-section-title" });

		this.renderAddForm(section);

		const list = section.createDiv({ cls: "th-todo-scroll" });

		const today = todayISO();
		const week = addDays(today, 7);
		const open = data.todos.filter((t) => !t.done);
		const byPrioThenDue = (a: Todo, b: Todo) =>
			a.priority - b.priority || (a.due ?? "9999").localeCompare(b.due ?? "9999");
		// no date: newest on top (reverse insertion order)
		const byNewest = (a: Todo, b: Todo) => b.lineNo - a.lineNo;

		// Tasks exported from a note get their own section, above everything else.
		const dated = open.filter((td) => !td.source);
		// Events with a future date (and today's) sit above overdue/missed ones;
		// undated tasks go last (newest first).
		const groups: [string, Todo[], string, (a: Todo, b: Todo) => number][] = [
			[t("today"), dated.filter((td) => td.due === today), "", byPrioThenDue],
			[t("next7"), dated.filter((td) => td.due && td.due > today && td.due <= week), "", byPrioThenDue],
			[t("later"), dated.filter((td) => td.due && td.due > week), "", byPrioThenDue],
			[t("overdue"), dated.filter((td) => td.due && td.due < today), "th-group-overdue", byPrioThenDue],
			[t("noDate"), dated.filter((td) => !td.due), "", byNewest],
		];

		if (open.length === 0) {
			list.createDiv({ cls: "th-empty", text: t("allDone") });
		}

		// one section per note, latest export first (sections are appended to Todo.md)
		const bySource = new Map<string, Todo[]>();
		for (const td of open) {
			if (!td.source) continue;
			if (!bySource.has(td.source)) bySource.set(td.source, []);
			bySource.get(td.source)!.push(td);
		}
		for (const [source, todos] of [...bySource].reverse()) {
			const key = `s:${source}`;
			const group = list.createEl("details", {
				cls: "th-group th-group-source",
				attr: this.collapsibleOpen(key),
			});
			this.trackCollapse(group, key);
			const h = group.createEl("summary", { cls: "th-group-title" });
			h.createSpan({ cls: "th-group-name", text: todos[0].list ?? source });
			h.createSpan({ cls: "th-group-count", text: String(todos.length) });
			this.renderNoteLink(h, source);
			for (const todo of todos) this.renderTodoRow(group, todo, today);
		}

		for (const [label, todos, cls, sortFn] of groups) {
			if (todos.length === 0) continue;
			const key = `g:${label}`;
			const group = list.createEl("details", {
				cls: `th-group ${cls}`,
				attr: this.collapsibleOpen(key),
			});
			this.trackCollapse(group, key);
			const h = group.createEl("summary", { cls: "th-group-title" });
			h.createSpan({ text: label });
			h.createSpan({ cls: "th-group-count", text: String(todos.length) });
			for (const todo of todos.sort(sortFn)) {
				this.renderTodoRow(group, todo, today);
			}
		}

		const doneTodos = data.todos.filter((td) => td.done);
		if (doneTodos.length > 0) {
			const details = list.createEl("details", { cls: "th-done-group" });
			details.createEl("summary", { text: tf.completed(doneTodos.length) });
			for (const todo of doneTodos
				.sort((a, b) => (b.doneDate ?? "").localeCompare(a.doneDate ?? ""))
				.slice(0, 30)) {
				this.renderTodoRow(details, todo, today);
			}
		}
	}

	/* ---------------- Todos (folders: list → section) ---------------- */

	private renderFolders(root: HTMLElement, data: TrackerData): void {
		const section = root.createDiv({ cls: "th-section" });
		section.createEl("h2", { text: t("tasks"), cls: "th-section-title" });
		this.renderAddForm(section);

		const today = todayISO();
		const open = data.todos.filter((td) => !td.done);
		const lists = new Map<string, Map<string, Todo[]>>();
		for (const td of open) {
			const l = td.list || t("inbox");
			const s = td.section || "";
			if (!lists.has(l)) lists.set(l, new Map());
			const secs = lists.get(l)!;
			if (!secs.has(s)) secs.set(s, []);
			secs.get(s)!.push(td);
		}

		if (open.length === 0) {
			section.createDiv({ cls: "th-empty", text: t("allDone") });
			return;
		}

		const scroll = section.createDiv({ cls: "th-todo-scroll" });
		for (const [listName, secs] of lists) {
			const folder = scroll.createEl("details", { cls: "th-folder", attr: { open: "" } });
			const sum = folder.createEl("summary", { cls: "th-folder-title" });
			sum.createSpan({ text: listName });
			const count = [...secs.values()].reduce((a, b) => a + b.length, 0);
			sum.createSpan({ cls: "th-group-count", text: String(count) });
			const source = [...secs.values()][0][0].source;
			if (source) this.renderNoteLink(sum, source);

			for (const [secName, todos] of secs) {
				if (secName) {
					const sub = folder.createEl("details", { cls: "th-subfolder", attr: { open: "" } });
					const ssum = sub.createEl("summary", { cls: "th-subfolder-title" });
					ssum.createSpan({ text: secName });
					ssum.createSpan({ cls: "th-group-count", text: String(todos.length) });
					for (const todo of todos) this.renderTodoRow(sub, todo, today);
				} else {
					for (const todo of todos) this.renderTodoRow(folder, todo, today);
				}
			}
		}
	}

	/** Button that opens the note a section's tasks were exported from. */
	private renderNoteLink(parent: HTMLElement, source: string): void {
		const btn = parent.createEl("button", {
			cls: "th-note-link",
			attr: { "aria-label": t("openNote"), title: t("openNote") },
		});
		setIcon(btn, "arrow-up-right");
		btn.onclick = (e) => {
			// inside a <summary>: don't toggle the group
			e.preventDefault();
			e.stopPropagation();
			void this.plugin.app.workspace.openLinkText(source, this.plugin.store.todoPath, Platform.isMobile ? false : "tab");
		};
	}

	private renderAddForm(section: HTMLElement): void {
		const form = section.createDiv({ cls: "th-add" });
		const input = form.createEl("input", {
			cls: "th-add-text",
			attr: { type: "text", placeholder: t("newTask") },
		});
		const date = form.createEl("input", {
			cls: "th-add-date",
			attr: { type: "date", "aria-label": t("dueDate") },
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
				text: p === Priority.None ? t("priority") : `${PRIORITY_EMOJI[p]} ${prioLabel(p)}`,
				attr: { value: String(p) },
			});
		}
		prio.value = String(Priority.None);
		const btn = form.createEl("button", { cls: "th-add-btn", attr: { "aria-label": t("add") } });
		setIcon(btn, "plus");

		const submit = async () => {
			const text = input.value.trim();
			if (!text) return;
			const p = Number(prio.value) as Priority;
			// expected line, to animate its appearance on the next render
			this.pendingNew = serializeTodo(text, p, date.value || null);
			await this.plugin.store.addTodo(text, p, date.value || null);
			input.value = "";
		};
		btn.onclick = submit;
		input.onkeydown = (e) => {
			if (e.key === "Enter") void submit();
		};
	}

	private renderTodoRow(parent: HTMLElement, todo: Todo, today: string): void {
		const wrap = parent.createDiv({ cls: `th-todo ${todo.done ? "is-done" : ""}` });
		// animated appearance of the just-created task (inverse of the collapse)
		if (this.pendingNew && todo.raw === this.pendingNew) {
			wrap.addClass("th-appear");
			this.pendingNew = null;
		}
		const row = wrap.createDiv({ cls: "th-todo-main" });

		const check = row.createEl("button", {
			cls: `th-check th-check-sm ${todo.done ? "is-done" : ""}`,
			attr: { "aria-label": todo.done ? t("reopen") : t("complete") },
		});
		setIcon(check, "check");
		check.onclick = (e) => {
			e.stopPropagation();
			if (todo.done) {
				void this.plugin.store.toggleTodo(todo);
				return;
			}
			// first the checkbox-fill animation (+ sound),
			// then, once done, the collapse with the gaussian curve
			playCheckSound();
			check.addClass("is-done");
			check.addClass("th-pop");
			window.setTimeout(() => collapseThenRun(wrap, () => void this.plugin.store.toggleTodo(todo)), 300);
		};

		// pencil button next to the icon: appears on hover, opens the edit popup
		const editBtn = row.createEl("button", { cls: "th-edit", attr: { "aria-label": t("editTask") } });
		setIcon(editBtn, "pencil");
		editBtn.onclick = (e) => {
			e.stopPropagation();
			new TaskEditModal(this.plugin, todo).open();
		};

		if (todo.priority !== Priority.None) {
			row.createSpan({
				cls: `th-prio-dot ${PRIO_CLASS[todo.priority]}`,
				attr: { "aria-label": prioLabel(todo.priority) },
			});
		}

		const text = row.createDiv({ cls: "th-todo-text", attr: { title: t("clickToRename") } });
		renderRich(text, todo.text);
		// click on the text = inline rename (but not on the links inside the text)
		text.onclick = (e) => {
			if ((e.target as HTMLElement).closest("a")) return;
			e.stopPropagation();
			this.startRename(text, todo);
		};

		if (todo.due || todo.time) {
			const overdue = !todo.done && !!todo.due && todo.due < today;
			const dateText = todo.due
				? todo.due === today
					? t("dueToday")
					: this.formatDue(todo.due)
				: "";
			row.createSpan({
				cls: `th-due ${overdue ? "is-overdue" : ""}`,
				text: [dateText, todo.time].filter(Boolean).join(" "),
			});
		}

		const del = row.createEl("button", { cls: "th-del", attr: { "aria-label": t("delete") } });
		setIcon(del, "x");
		del.onclick = (e) => {
			e.stopPropagation();
			void this.plugin.store.deleteTodo(todo);
		};

		if (todo.description) {
			const desc = wrap.createDiv({ cls: "th-todo-desc" });
			for (const line of todo.description.split("\n")) {
				renderRich(desc.createDiv(), line);
			}
		}
	}

	/** Inline rename: replace the text with an input, save on Enter/blur. */
	private startRename(el: HTMLElement, todo: Todo): void {
		const input = document.createElement("input");
		input.type = "text";
		input.value = todo.text;
		input.className = "th-todo-rename";
		el.replaceWith(input);
		input.focus();
		input.select();
		let done = false;
		const commit = (save: boolean) => {
			if (done) return;
			done = true;
			const v = input.value.trim();
			if (save && v && v !== todo.text) {
				void this.plugin.store.updateTodo(todo, { text: v });
			} else {
				void this.render();
			}
		};
		input.onkeydown = (e) => {
			if (e.key === "Enter") commit(true);
			if (e.key === "Escape") commit(false);
		};
		input.onblur = () => commit(true);
	}

	private formatDue(iso: string): string {
		const [y, m, d] = iso.split("-").map(Number);
		const date = new Date(y, m - 1, d);
		const sameYear = y === new Date().getFullYear();
		return date.toLocaleDateString(locale(), {
			day: "numeric",
			month: "short",
			...(sameYear ? {} : { year: "numeric" }),
		});
	}
}
