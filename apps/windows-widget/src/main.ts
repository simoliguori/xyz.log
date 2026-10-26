import {
	addHabitToFrontmatter,
	appendLine,
	collectReminders,
	logLine,
	parseCategories,
	parseHabits,
	parseLog,
	parseTodos,
	PRIORITY_EMOJI,
	Priority,
	removeHabitFromFrontmatter,
	replaceLine,
	serializeTimeList,
	serializeTodo,
	setHabitFieldsInFrontmatter,
	slugifyHabitId,
	todayISO,
	toggleLog,
	toggleTodoLine,
	Todo,
	TrackerData,
	updateTodoLine,
} from "@xyzlog/core";
import { createBackend, type Backend, type FileKey, type VaultFiles } from "./backend";
import { clear, el } from "./dom";
import { COLS, MAX_H, newTile, Tile, TILE_META, TileType, uid, type AppConfig, type TabLayout } from "./layout";
import { renderTileBody, type RenderCtx, type Store } from "./render";

/** Logo: quadrato arrotondato con spunta, usato nell'intro e nell'onboarding. */
const LOGO_SVG = `<svg class="xl-logo-svg" viewBox="0 0 120 120" aria-hidden="true">
	<rect x="10" y="10" width="100" height="100" rx="26" class="xl-logo-bg" />
	<path d="M38 62 L53 77 L84 42" class="xl-logo-check" fill="none" />
</svg>`;

class App {
	private backend: Backend = createBackend();
	private config!: AppConfig;
	private files: VaultFiles = { habits: "", log: "", todo: "" };
	private data: TrackerData = { habits: [], categories: [], log: new Map(), todos: [] };
	private activeTab = 0;
	private edit = false;
	private showSettings = false;
	private intro = true;
	private docked = false;
	private brand: HTMLElement | null = null;
	private veil: HTMLElement | null = null;
	private obsAccent: string | null = null;
	private expanded = new Set<string>();
	private settingsOpen = new Set<string>();
	private editing: Todo | null = null;
	private root: HTMLElement;

	constructor(root: HTMLElement) {
		this.root = root;
	}

	async init(): Promise<void> {
		this.config = await this.backend.getConfig();
		this.applyTheme();
		this.backend.onFilesChanged(() => void this.reload());
		// dati pronti PRIMA del primo disegno: niente schermata vuota
		await this.loadData();
		if (this.config.syncAccent) {
			this.obsAccent = await this.backend.obsidianAccent();
			this.applyTheme();
		}
		this.ensureBrand();
		this.render();
		this.playIntro();
	}

	private ensureBrand(): void {
		if (this.brand) return;
		this.brand = el("div", { cls: "xl-brand", html: LOGO_SVG });
		document.body.appendChild(this.brand);
	}

	/** Intro coreografata: logo dal centro all'header + contenuto che entra
	   insieme, sotto un velo "liquid glass" che si dissolve. */
	private playIntro(): void {
		const veil = el("div", { cls: "xl-veil" });
		this.veil = veil;
		document.body.appendChild(veil);
		// il logo si aggancia in alto mentre il contenuto è già entrato
		window.setTimeout(() => {
			this.docked = true;
			this.brand?.classList.add("is-docked");
		}, 560);
		// fine intro: niente più classe d'entrata, il velo sfuma e viene rimosso
		window.setTimeout(() => {
			this.intro = false;
			this.root.classList.remove("xl-intro");
			window.setTimeout(() => {
				veil.remove();
				if (this.veil === veil) this.veil = null;
			}, 200);
		}, 1500);
	}

	private async loadData(): Promise<void> {
		this.files = await this.backend.readFiles();
		this.parse();
		void this.backend.syncReminders(collectReminders(this.data));
	}

	private async reload(): Promise<void> {
		await this.loadData();
		this.render();
	}

	private parse(): void {
		this.data = {
			habits: parseHabits(this.files.habits),
			categories: parseCategories(this.files.habits),
			log: parseLog(this.files.log),
			todos: parseTodos(this.files.todo),
		};
	}

	/** accent effettivo: quello di Obsidian se la sync è attiva, altrimenti il custom */
	private effectiveAccent(): string {
		return this.config.syncAccent && this.obsAccent ? this.obsAccent : this.config.accent;
	}

	private applyTheme(): void {
		const r = document.documentElement;
		r.style.setProperty("--xl-accent", this.effectiveAccent());
		r.style.setProperty("--xl-opacity", String(this.config.opacity / 100));
		document.documentElement.lang = this.config.lang;
	}

	/* ---------- scrittura (store) ---------- */

	private async mutate(which: FileKey, content: string): Promise<void> {
		this.files[which] = content;
		await this.backend.writeFile(which, content);
		this.parse();
		void this.backend.syncReminders(collectReminders(this.data));
		this.render();
	}

	private store: Store = {
		toggleHabit: (id, date) => void this.mutate("log", toggleLog(this.files.log, date, id)),
		incrementHabit: (id, date) => void this.mutate("log", appendLine(this.files.log, logLine(date, id))),
		decrementHabit: (id, date) => {
			const lines = this.files.log.split(/\r?\n/);
			const idx = lines.findIndex((l) => l.trim() === logLine(date, id));
			if (idx >= 0) {
				lines.splice(idx, 1);
				void this.mutate("log", lines.join("\n"));
			}
		},
		toggleTodo: (todo) =>
			void this.mutate("todo", replaceLine(this.files.todo, todo.raw, (l) => toggleTodoLine(l, todayISO()))),
		deleteTodo: (todo) => void this.mutate("todo", replaceLine(this.files.todo, todo.raw, () => null)),
		updateTodo: (todo, fields) =>
			void this.mutate("todo", replaceLine(this.files.todo, todo.raw, () => updateTodoLine(todo, fields))),
		addTodo: (text, prio, due, time) =>
			void this.mutate("todo", appendLine(this.files.todo, serializeTodo(text, prio, due, time))),
		addHabit: (name) => {
			const existing = parseHabits(this.files.habits);
			const base = slugifyHabitId(name);
			let id = base;
			let n = 2;
			while (existing.some((h) => h.id === id)) id = `${base}-${n++}`;
			void this.mutate("habits", addHabitToFrontmatter(this.files.habits, { id, name }));
		},
		deleteHabit: (id) => void this.mutate("habits", removeHabitFromFrontmatter(this.files.habits, id)),
		setHabitFields: (id, fields) => void this.mutate("habits", setHabitFieldsInFrontmatter(this.files.habits, id, fields)),
		setHabitReminders: (id, times) =>
			void this.mutate(
				"habits",
				setHabitFieldsInFrontmatter(this.files.habits, id, { reminders: times.length ? serializeTimeList(times) : "" })
			),
	};

	private ctx(): RenderCtx {
		return {
			data: this.data,
			today: todayISO(),
			lang: this.config.lang,
			store: this.store,
			expanded: this.expanded,
			settingsOpen: this.settingsOpen,
			heatmapWeeks: 52,
			rerender: () => this.render(),
			editTodo: (todo) => {
				this.editing = todo;
				this.render();
			},
		};
	}

	private tab(): TabLayout {
		return this.config.tabs[this.activeTab] ?? this.config.tabs[0];
	}

	private saveConfig(): void {
		void this.backend.setConfig(this.config);
	}

	/* ---------- render ---------- */

	private render(): void {
		// smonta eventuali timer dei riquadri (header clock)
		this.root.querySelectorAll(".xl-tile-body").forEach((n) => n.dispatchEvent(new Event("xl-dispose")));
		clear(this.root);
		this.ensureBrand();
		this.root.classList.toggle("xl-intro", this.intro);
		this.brand?.classList.toggle("is-docked", this.docked);
		if (!this.config.folder) {
			this.root.appendChild(this.onboarding());
			return;
		}
		this.root.appendChild(this.topBar());
		if (this.edit) this.root.appendChild(this.addTileBar());
		this.root.appendChild(this.grid());
		if (this.showSettings) this.root.appendChild(this.settingsOverlay());
		if (this.editing) this.root.appendChild(this.taskModal(this.editing));
	}

	/* ---------- popup modifica task (glass) ---------- */

	private taskModal(todo: Todo): HTMLElement {
		const T = (it: string, en: string) => (this.config.lang === "it" ? it : en);
		const close = () => {
			this.editing = null;
			this.render();
		};
		const overlay = el("div", { cls: "xl-overlay" });
		overlay.onclick = (e) => {
			if (e.target === overlay) close();
		};
		const panel = el("div", { cls: "xl-task-modal" });
		panel.appendChild(el("div", { cls: "xl-tm-title", text: T("Modifica attività", "Edit task") }));

		const textInput = el("input", { cls: "xl-tm-text", attr: { type: "text", value: todo.text } }) as HTMLInputElement;
		panel.appendChild(textInput);

		const row = el("div", { cls: "xl-tm-row" });
		const dateInput = el("input", { cls: "xl-tm-date", attr: { type: "date", value: todo.due ?? "" } }) as HTMLInputElement;
		const timeInput = el("input", { cls: "xl-tm-time", attr: { type: "time", value: todo.time ?? "" } }) as HTMLInputElement;
		const prio = el("select", { cls: "xl-tm-prio" }) as HTMLSelectElement;
		for (const p of [Priority.None, Priority.Lowest, Priority.Low, Priority.Medium, Priority.High, Priority.Highest]) {
			const opt = el("option", { text: p === Priority.None ? "—" : PRIORITY_EMOJI[p], attr: { value: String(p) } });
			if (p === todo.priority) opt.setAttribute("selected", "");
			prio.appendChild(opt);
		}
		prio.value = String(todo.priority);
		row.append(dateInput, timeInput, prio);
		panel.appendChild(row);

		const actions = el("div", { cls: "xl-tm-actions" });
		const cancel = el("button", { cls: "xl-tm-cancel", text: T("Annulla", "Cancel") });
		cancel.onclick = close;
		const save = el("button", { cls: "xl-tm-save", text: T("Salva", "Save") });
		const commit = () => {
			this.store.updateTodo(todo, {
				text: textInput.value.trim() || todo.text,
				priority: Number(prio.value) as Priority,
				due: dateInput.value || null,
				time: timeInput.value || null,
			});
			this.editing = null;
			this.render();
		};
		save.onclick = commit;
		textInput.onkeydown = (e) => {
			if (e.key === "Enter") commit();
			if (e.key === "Escape") close();
		};
		actions.append(cancel, save);
		panel.appendChild(actions);
		overlay.appendChild(panel);
		requestAnimationFrame(() => textInput.focus());
		return overlay;
	}

	/* ---------- controlli finestra (niente barra di Windows) ---------- */

	private winButtons(): HTMLElement[] {
		const min = el("button", { cls: "xl-win-btn", text: "–", attr: { title: this.config.lang === "it" ? "Riduci a icona" : "Minimize" } });
		min.onclick = () => void this.backend.minimizeWindow();
		const close = el("button", { cls: "xl-win-btn xl-win-close", text: "✕", attr: { title: this.config.lang === "it" ? "Chiudi" : "Close" } });
		close.onclick = () => void this.backend.closeWindow();
		return [min, close];
	}

	/* ---------- onboarding ---------- */

	private onboarding(): HTMLElement {
		const T = (it: string, en: string) => (this.config.lang === "it" ? it : en);
		const wrap = el("div", { cls: "xl-onboard" });

		const bar = el("div", { cls: "xl-onboard-bar" });
		const spacer = el("div", { cls: "xl-onboard-barspace" });
		bar.append(spacer, ...this.winButtons());
		wrap.appendChild(bar);

		const card = el("div", { cls: "xl-onboard-card" });
		// niente logo qui: l'intro mostra già il logo che sale, evitando il doppione
		card.appendChild(el("div", { cls: "xl-onboard-title", text: "xyz.log" }));
		card.appendChild(
			el("div", {
				cls: "xl-onboard-sub",
				text: T(
					"Un tracker modulare di abitudini e attività, costruito su semplici file .md.",
					"A modular habit & task tracker, built on plain .md files."
				),
			})
		);
		const chips = el("div", { cls: "xl-onboard-chips" });
		for (const label of [T("Modulare", "Modular"), "Markdown", T("Locale", "Local-first"), "Obsidian"]) {
			chips.appendChild(el("span", { cls: "xl-onboard-chip", text: label }));
		}
		card.appendChild(chips);

		const link = el("button", { cls: "xl-onboard-btn", text: T("Collega il tuo vault Obsidian", "Link your Obsidian vault") });
		link.onclick = async () => {
			const f = await this.backend.pickFolder();
			if (!f) return;
			this.config.folder = f;
			this.saveConfig();
			if (this.config.syncAccent) {
				this.obsAccent = await this.backend.obsidianAccent();
				this.applyTheme();
			}
			await this.loadData();
			this.render();
		};
		card.appendChild(link);
		card.appendChild(el("div", { cls: "xl-onboard-hint", text: T("Scegli la cartella «Tracker» dentro il tuo vault.", "Pick the “Tracker” folder inside your vault.") }));

		card.appendChild(
			this.toggleRow(T("Avvia all'accensione", "Start on boot"), this.config.autostart, (on) => {
				this.config.autostart = on;
				this.saveConfig();
				void this.backend.setAutostart(on);
			})
		);
		card.appendChild(
			this.toggleRow(T("Resta sul desktop", "Stay on the desktop"), this.config.pinned, (on) => {
				this.config.pinned = on;
				this.saveConfig();
				void this.backend.setPinned(on);
			})
		);

		card.appendChild(el("div", { cls: "xl-onboard-foot", text: T("Funziona interamente in Markdown, sincronizzato con Obsidian.", "Works entirely in Markdown, synced with Obsidian.") }));
		wrap.appendChild(card);
		return wrap;
	}

	private topBar(): HTMLElement {
		const bar = el("div", { cls: "xl-topbar" });
		// spazio riservato dove si "solidifica" il logo dell'intro, poi il nome
		bar.appendChild(el("div", { cls: "xl-logo-slot" }));
		bar.appendChild(el("div", { cls: "xl-logo", text: "xyz.log" }));

		const tabs = el("div", { cls: "xl-tabs" });
		this.config.tabs.forEach((t, i) => {
			const tab = el("button", { cls: `xl-tab ${i === this.activeTab ? "is-active" : ""}`, text: t.name });
			tab.onclick = () => {
				this.activeTab = i;
				this.render();
			};
			if (this.edit) {
				tab.ondblclick = () => this.renameTab(i);
				const x = el("span", { cls: "xl-tab-x", text: "×" });
				x.onclick = (e) => {
					e.stopPropagation();
					this.deleteTab(i);
				};
				tab.appendChild(x);
			}
			tabs.appendChild(tab);
		});
		if (this.edit) {
			const addTab = el("button", { cls: "xl-tab xl-tab-add", text: "+" });
			addTab.onclick = () => this.addTab();
			tabs.appendChild(addTab);
		}
		bar.appendChild(tabs);

		const actions = el("div", { cls: "xl-actions" });
		const editBtn = el("button", { cls: `xl-icon-btn ${this.edit ? "is-on" : ""}`, text: this.edit ? "✓" : "✎", attr: { title: this.config.lang === "it" ? "Modifica layout" : "Edit layout" } });
		editBtn.onclick = () => {
			this.edit = !this.edit;
			this.render();
		};
		const gear = el("button", { cls: "xl-icon-btn", text: "⚙", attr: { title: "Setup" } });
		gear.onclick = () => {
			this.showSettings = true;
			this.render();
		};
		actions.append(editBtn, gear, ...this.winButtons());
		bar.appendChild(actions);
		return bar;
	}

	private addTileBar(): HTMLElement {
		const bar = el("div", { cls: "xl-addtile" });
		bar.appendChild(el("span", { cls: "xl-addtile-label", text: this.config.lang === "it" ? "Aggiungi riquadro:" : "Add tile:" }));
		(Object.keys(TILE_META) as TileType[]).forEach((type) => {
			const meta = TILE_META[type];
			const btn = el("button", { cls: "xl-addtile-btn", text: `${meta.icon} ${this.config.lang === "it" ? meta.it : meta.en}` });
			btn.onclick = () => {
				this.tab().tiles.push(newTile(type));
				this.saveConfig();
				this.render();
			};
			bar.appendChild(btn);
		});
		return bar;
	}

	private grid(): HTMLElement {
		const grid = el("div", { cls: `xl-grid ${this.edit ? "is-edit" : ""}` });
		grid.style.gridTemplateColumns = `repeat(${COLS}, 1fr)`;
		const tiles = this.tab().tiles;
		tiles.forEach((tile, i) => grid.appendChild(this.tileEl(tile, i)));
		if (tiles.length === 0) {
			grid.appendChild(el("div", { cls: "xl-empty", text: this.config.lang === "it" ? "Nessun riquadro. Attiva ✎ e aggiungine uno." : "No tiles. Enable ✎ and add one." }));
		}
		this.attachSwipe(grid);
		return grid;
	}

	private tileEl(tile: Tile, index: number): HTMLElement {
		const node = el("div", { cls: "xl-tile" });
		node.style.gridColumn = `span ${Math.min(tile.w, COLS)}`;
		node.style.gridRow = `span ${tile.h}`;

		if (this.edit) {
			node.appendChild(this.tileChrome(tile, index, node));
			node.setAttribute("draggable", "true");
			node.addEventListener("dragstart", (e) => {
				e.dataTransfer?.setData("text/plain", String(index));
				node.classList.add("is-dragging");
			});
			node.addEventListener("dragend", () => node.classList.remove("is-dragging"));
			node.addEventListener("dragover", (e) => e.preventDefault());
			node.addEventListener("drop", (e) => {
				e.preventDefault();
				const from = Number(e.dataTransfer?.getData("text/plain"));
				if (!Number.isNaN(from) && from !== index) this.moveTile(from, index);
			});
		}

		const body = el("div", { cls: "xl-tile-body" });
		renderTileBody(body, tile.type, tile.habitId, this.ctx());
		node.appendChild(body);
		return node;
	}

	private tileChrome(tile: Tile, index: number, node: HTMLElement): HTMLElement {
		const bar = el("div", { cls: "xl-tile-chrome" });
		bar.appendChild(el("span", { cls: "xl-tile-handle", text: "⠿" }));
		const meta = TILE_META[tile.type];
		bar.appendChild(el("span", { cls: "xl-tile-type", text: this.config.lang === "it" ? meta.it : meta.en }));

		if (tile.type === "habit") {
			const sel = el("select", { cls: "xl-tile-habitsel" }) as HTMLSelectElement;
			sel.appendChild(el("option", { text: "—", attr: { value: "" } }));
			for (const h of this.data.habits) {
				const opt = el("option", { text: h.name, attr: { value: h.id } });
				if (h.id === tile.habitId) opt.setAttribute("selected", "");
				sel.appendChild(opt);
			}
			sel.onchange = () => {
				tile.habitId = sel.value || undefined;
				this.saveConfig();
				this.render();
			};
			bar.appendChild(sel);
		}

		const size = el("div", { cls: "xl-tile-size" });
		size.appendChild(this.sizeStepper("W", tile.w, 1, COLS, (v) => { tile.w = v; }));
		size.appendChild(this.sizeStepper("H", tile.h, 1, MAX_H, (v) => { tile.h = v; }));
		bar.appendChild(size);

		const del = el("button", { cls: "xl-tile-del", text: "×" });
		del.onclick = () => {
			this.tab().tiles.splice(index, 1);
			this.saveConfig();
			this.render();
		};
		bar.appendChild(del);

		// maniglia di ridimensionamento ad angolo (trascinamento)
		const handle = el("div", { cls: "xl-resize-handle", text: "⤡" });
		this.pointerResize(handle, node, tile);
		node.appendChild(handle);
		return bar;
	}

	private sizeStepper(label: string, value: number, min: number, max: number, set: (v: number) => void): HTMLElement {
		const wrap = el("div", { cls: "xl-size-step" });
		wrap.appendChild(el("span", { cls: "xl-size-label", text: label }));
		const val = el("span", { cls: "xl-size-val", text: String(value) });
		const minus = el("button", { cls: "xl-step-btn", text: "−" });
		const plus = el("button", { cls: "xl-step-btn", text: "+" });
		minus.onclick = () => {
			const v = Math.max(min, value - 1);
			set(v);
			this.saveConfig();
			this.render();
		};
		plus.onclick = () => {
			const v = Math.min(max, value + 1);
			set(v);
			this.saveConfig();
			this.render();
		};
		wrap.append(minus, val, plus);
		return wrap;
	}

	private pointerResize(handle: HTMLElement, node: HTMLElement, tile: Tile): void {
		handle.addEventListener("pointerdown", (e) => {
			e.preventDefault();
			e.stopPropagation();
			const grid = node.parentElement!;
			const gap = 10;
			const cellW = (grid.clientWidth - gap * (COLS - 1)) / COLS;
			const rowH = 92 + gap;
			const startX = e.clientX;
			const startY = e.clientY;
			const startW = tile.w;
			const startH = tile.h;
			const move = (ev: PointerEvent) => {
				const dw = Math.round((ev.clientX - startX) / (cellW + gap));
				const dh = Math.round((ev.clientY - startY) / rowH);
				const w = Math.max(1, Math.min(COLS, startW + dw));
				const h = Math.max(1, Math.min(MAX_H, startH + dh));
				if (w !== tile.w || h !== tile.h) {
					tile.w = w;
					tile.h = h;
					node.style.gridColumn = `span ${w}`;
					node.style.gridRow = `span ${h}`;
				}
			};
			const up = () => {
				window.removeEventListener("pointermove", move);
				window.removeEventListener("pointerup", up);
				this.saveConfig();
				this.render();
			};
			window.addEventListener("pointermove", move);
			window.addEventListener("pointerup", up);
		});
	}

	private moveTile(from: number, to: number): void {
		const tiles = this.tab().tiles;
		const [moved] = tiles.splice(from, 1);
		tiles.splice(to, 0, moved);
		this.saveConfig();
		this.render();
	}

	/* ---------- tabs ---------- */

	private addTab(): void {
		this.config.tabs.push({ id: uid(), name: this.config.lang === "it" ? "Nuova" : "New", tiles: [] });
		this.activeTab = this.config.tabs.length - 1;
		this.saveConfig();
		this.render();
	}

	private renameTab(i: number): void {
		const name = prompt(this.config.lang === "it" ? "Nome della tab:" : "Tab name:", this.config.tabs[i].name);
		if (name && name.trim()) {
			this.config.tabs[i].name = name.trim();
			this.saveConfig();
			this.render();
		}
	}

	private deleteTab(i: number): void {
		if (this.config.tabs.length <= 1) return;
		this.config.tabs.splice(i, 1);
		this.activeTab = Math.max(0, Math.min(this.activeTab, this.config.tabs.length - 1));
		this.saveConfig();
		this.render();
	}

	/* ---------- swipe tra tab (touch / schermi stretti) ---------- */

	private attachSwipe(grid: HTMLElement): void {
		let x0 = 0;
		let y0 = 0;
		grid.addEventListener("touchstart", (e) => {
			x0 = e.touches[0].clientX;
			y0 = e.touches[0].clientY;
		}, { passive: true });
		grid.addEventListener("touchend", (e) => {
			const dx = e.changedTouches[0].clientX - x0;
			const dy = e.changedTouches[0].clientY - y0;
			if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
			const dir = dx < 0 ? 1 : -1;
			const next = this.activeTab + dir;
			if (next >= 0 && next < this.config.tabs.length) {
				this.activeTab = next;
				this.render();
			}
		}, { passive: true });
	}

	/* ---------- settings ---------- */

	private settingsOverlay(): HTMLElement {
		const lang = this.config.lang;
		const T = (it: string, en: string) => (lang === "it" ? it : en);
		const overlay = el("div", { cls: "xl-overlay" });
		overlay.onclick = (e) => {
			if (e.target === overlay) {
				this.showSettings = false;
				this.render();
			}
		};
		const panel = el("div", { cls: "xl-settings" });
		panel.appendChild(el("h2", { cls: "xl-settings-title", text: "Setup" }));

		// cartella dati
		const folderRow = el("div", { cls: "xl-set-row" });
		folderRow.appendChild(el("span", { cls: "xl-set-label", text: T("Cartella dati", "Data folder") }));
		const folderVal = el("span", { cls: "xl-set-folder", text: this.config.folder || T("(non impostata)", "(not set)") });
		const pick = el("button", { cls: "xl-set-btn", text: T("Scegli…", "Pick…") });
		pick.onclick = async () => {
			const f = await this.backend.pickFolder();
			if (f) {
				this.config.folder = f;
				folderVal.textContent = f;
				this.saveConfig();
				await this.reload();
			}
		};
		folderRow.append(folderVal, pick);
		panel.appendChild(folderRow);

		// lingua
		panel.appendChild(
			this.selectRow(T("Lingua", "Language"), [["it", "Italiano"], ["en", "English"]], this.config.lang, (v) => {
				this.config.lang = v as "it" | "en";
				this.applyTheme();
				this.saveConfig();
				this.render();
			})
		);

		// accent: sincronizzato con Obsidian oppure personalizzato
		panel.appendChild(
			this.toggleRow(T("Accent come Obsidian", "Accent from Obsidian"), this.config.syncAccent, async (on) => {
				this.config.syncAccent = on;
				this.saveConfig();
				if (on) this.obsAccent = await this.backend.obsidianAccent();
				this.applyTheme();
				this.render();
			})
		);
		if (!this.config.syncAccent) {
			const accentRow = el("div", { cls: "xl-set-row" });
			accentRow.appendChild(el("span", { cls: "xl-set-label", text: T("Colore accento", "Accent color") }));
			const color = el("input", { attr: { type: "color", value: this.config.accent } }) as HTMLInputElement;
			color.oninput = () => {
				this.config.accent = color.value;
				this.applyTheme();
			};
			color.onchange = () => this.saveConfig();
			accentRow.appendChild(color);
			panel.appendChild(accentRow);
		}

		// opacità
		panel.appendChild(
			this.sliderRow(T("Opacità sfondo", "Background opacity"), this.config.opacity, 20, 100, (v) => {
				this.config.opacity = v;
				this.applyTheme();
				void this.backend.setOpacity(v);
			}, () => this.saveConfig())
		);

		// toggles nativi
		panel.appendChild(
			this.toggleRow(T("Fissa sul desktop (gadget)", "Pin to desktop (gadget)"), this.config.pinned, (on) => {
				this.config.pinned = on;
				void this.backend.setPinned(on);
				this.saveConfig();
			})
		);
		panel.appendChild(
			this.toggleRow(T("Avvio all'accensione", "Start on boot"), this.config.autostart, (on) => {
				this.config.autostart = on;
				void this.backend.setAutostart(on);
				this.saveConfig();
			})
		);
		panel.appendChild(
			this.toggleRow(T("Notifiche promemoria", "Reminder notifications"), this.config.notifications, (on) => {
				this.config.notifications = on;
				this.saveConfig();
				if (on) void this.backend.syncReminders(collectReminders(this.data));
				else void this.backend.syncReminders([]);
			})
		);

		// prova notifica
		const testRow = el("div", { cls: "xl-set-row" });
		testRow.appendChild(el("span", { cls: "xl-set-label", text: T("Prova notifica", "Test notification") }));
		const testBtn = el("button", { cls: "xl-set-btn", text: T("Invia", "Send") });
		testBtn.onclick = () => void this.backend.notify("xyz.log", T("Notifica di prova ✓", "Test notification ✓"));
		testRow.appendChild(testBtn);
		panel.appendChild(testRow);

		const mode = el("div", {
			cls: "xl-set-mode",
			text: this.backend.isReal ? T("Modalità app nativa", "Native app mode") : T("Anteprima browser (dati d'esempio)", "Browser preview (sample data)"),
		});
		panel.appendChild(mode);

		const close = el("button", { cls: "xl-set-close", text: T("Chiudi", "Close") });
		close.onclick = () => {
			this.showSettings = false;
			this.render();
		};
		panel.appendChild(close);

		overlay.appendChild(panel);
		return overlay;
	}

	private selectRow(label: string, options: [string, string][], value: string, onChange: (v: string) => void): HTMLElement {
		const row = el("div", { cls: "xl-set-row" });
		row.appendChild(el("span", { cls: "xl-set-label", text: label }));
		const sel = el("select", { cls: "xl-set-select" }) as HTMLSelectElement;
		for (const [v, lbl] of options) {
			const opt = el("option", { text: lbl, attr: { value: v } });
			if (v === value) opt.setAttribute("selected", "");
			sel.appendChild(opt);
		}
		sel.onchange = () => onChange(sel.value);
		row.appendChild(sel);
		return row;
	}

	private sliderRow(label: string, value: number, min: number, max: number, onInput: (v: number) => void, onDone: () => void): HTMLElement {
		const row = el("div", { cls: "xl-set-row" });
		row.appendChild(el("span", { cls: "xl-set-label", text: `${label}: ${value}%` }));
		const range = el("input", { attr: { type: "range", min: String(min), max: String(max), value: String(value) } }) as HTMLInputElement;
		range.oninput = () => {
			(row.firstChild as HTMLElement).textContent = `${label}: ${range.value}%`;
			onInput(Number(range.value));
		};
		range.onchange = onDone;
		row.appendChild(range);
		return row;
	}

	private toggleRow(label: string, on: boolean, onChange: (on: boolean) => void): HTMLElement {
		const row = el("div", { cls: "xl-set-row" });
		row.appendChild(el("span", { cls: "xl-set-label", text: label }));
		const tog = el("button", { cls: `xl-toggle ${on ? "is-on" : ""}` }, [el("span", { cls: "xl-toggle-knob" })]);
		tog.onclick = () => {
			const next = !tog.classList.contains("is-on");
			tog.classList.toggle("is-on", next);
			onChange(next);
		};
		row.appendChild(tog);
		return row;
	}
}

const rootEl = document.getElementById("app")!;
const app = new App(rootEl);
void app.init();
