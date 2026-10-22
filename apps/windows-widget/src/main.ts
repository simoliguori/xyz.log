import {
	addHabitToFrontmatter,
	appendLine,
	collectReminders,
	logLine,
	parseCategories,
	parseHabits,
	parseLog,
	parseTodos,
	removeHabitFromFrontmatter,
	replaceLine,
	serializeTimeList,
	serializeTodo,
	setHabitFieldsInFrontmatter,
	slugifyHabitId,
	todayISO,
	toggleLog,
	toggleTodoLine,
	TrackerData,
} from "@todo-habits/core";
import { createBackend, type Backend, type FileKey, type VaultFiles } from "./backend";
import { clear, el } from "./dom";
import { COLS, MAX_H, newTile, Tile, TILE_META, TileType, uid, type AppConfig, type TabLayout } from "./layout";
import { renderTileBody, type RenderCtx, type Store } from "./render";

class App {
	private backend: Backend = createBackend();
	private config!: AppConfig;
	private files: VaultFiles = { habits: "", log: "", todo: "" };
	private data: TrackerData = { habits: [], categories: [], log: new Map(), todos: [] };
	private activeTab = 0;
	private edit = false;
	private showSettings = false;
	private expanded = new Set<string>();
	private settingsOpen = new Set<string>();
	private root: HTMLElement;

	constructor(root: HTMLElement) {
		this.root = root;
	}

	async init(): Promise<void> {
		this.config = await this.backend.getConfig();
		this.applyTheme();
		this.backend.onFilesChanged(() => void this.reload());
		await this.reload();
	}

	private async reload(): Promise<void> {
		this.files = await this.backend.readFiles();
		this.parse();
		void this.backend.syncReminders(collectReminders(this.data));
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

	private applyTheme(): void {
		const r = document.documentElement;
		r.style.setProperty("--xl-accent", this.config.accent);
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
		this.root.appendChild(this.topBar());
		if (this.edit) this.root.appendChild(this.addTileBar());
		this.root.appendChild(this.grid());
		if (this.showSettings) this.root.appendChild(this.settingsOverlay());
	}

	private topBar(): HTMLElement {
		const bar = el("div", { cls: "xl-topbar" });
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
		actions.append(editBtn, gear);
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

		// accent
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
