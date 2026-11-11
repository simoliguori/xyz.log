import {
	addHabitToFrontmatter,
	appendLine,
	collectReminders,
	logLine,
	parseCategories,
	parseHabits,
	parseLog,
	parseTodos,
	Priority,
	removeHabitFromFrontmatter,
	reorderHabitsInFrontmatter,
	replaceLine,
	serializeTimeList,
	serializeTodo,
	setCategoryIconInFrontmatter,
	setCategoryNameInFrontmatter,
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
import { dateField, datePlaceholder, DATE_FORMATS } from "./datefmt";
import { clear, el } from "./dom";
import { lucideIconNames, lucideSvg } from "./icons";
import { NF, PRIO_PICK } from "./nf";
import { reorderTodoFile, insertTodoLine } from "./reorder";
import { sortComparator, type TodoSort } from "./sort";
import { NOTIF_SOUNDS, playNotifSound } from "./sounds";
import { COLS, MAX_H, newTile, Tile, TILE_META, TileType, uid, type AppConfig, type TabLayout } from "./layout";
import { renderTileBody, extractMedia, isImagePath, mediaEmbed, type RenderCtx, type Store } from "./render";

/** Brand mark (the "xyz" glyph in its box), used docked in the header and in the
   onboarding. Its ids are suffixed `-m` so they can't clash with the boot splash
   copy (index.html), which lives in the same document at launch. */
const LOGO_SVG = `<svg class="xl-logo-svg" viewBox="40 40 160 160" aria-hidden="true">
	<defs>
		<clipPath id="xlbox-m"><rect x="48" y="48" width="144" height="144" rx="1.5"/></clipPath>
		<clipPath id="xlshape-m">
			<polygon points="77.73,65 162.27,65 205.73,47 34.27,47"/>
			<polygon points="34.27,193 205.73,193 162.27,175 77.73,175"/>
			<polygon points="162.27,65 34.27,193 77.73,175 205.73,47"/>
			<polygon points="34.27,47 113.64,126.36 126.36,113.64 77.73,65"/>
			<polygon points="113.64,126.36 162.27,175 205.73,193 126.36,113.64"/>
		</clipPath>
		<linearGradient id="xlsheen-m" x1="0" y1="0" x2="1" y2="1">
			<stop offset="0" stop-color="#ffffff" stop-opacity="0.42"/>
			<stop offset="0.38" stop-color="#ffffff" stop-opacity="0.07"/>
			<stop offset="0.62" stop-color="#000000" stop-opacity="0.06"/>
			<stop offset="1" stop-color="#000000" stop-opacity="0.44"/>
		</linearGradient>
		<linearGradient id="xlbslash-m" gradientUnits="userSpaceOnUse" x1="56" y1="56" x2="184" y2="184">
			<stop offset="0" stop-color="#a0a3d7"/><stop offset="1" stop-color="#5e639e"/>
		</linearGradient>
		<linearGradient id="xldiag-m" gradientUnits="userSpaceOnUse" x1="184" y1="56" x2="56" y2="184">
			<stop offset="0" stop-color="#767ebf"/><stop offset="0.5" stop-color="#6e76b9"/><stop offset="1" stop-color="#626aae"/>
		</linearGradient>
		<filter id="xldrop-m" x="-30%" y="-30%" width="160%" height="160%" color-interpolation-filters="sRGB"><feDropShadow dx="0" dy="0" stdDeviation="1.8" flood-color="#000000" flood-opacity="0.33"/></filter>
	</defs>
	<g clip-path="url(#xlbox-m)">
		<g clip-path="url(#xlshape-m)">
			<g filter="url(#xldrop-m)">
				<polygon points="77.73,65 162.27,65 205.73,47 34.27,47" fill="#6e76b9" stroke="#6e76b9" stroke-width="2.5" stroke-linejoin="round"/>
				<polygon points="34.27,193 205.73,193 162.27,175 77.73,175" fill="#6e76b9" stroke="#6e76b9" stroke-width="2.5" stroke-linejoin="round"/>
			</g>
			<g filter="url(#xldrop-m)">
				<polygon points="34.27,47 113.64,126.36 162.27,175 205.73,193 126.36,113.64 77.73,65" fill="url(#xlbslash-m)" stroke="url(#xlbslash-m)" stroke-width="2.5" stroke-linejoin="round"/>
			</g>
			<g filter="url(#xldrop-m)">
				<polygon points="162.27,65 34.27,193 77.73,175 205.73,47" fill="url(#xldiag-m)" stroke="url(#xldiag-m)" stroke-width="2.5" stroke-linejoin="round"/>
			</g>
		</g>
		<rect x="48" y="48" width="144" height="144" fill="url(#xlsheen-m)" clip-path="url(#xlshape-m)"/>
	</g>
</svg>`;

/** When the module started running — used to keep the boot splash on screen for a
   minimum time so the logo motion-graphic always reads as a clean "split second". */
const BOOT_T0 = performance.now();

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
	private logoOnly = true;
	private slideDir = 0;
	private brand: HTMLElement | null = null;
	private obsAccent: string | null = null;
	private winAccent: string | null = null;
	private expanded = new Set<string>();
	private settingsOpen = new Set<string>();
	private collapsedGroups = new Set<string>();
	private editing: Todo | null = null;
	private iconPicker: { current: string; onChoose: (icon: string) => void } | null = null;
	private onboardVault: string | null = null;
	private root: HTMLElement;

	constructor(root: HTMLElement) {
		this.root = root;
	}

	async init(): Promise<void> {
		this.config = await this.backend.getConfig();
		this.activeTab = Math.max(0, Math.min(this.config.activeTab ?? 0, this.config.tabs.length - 1));
		this.applyTheme();
		this.setupAutoHide();
		this.backend.onFilesChanged(() => void this.reload());
		this.backend.onReminderFired(() => playNotifSound(this.config.notifSound));
		// data ready BEFORE the first draw: no blank screen
		await this.loadData();
		await this.refreshAccent();
		this.ensureBrand();
		this.render();
		this.finishBoot();
		// check GitHub for a newer release (native build only)
		if (this.backend.isReal) {
			void import("./updater").then((m) => m.checkForUpdate());
		}
	}

	private ensureBrand(): void {
		if (this.brand) return;
		this.brand = el("div", { cls: "xl-brand", html: LOGO_SVG });
		document.body.appendChild(this.brand);
	}

	/** The top bar (logo + tabs + buttons) disappears when the cursor isn't
	   vicino al bordo superiore, e ricompare passandoci sopra. */
	private setupAutoHide(): void {
		window.addEventListener("mousemove", (e) => {
			document.body.classList.toggle("xl-reveal", e.clientY < 46);
		});
		// stays visible for a moment on launch, then hides
		document.body.classList.add("xl-reveal");
		window.setTimeout(() => document.body.classList.remove("xl-reveal"), 2600);
	}

	/** The inline boot splash (index.html) has been showing the logo motion-graphic
	   since the first frame. Keep it up for a clean split-second, then fade it out to
	   reveal the app behind; the content's entrance animation plays as it dissolves. */
	private finishBoot(): void {
		const boot = document.getElementById("xl-boot");
		const MIN = 820; // ms the motion-graphic stays up even if the app is ready sooner
		const wait = boot ? Math.max(0, MIN - (performance.now() - BOOT_T0)) : 0;
		window.setTimeout(() => {
			// the boot splash fades, revealing the isolated logo centred underneath
			boot?.classList.add("is-hiding");
			window.setTimeout(() => boot?.remove(), 460);
			// a short beat on the isolated logo, then it slides to the top-left corner
			// while the window content enters behind it
			window.setTimeout(() => {
				this.docked = true;
				this.logoOnly = false;
				this.render();
				window.setTimeout(() => {
					this.intro = false;
					this.root.classList.remove("xl-intro");
				}, 1100);
			}, 340);
		}, wait);
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

	/** effective accent, following the chosen source (falls back to the custom color) */
	private effectiveAccent(): string {
		if (this.config.accentSource === "obsidian") return this.obsAccent ?? this.config.accent;
		if (this.config.accentSource === "windows") return this.winAccent ?? this.config.accent;
		return this.config.accent;
	}

	/** fetch the accent from the chosen source (Obsidian / Windows), then re-theme */
	private async refreshAccent(): Promise<void> {
		if (this.config.accentSource === "obsidian") {
			this.obsAccent = await this.backend.obsidianAccent();
		} else if (this.config.accentSource === "windows") {
			this.winAccent = await this.backend.windowsAccent();
		}
		this.applyTheme();
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
		addTodoSorted: (text, prio, due, time, sort) => {
			const line = serializeTodo(text, prio, due, time);
			const open = this.data.todos.filter((t) => !t.done && !t.source);
			const maxLine = open.reduce((m, t) => Math.max(m, t.lineNo), 0);
			const fake = { lineNo: maxLine + 1, priority: prio, due } as unknown as Todo;
			const cmp = sortComparator(sort);
			const target = [...open].sort((a, b) => a.lineNo - b.lineNo).find((t) => cmp(fake, t) < 0);
			void this.mutate("todo", insertTodoLine(this.files.todo, line, target ? target.lineNo : null));
		},
		reorderTodos: (orderedLineNos) => {
			const open = this.data.todos.filter((t) => !t.done && !t.source);
			const movable = open.map((t) => t.lineNo).sort((a, b) => a - b);
			void this.mutate("todo", reorderTodoFile(this.files.todo, movable, orderedLineNos));
		},
		addHabit: (name, icon) => {
			const existing = parseHabits(this.files.habits);
			const base = slugifyHabitId(name);
			let id = base;
			let n = 2;
			while (existing.some((h) => h.id === id)) id = `${base}-${n++}`;
			void this.mutate("habits", addHabitToFrontmatter(this.files.habits, { id, name, icon }));
		},
		deleteHabit: (id) => void this.mutate("habits", removeHabitFromFrontmatter(this.files.habits, id)),
		setHabitFields: (id, fields) => void this.mutate("habits", setHabitFieldsInFrontmatter(this.files.habits, id, fields)),
		setHabitReminders: (id, times) =>
			void this.mutate(
				"habits",
				setHabitFieldsInFrontmatter(this.files.habits, id, { reminders: times.length ? serializeTimeList(times) : "" })
			),
		setCategoryName: (icon, name) => void this.mutate("habits", setCategoryNameInFrontmatter(this.files.habits, icon, name)),
		setCategoryIcon: (oldIcon, newIcon) => void this.mutate("habits", setCategoryIconInFrontmatter(this.files.habits, oldIcon, newIcon)),
		reorderHabits: (orderedIds) => void this.mutate("habits", reorderHabitsInFrontmatter(this.files.habits, orderedIds)),
	};

	private ctx(): RenderCtx {
		return {
			data: this.data,
			today: todayISO(),
			lang: this.config.lang,
			dateFormat: this.config.dateFormat,
			sort: this.config.todoSort,
			draggable: this.config.todoDraggable,
			overdueTop: this.config.overdueTop,
			setTodoSort: (s) => this.setTodoSort(s),
			setTodoDraggable: (on) => this.setTodoDraggable(on),
			setOverdueTop: (on) => this.setOverdueTop(on),
			store: this.store,
			expanded: this.expanded,
			settingsOpen: this.settingsOpen,
			collapsedGroups: this.collapsedGroups,
			heatmapWeeks: 52,
			rerender: () => this.render(),
			editTodo: (todo) => {
				this.editing = todo;
				this.render();
			},
			pickIcon: (current, onChoose) => {
				this.iconPicker = { current, onChoose };
				this.render();
			},
			openNote: (source) => void this.backend.openNote(source),
			attachMedia: (name, bytes) => this.backend.attachMedia(name, bytes),
			mediaSrc: (rel) => this.backend.mediaSrc(rel),
		};
	}

	private tab(): TabLayout {
		return this.config.tabs[this.activeTab] ?? this.config.tabs[0];
	}

	private saveConfig(): void {
		void this.backend.setConfig(this.config);
	}

	private setTodoSort(s: TodoSort): void {
		this.config.todoSort = s;
		this.saveConfig();
		if (this.config.todoDraggable && s !== "date") this.seedTodoOrder(s);
		else this.render();
	}

	private setOverdueTop(on: boolean): void {
		this.config.overdueTop = on;
		this.saveConfig();
		this.render();
	}

	private setTodoDraggable(on: boolean): void {
		this.config.todoDraggable = on;
		// a manual order needs a flat list; enabling it from the date view switches
		// to "added (oldest)" = current file order as the starting point
		if (on && this.config.todoSort === "date") this.config.todoSort = "added-asc";
		this.saveConfig();
		if (on && this.config.todoSort !== "date") this.seedTodoOrder(this.config.todoSort);
		else this.render();
	}

	/** Write the current sort order into Todo.md, so draggable starts from it. */
	private seedTodoOrder(sort: TodoSort): void {
		const open = this.data.todos.filter((t) => !t.done && !t.source);
		if (!open.length) {
			this.render();
			return;
		}
		const movable = open.map((t) => t.lineNo).sort((a, b) => a - b);
		const ordered = [...open].sort(sortComparator(sort)).map((t) => t.lineNo);
		void this.mutate("todo", reorderTodoFile(this.files.todo, movable, ordered));
	}

	/* ---------- render ---------- */

	private render(): void {
		// tear down any tile timers (header clock)
		this.root.querySelectorAll(".xl-tile-body").forEach((n) => n.dispatchEvent(new Event("xl-dispose")));
		clear(this.root);
		this.ensureBrand();
		this.brand?.classList.toggle("is-docked", this.docked);
		// "logo alone" phase: empty container, just the logo in the center
		if (this.logoOnly) return;
		this.root.classList.toggle("xl-intro", this.intro);
		if (!this.config.folder) {
			this.root.appendChild(this.onboarding());
			return;
		}
		this.root.appendChild(this.topBar());
		if (this.edit) this.root.appendChild(this.addTileBar());
		this.root.appendChild(this.grid());
		if (this.showSettings) this.root.appendChild(this.settingsOverlay());
		if (this.editing) this.root.appendChild(this.taskModal(this.editing));
		if (this.iconPicker) this.root.appendChild(this.iconPickerOverlay());
	}

	/* ---------- lucide icon picker (like Obsidian) ---------- */

	private iconPickerOverlay(): HTMLElement {
		const T = (it: string, en: string) => (this.config.lang === "it" ? it : en);
		const pk = this.iconPicker!;
		const close = () => {
			this.iconPicker = null;
			this.render();
		};
		const overlay = el("div", { cls: "xl-overlay" });
		overlay.onclick = (e) => {
			if (e.target === overlay) close();
		};
		const panel = el("div", { cls: "xl-icon-modal" });
		const top = el("div", { cls: "xl-icon-top" });
		const search = el("input", { cls: "xl-icon-search", attr: { type: "text", placeholder: T("Cerca un'icona…", "Search an icon…") } }) as HTMLInputElement;
		const none = el("button", { cls: "xl-icon-none", text: T("Nessuna", "None") });
		none.onclick = () => {
			pk.onChoose("");
			close();
		};
		top.append(search, none);
		panel.appendChild(top);

		const grid = el("div", { cls: "xl-icon-grid" });
		const names = lucideIconNames();
		const draw = (filter: string) => {
			clear(grid);
			const f = filter.trim().toLowerCase();
			let shown = 0;
			for (const name of names) {
				if (f && !name.includes(f)) continue;
				if (shown++ > 400) break; // cap for performance
				const svg = lucideSvg(name, 18);
				if (!svg) continue;
				const b = el("button", { cls: "xl-icon-tile", attr: { title: name }, html: svg });
				b.onclick = () => {
					pk.onChoose("lucide-" + name);
					close();
				};
				grid.appendChild(b);
			}
		};
		draw("");
		search.oninput = () => draw(search.value);
		panel.appendChild(grid);
		overlay.appendChild(panel);
		requestAnimationFrame(() => search.focus());
		return overlay;
	}

	/* ---------- task edit popup (glass) ---------- */

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

		// split media embeds out of the text: edit the clean text here, manage the
		// attachments in the gallery below (recombined on save)
		const { clean, paths } = extractMedia(todo.text);
		let media = [...paths];

		const textInput = el("input", { cls: "xl-tm-text", attr: { type: "text", value: clean } }) as HTMLInputElement;
		panel.appendChild(textInput);

		const row = el("div", { cls: "xl-tm-row" });
		const dateInput = dateField(todo.due ?? null, this.config.dateFormat, "xl-tm-datefield");
		const timeInput = el("input", { cls: "xl-tm-time", attr: { type: "time", value: todo.time ?? "" } }) as HTMLInputElement;
		const prio = el("select", { cls: "xl-tm-prio" }) as HTMLSelectElement;
		for (const c of PRIO_PICK) {
			const label = this.config.lang === "it" ? c.it : c.en;
			const opt = el("option", { text: `${c.glyph}  ${label}`, attr: { value: String(c.value) } });
			if (c.value === todo.priority) opt.setAttribute("selected", "");
			prio.appendChild(opt);
		}
		prio.value = String(todo.priority);
		row.append(dateInput.root, timeInput, prio);
		panel.appendChild(row);

		// --- media gallery (full-size thumbnails, click to zoom, × to remove) ---
		const fileInput = el("input", { cls: "xl-file-hidden", attr: { type: "file", multiple: "" } }) as HTMLInputElement;
		const gallery = el("div", { cls: "xl-tm-media" });
		const renderGallery = () => {
			clear(gallery);
			for (const p of media) {
				const cell = el("div", { cls: "xl-tm-mcell", attr: { title: p } });
				if (isImagePath(p)) {
					const img = el("img", { cls: "xl-tm-mthumb", attr: { alt: "", loading: "lazy" } }) as HTMLImageElement;
					void this.backend.mediaSrc(p).then((src) => { if (src) img.src = src; });
					img.onclick = () => void this.backend.mediaSrc(p).then((src) => { if (src) this.openLightbox(src, p); });
					cell.appendChild(img);
				} else {
					cell.appendChild(el("span", { cls: "xl-tm-mfile", text: "" }));
					cell.appendChild(el("span", { cls: "xl-tm-mname", text: p.split("/").pop() ?? p }));
				}
				const rm = el("button", { cls: "xl-tm-mrm", text: "×", attr: { type: "button", title: T("Rimuovi", "Remove") } });
				rm.onclick = () => {
					media = media.filter((m) => m !== p);
					renderGallery();
				};
				cell.appendChild(rm);
				gallery.appendChild(cell);
			}
			const add = el("button", { cls: "xl-tm-madd", text: "", attr: { type: "button", title: T("Allega media…", "Attach media…") } });
			add.onclick = () => fileInput.click();
			gallery.appendChild(add);
		};
		fileInput.onchange = async () => {
			for (const f of Array.from(fileInput.files ?? [])) {
				const bytes = Array.from(new Uint8Array(await f.arrayBuffer()));
				const rel = await this.backend.attachMedia(f.name, bytes);
				if (rel) media.push(rel);
			}
			fileInput.value = "";
			renderGallery();
		};
		renderGallery();
		panel.append(gallery, fileInput);

		const actions = el("div", { cls: "xl-tm-actions" });
		const cancel = el("button", { cls: "xl-tm-cancel", text: T("Annulla", "Cancel") });
		cancel.onclick = close;
		const save = el("button", { cls: "xl-tm-save", text: T("Salva", "Save") });
		const commit = () => {
			const base = textInput.value.trim();
			const text = [base, ...media.map(mediaEmbed)].filter(Boolean).join(" ").trim() || todo.text;
			this.store.updateTodo(todo, {
				text,
				priority: Number(prio.value) as Priority,
				due: dateInput.getIso(),
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

	/** A transient full-screen image viewer (click or Esc to dismiss). */
	private openLightbox(src: string, alt: string): void {
		const ov = el("div", { cls: "xl-lightbox" });
		const dismiss = () => {
			ov.remove();
			window.removeEventListener("keydown", onKey);
		};
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") dismiss();
		};
		ov.onclick = dismiss;
		const img = el("img", { cls: "xl-lightbox-img", attr: { src, alt } }) as HTMLImageElement;
		img.onclick = (e) => e.stopPropagation();
		ov.appendChild(img);
		window.addEventListener("keydown", onKey);
		document.body.appendChild(ov);
	}

	/* ---------- window controls (no Windows title bar) ---------- */

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
		// no logo here: the intro already shows the logo rising, avoiding the double
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

		if (this.onboardVault) {
			// step 2: no folder found in the vault → offer to create it
			card.appendChild(
				el("div", {
					cls: "xl-onboard-hint",
					text: T(
						`Nessuna cartella «xyz.log» trovata nel vault.`,
						`No “xyz.log” folder found in the vault.`
					),
				})
			);
			const createHere = el("button", { cls: "xl-onboard-btn", text: T("Crea «xyz.log» nel vault", "Create “xyz.log” in the vault") });
			createHere.onclick = async () => {
				const path = await this.backend.createDataFolder(this.onboardVault!);
				await this.setFolder(path);
			};
			card.appendChild(createHere);
			const elsewhere = el("button", { cls: "xl-onboard-btn2", text: T("Scegli un'altra posizione…", "Choose another location…") });
			elsewhere.onclick = async () => {
				const parent = await this.backend.pickFolder();
				if (!parent) return;
				const path = await this.backend.createDataFolder(parent);
				await this.setFolder(path);
			};
			card.appendChild(elsewhere);
			const back = el("button", { cls: "xl-onboard-back", text: T("← indietro", "← back") });
			back.onclick = () => {
				this.onboardVault = null;
				this.render();
			};
			card.appendChild(back);
		} else {
			const link = el("button", { cls: "xl-onboard-btn", text: T("Collega il tuo vault Obsidian", "Link your Obsidian vault") });
			link.onclick = async () => {
				const vault = await this.backend.pickFolder();
				if (!vault) return;
				const found = await this.backend.locateDataFolder(vault);
				if (found) {
					await this.setFolder(found);
					return;
				}
				this.onboardVault = vault;
				this.render();
			};
			card.appendChild(link);
			card.appendChild(
				el("div", {
					cls: "xl-onboard-hint",
					text: T(
						"Scegli l'intero vault Obsidian: cerco la cartella «xyz.log».",
						"Pick your whole Obsidian vault: I'll find the “xyz.log” folder."
					),
				})
			);
		}

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

	/** Set the resolved data folder and switch to the app. */
	private async setFolder(path: string): Promise<void> {
		this.config.folder = path;
		this.onboardVault = null;
		this.saveConfig();
		await this.refreshAccent();
		await this.loadData();
		this.render();
	}

	private topBar(): HTMLElement {
		const bar = el("div", { cls: "xl-topbar" });
		// the name leaves space on the left where the intro logo "solidifies"
		bar.appendChild(el("div", { cls: "xl-logo", text: "xyz.log" }));

		const tabs = el("div", { cls: "xl-tabs" });
		this.config.tabs.forEach((t, i) => {
			const tab = el("button", { cls: `xl-tab ${i === this.activeTab ? "is-active" : ""}`, text: t.name });
			tab.onclick = () => {
				if (i === this.activeTab) return;
				this.slideDir = i > this.activeTab ? 1 : -1;
				this.activeTab = i;
				this.config.activeTab = i;
				this.saveConfig();
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
		const slide = this.slideDir > 0 ? "xl-slide-r" : this.slideDir < 0 ? "xl-slide-l" : "";
		this.slideDir = 0;
		const grid = el("div", { cls: `xl-grid ${this.edit ? "is-edit" : ""} ${slide}` });
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

	/* ---------- swipe between tabs (touch / narrow screens) ---------- */

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

		// data folder
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

		if (this.config.folder) {
			const unlinkRow = el("div", { cls: "xl-set-row" });
			unlinkRow.appendChild(el("span", { cls: "xl-set-label", text: T("Scollega il vault", "Unlink vault") }));
			const unlink = el("button", { cls: "xl-set-btn xl-set-danger", text: T("Scollega", "Unlink") });
			unlink.onclick = () => {
				this.config.folder = "";
				this.saveConfig();
				this.showSettings = false;
				this.render();
			};
			unlinkRow.appendChild(unlink);
			panel.appendChild(unlinkRow);
		}

		// lingua
		panel.appendChild(
			this.selectRow(T("Lingua", "Language"), [["it", "Italiano"], ["en", "English"]], this.config.lang, (v) => {
				this.config.lang = v as "it" | "en";
				this.applyTheme();
				this.saveConfig();
				this.render();
			})
		);

		// date format
		panel.appendChild(
			this.selectRow(
				T("Formato data", "Date format"),
				DATE_FORMATS.map((f) => [f, datePlaceholder(f)] as [string, string]),
				this.config.dateFormat,
				(v) => {
					this.config.dateFormat = v as typeof this.config.dateFormat;
					this.saveConfig();
					this.render();
				}
			)
		);

		// accent source: Obsidian / Windows / custom color
		panel.appendChild(
			this.selectRow(
				T("Sorgente accent", "Accent source"),
				[
					["obsidian", "Obsidian"],
					["windows", "Windows"],
					["custom", T("Personalizzato", "Custom")],
				],
				this.config.accentSource,
				async (v) => {
					this.config.accentSource = v as typeof this.config.accentSource;
					this.saveConfig();
					await this.refreshAccent();
					this.render();
				}
			)
		);
		if (this.config.accentSource === "custom") {
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

		// notification sound (with a ▶ preview)
		{
			const soundRow = this.selectRow(
				T("Suono notifica", "Notification sound"),
				NOTIF_SOUNDS.map((s) => [s.id, s.id === "none" ? T("Nessuno", "None") : s.label] as [string, string]),
				this.config.notifSound,
				(v) => {
					this.config.notifSound = v;
					this.saveConfig();
					playNotifSound(v);
				}
			);
			const preview = el("button", { cls: "xl-set-btn xl-set-play", text: NF.play, attr: { title: T("Ascolta", "Preview") } });
			preview.onclick = () => playNotifSound(this.config.notifSound);
			soundRow.appendChild(preview);
			panel.appendChild(soundRow);
		}

		// prova notifica
		const testRow = el("div", { cls: "xl-set-row" });
		testRow.appendChild(el("span", { cls: "xl-set-label", text: T("Prova notifica", "Test notification") }));
		const testBtn = el("button", { cls: "xl-set-btn", text: T("Invia", "Send") });
		testBtn.onclick = () => {
			playNotifSound(this.config.notifSound);
			void this.backend.notify("xyz.log", T("Notifica di prova ✓", "Test notification ✓"));
		};
		testRow.appendChild(testBtn);
		panel.appendChild(testRow);

		const mode = el("div", {
			cls: "xl-set-mode",
			text: this.backend.isReal ? T("Modalità app nativa", "Native app mode") : T("Anteprima browser (dati d'esempio)", "Browser preview (sample data)"),
		});
		panel.appendChild(mode);

		const credit = el("div", {
			cls: "xl-set-credit",
			text: T("creato da eccerobot", "created by eccerobot"),
		});
		panel.appendChild(credit);

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
