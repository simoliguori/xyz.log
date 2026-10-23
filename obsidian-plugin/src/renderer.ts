import { App, getIconIds, Modal, Platform, setIcon } from "obsidian";
import type XyzlogPlugin from "./main";
import { addDays, PRIORITY_EMOJI, streak, todayISO } from "./parser";
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
	/** intestazione con la data (attiva nella vista, spenta di default negli embed) */
	header: boolean;
	habits: boolean;
	todos: boolean;
	/** layout dashboard: todo a sinistra, abitudini + cronologia a destra */
	cross: boolean;
	/** vista a cartelle: todo raggruppati per lista → sezione, con descrizioni */
	folders: boolean;
	/** se presente, mostra solo questa abitudine con la heatmap già espansa */
	habitId?: string;
}

/** Testo con link markdown `[t](url)`, URL nudi e #tag resi cliccabili. */
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

/** Contenitori scrollabili di cui preservare la posizione tra un render e l'altro. */
const TH_SCROLLERS = [
	".th-todo-scroll",
	".th-habit-scroll",
	".th-cross-cell--todo",
	".th-cross-cell--habits",
	".th-cross-cell--history",
];

/** Suono breve e morbido alla spunta (Web Audio, nessun file esterno). */
let thAudioCtx: AudioContext | null = null;
function playCheckSound(): void {
	try {
		const Ctx = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
			|| (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctx) return;
		if (!thAudioCtx) thAudioCtx = new Ctx();
		const ctx = thAudioCtx;
		if (ctx.state === "suspended") void ctx.resume();
		const o = ctx.createOscillator();
		const g = ctx.createGain();
		o.type = "sine";
		o.connect(g);
		g.connect(ctx.destination);
		const t0 = ctx.currentTime;
		o.frequency.setValueAtTime(620, t0);
		o.frequency.exponentialRampToValueAtTime(920, t0 + 0.1);
		g.gain.setValueAtTime(0.0001, t0);
		g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.012);
		g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.19);
		o.start(t0);
		o.stop(t0 + 0.2);
	} catch (e) {
		/* audio non disponibile: ignora */
	}
}

/** Collassa l'elemento (altezza → 0) e poi esegue `fn`, per far scivolare su le righe sotto. */
function collapseThenRun(el: HTMLElement, fn: () => void): void {
	el.style.maxHeight = `${el.scrollHeight}px`;
	el.style.overflow = "hidden";
	void el.offsetHeight; // reflow
	el.addClass("th-collapsing");
	window.setTimeout(fn, 240);
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

/**
 * Rendering condiviso tra la vista dedicata e i code block `xyz.log`
 * incorporati nelle note.
 */
export class TrackerRenderer {
	private expanded = new Set<string>();
	/** chiavi dei gruppi/categorie chiusi, per preservare il collasso tra i render */
	private collapsed = new Set<string>();
	/** pannello impostazioni aperto sotto l'abitudine espansa */
	private settingsOpen = new Set<string>();
	/** pagina attiva dello swipe mobile (0 = abitudini, 1 = attività) */
	private swipeIndex = 0;

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

	/** Su mobile, quando si mostrano sia abitudini sia attività, si passa da una
	   all'altra con lo swipe (o i due tab in alto) invece di impilarle. */
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

		// ripristina la pagina attiva dopo il re-render (senza animazione)
		requestAnimationFrame(() => {
			track.scrollLeft = this.swipeIndex * track.clientWidth;
		});
	}

	/** Posizione di scroll dei contenitori, così lo spunto non riporta in cima. */
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

	/* ---------------- Layout dashboard ---------------- */

	private renderCross(root: HTMLElement, data: TrackerData): void {
		root.addClass("th-cross");
		if (this.opts.header) this.renderHeader(root);
		const today = todayISO();

		const grid = root.createDiv({ cls: "th-cross-grid" });
		const todoCell = grid.createDiv({ cls: "th-cross-cell th-cross-cell--todo" });
		const habitsCell = grid.createDiv({ cls: "th-cross-cell th-cross-cell--habits" });
		const historyCell = grid.createDiv({ cls: "th-cross-cell th-cross-cell--history" });

		this.renderTodos(todoCell, data);
		this.renderHabits(habitsCell, data);
		this.renderHistoryCell(historyCell, data, today);
	}

	/** Panoramica cronologia: una riga compatta per abitudine, raggruppata per categoria. */
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

	/** Una riga: nome abitudine + striscia compatta degli ultimi giorni. */
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

	/* ---------------- Abitudini ---------------- */

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

		this.renderHabitAddForm(section);

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
		head.createSpan({ cls: "th-group-count", text: String(habs.length) });

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
			attr: { type: "button", "aria-label": t("chooseIcon") },
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
		const countToday = dates.get(today) ?? 0;
		const counterMode = habit.countable || habit.goal > 1;
		const doneToday = !habit.countable && countToday >= habit.goal;
		const card = parent.createDiv({ cls: `th-habit ${doneToday ? "is-done" : ""}` });
		const row = card.createDiv({ cls: "th-habit-row" });

		if (counterMode) {
			// più volte al giorno (goal > 1) o conteggio libero (countable):
			// tap = +1; il tasto "−" accanto = −1 (funziona anche su mobile, dove
			// non esiste il clic destro).
			const label = habit.countable ? String(countToday) : `${countToday}/${habit.goal}`;
			const counter = row.createEl("button", {
				cls: `th-count th-count-wide ${doneToday ? "is-done" : ""}`,
				text: label,
				attr: { "aria-label": tf.markToday(habit.name), title: tf.markToday(habit.name) },
			});
			const atGoal = !habit.countable && countToday >= habit.goal;
			counter.onclick = (e) => {
				e.stopPropagation();
				if (atGoal) return; // goal raggiunto: non si va oltre
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

		const iconBtn = row.createEl("button", {
			cls: "th-icon-btn",
			attr: { "aria-label": tf.iconOf(habit.name) },
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

	/** Pannello impostazioni dell'abitudine (sotto la heatmap, quando è espansa):
	   quante volte al giorno, conteggio libero, cadenza e promemoria. */
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

		// — quante volte al giorno (goal) —
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

		// — conteggio libero (countable) —
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

		// — cadenza (ogni N giorni) —
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

		// — promemoria (notifiche) —
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

	/** Heatmap tipo GitHub: colonne = settimane (lun→dom), mesi segnati in alto. */
	private renderHeatmap(parent: HTMLElement, dates: Map<string, number>, today: string): void {
		const weeks = this.plugin.settings.heatmapWeeks;
		const scroller = parent.createDiv({ cls: "th-heatmap" });
		const monthsRow = scroller.createDiv({ cls: "th-heatmap-months" });
		const grid = scroller.createDiv({ cls: "th-heatmap-grid" });

		const t0 = new Date();
		const dow = (t0.getDay() + 6) % 7; // 0 = lunedì
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

	/* ---------------- Todo (per data) ---------------- */

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

		// Gli eventi con data futura (e di oggi) stanno sopra quelli scaduti/mancati;
		// le task senza data chiudono in fondo.
		const groups: [string, Todo[], string][] = [
			[t("today"), open.filter((td) => td.due === today), ""],
			[t("next7"), open.filter((td) => td.due && td.due > today && td.due <= week), ""],
			[t("later"), open.filter((td) => td.due && td.due > week), ""],
			[t("overdue"), open.filter((td) => td.due && td.due < today), "th-group-overdue"],
			[t("noDate"), open.filter((td) => !td.due), ""],
		];

		if (open.length === 0) {
			list.createDiv({ cls: "th-empty", text: t("allDone") });
		}

		for (const [label, todos, cls] of groups) {
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
			for (const todo of todos.sort(byPrioThenDue)) {
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

	/* ---------------- Todo (a cartelle: lista → sezione) ---------------- */

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
			await this.plugin.store.addTodo(text, Number(prio.value) as Priority, date.value || null);
			input.value = "";
		};
		btn.onclick = submit;
		input.onkeydown = (e) => {
			if (e.key === "Enter") void submit();
		};
	}

	private renderTodoRow(parent: HTMLElement, todo: Todo, today: string): void {
		const wrap = parent.createDiv({ cls: `th-todo ${todo.done ? "is-done" : ""}` });
		const row = wrap.createDiv({ cls: "th-todo-main" });

		const check = row.createEl("button", {
			cls: `th-check th-check-sm ${todo.done ? "is-done" : ""}`,
			attr: { "aria-label": todo.done ? t("reopen") : t("complete") },
		});
		setIcon(check, "check");
		check.onclick = () => {
			if (todo.done) {
				void this.plugin.store.toggleTodo(todo);
				return;
			}
			playCheckSound();
			check.addClass("is-done");
			check.addClass("th-pop");
			collapseThenRun(wrap, () => void this.plugin.store.toggleTodo(todo));
		};

		if (todo.priority !== Priority.None) {
			row.createSpan({
				cls: `th-prio-dot ${PRIO_CLASS[todo.priority]}`,
				attr: { "aria-label": prioLabel(todo.priority) },
			});
		}

		const text = row.createDiv({ cls: "th-todo-text" });
		renderRich(text, todo.text);

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
		del.onclick = () => void this.plugin.store.deleteTodo(todo);

		if (todo.description) {
			const desc = wrap.createDiv({ cls: "th-todo-desc" });
			for (const line of todo.description.split("\n")) {
				renderRich(desc.createDiv(), line);
			}
		}
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
