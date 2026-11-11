import {
	addDays,
	buildHabitGroups,
	buildHabitView,
	doneTodos,
	groupTodos,
	groupTodosByFolder,
	groupTodosBySource,
	Habit,
	HabitView,
	Lang,
	locale,
	Priority,
	streak,
	Todo,
	TrackerData,
	ui,
	groupLabel,
	type TodoGroupId,
} from "@xyzlog/core";
import { clear, el, renderRich } from "./dom";
import { openContextMenu, type MenuEntry } from "./ctxmenu";
import { dateButton, timeButton, type DateFormat } from "./datefmt";
import { NF, PRIO_BTN_GLYPH, PRIO_PICK, PRIO_VAR } from "./nf";
import { analyze, quickParse, type PrioKey } from "./quickadd";
import { sortComparator, type TodoSort } from "./sort";

/** quick-add priority keyword → app Priority ("medium" is treated as no priority,
    matching the picker). */
const PRIO_FROM_KEY: Record<PrioKey, Priority> = {
	highest: Priority.Highest,
	high: Priority.High,
	medium: Priority.None,
	low: Priority.Low,
	lowest: Priority.Lowest,
};
import { lucideSvg } from "./icons";
import { playAdd, playComplete } from "./sfx";

/** Collapse the element (height → 0) then run `fn`, like in the plugin. */
function collapseThenRun(node: HTMLElement, fn: () => void): void {
	node.style.maxHeight = `${node.scrollHeight}px`;
	node.style.overflow = "hidden";
	void node.offsetHeight; // reflow
	node.classList.add("xl-collapsing");
	window.setTimeout(fn, 220);
}

/** Obsidian wiki-embed `![[path]]` (optional `|alias`) or markdown image `![](path)`. */
const MEDIA_RE = /!\[\[([^\]|]+)(?:\|[^\]]*)?\]\]|!\[[^\]]*\]\(([^)]+)\)/g;

/** Pull media embeds out of a task's text, returning the clean text + the paths. */
export function extractMedia(text: string): { clean: string; paths: string[] } {
	const paths: string[] = [];
	const clean = text
		.replace(MEDIA_RE, (_m, wiki, md) => {
			paths.push(String(wiki || md).trim());
			return "";
		})
		.replace(/\s{2,}/g, " ")
		.trim();
	return { clean, paths };
}

export const isImagePath = (p: string): boolean => /\.(png|jpe?g|gif|webp|svg|bmp|avif)$/i.test(p);

/** The embed markup for a vault-relative attachment path (`![[path]]`). */
export const mediaEmbed = (p: string): string => `![[${p}]]`;

/** A small preview strip (image thumbnails / file-icon placeholders) for a task. */
function mediaStrip(paths: string[], ctx: RenderCtx): HTMLElement {
	const wrap = el("div", { cls: "xl-media-strip" });
	for (const p of paths.slice(0, 3)) {
		if (isImagePath(p)) {
			const img = el("img", { cls: "xl-media-thumb", attr: { alt: "", title: p, loading: "lazy" } }) as HTMLImageElement;
			void ctx.mediaSrc(p).then((src) => { if (src) img.src = src; });
			wrap.appendChild(img);
		} else {
			wrap.appendChild(el("span", { cls: "xl-media-file", text: "", attr: { title: p } }));
		}
	}
	if (paths.length > 3) wrap.appendChild(el("span", { cls: "xl-media-more", text: `+${paths.length - 3}` }));
	return wrap;
}

/** Grow the element in (height 0 → full, fade in): the inverse of the check-off
   collapse. Call once the node is already in the DOM (e.g. in requestAnimationFrame). */
function expandIn(node: HTMLElement): void {
	const full = node.scrollHeight;
	if (!full) return;
	// apply the collapsed start state WITHOUT animating into it…
	node.style.transition = "none";
	node.style.maxHeight = "0px";
	node.style.opacity = "0";
	node.style.overflow = "hidden";
	void node.offsetHeight; // commit the start state
	// …then let the row's own transition animate it open
	node.style.transition = "";
	node.style.maxHeight = `${full}px`;
	node.style.opacity = "1";
	window.setTimeout(() => {
		node.style.maxHeight = "";
		node.style.opacity = "";
		node.style.overflow = "";
		node.style.transition = "";
	}, 260);
}

/** Azioni di scrittura: implementate in main.ts su file + core, poi backend. */
export interface Store {
	toggleHabit(id: string, date: string): void;
	incrementHabit(id: string, date: string): void;
	decrementHabit(id: string, date: string): void;
	toggleTodo(todo: Todo): void;
	deleteTodo(todo: Todo): void;
	updateTodo(
		todo: Todo,
		fields: { text?: string; priority?: Priority; due?: string | null; time?: string | null }
	): void;
	addTodo(text: string, prio: Priority, due: string | null, time: string | null): void;
	/** add a task inserted at the position the given sort dictates (draggable mode) */
	addTodoSorted(text: string, prio: Priority, due: string | null, time: string | null, sort: TodoSort): void;
	/** persist a manual order (list of task line numbers, new order) into Todo.md */
	reorderTodos(orderedLineNos: number[]): void;
	addHabit(name: string, icon?: string): void;
	deleteHabit(id: string): void;
	setHabitFields(id: string, fields: Record<string, string | number>): void;
	setHabitReminders(id: string, times: string[]): void;
	/** rename a category (keyed by its shared icon) */
	setCategoryName(icon: string, name: string): void;
	/** change a category's icon (reassigns every member habit) */
	setCategoryIcon(oldIcon: string, newIcon: string): void;
	/** persist a new habit order (list of habit ids); also reorders categories */
	reorderHabits(orderedIds: string[]): void;
}

export interface RenderCtx {
	data: TrackerData;
	today: string;
	lang: Lang;
	dateFormat: DateFormat;
	sort: TodoSort;
	draggable: boolean;
	/** pin overdue tasks on top in every sort mode */
	overdueTop: boolean;
	setTodoSort: (s: TodoSort) => void;
	setTodoDraggable: (on: boolean) => void;
	setOverdueTop: (on: boolean) => void;
	store: Store;
	expanded: Set<string>;
	settingsOpen: Set<string>;
	/** ids of task groups the user has collapsed (persist across re-renders) */
	collapsedGroups: Set<string>;
	heatmapWeeks: number;
	rerender: () => void;
	/** opens a task's edit popup (implemented by the app) */
	editTodo: (todo: Todo) => void;
	/** opens the lucide icon picker (implemented by the app) */
	pickIcon: (current: string, onChoose: (icon: string) => void) => void;
	/** opens a vault note in Obsidian (path without `.md`) */
	openNote: (source: string) => void;
	/** copy picked bytes into the vault; returns the vault-relative attachment path */
	attachMedia: (name: string, bytes: number[]) => Promise<string>;
	/** a displayable URL (data:/asset) for a vault-relative attachment path */
	mediaSrc: (rel: string) => Promise<string>;
}

const PRIO_CLASS: Record<Priority, string> = {
	[Priority.Highest]: "xl-prio-highest",
	[Priority.High]: "xl-prio-high",
	[Priority.Medium]: "xl-prio-medium",
	[Priority.None]: "xl-prio-none",
	[Priority.Low]: "xl-prio-low",
	[Priority.Lowest]: "xl-prio-lowest",
};

function sectionTitle(text: string): HTMLElement {
	return el("h2", { cls: "xl-section-title", text });
}

/* ---------------- Header & stats ---------------- */

export function renderHeader(host: HTMLElement, ctx: RenderCtx): void {
	const d = new Date();
	const date = d.toLocaleDateString(locale(ctx.lang), {
		weekday: "long",
		day: "numeric",
		month: "long",
	});
	const wrap = el("div", { cls: "xl-header" });
	wrap.appendChild(el("div", { cls: "xl-header-date", text: date }));
	const clock = el("div", { cls: "xl-header-clock", text: hhmm(d) });
	wrap.appendChild(clock);
	host.appendChild(wrap);
	// aggiorna l'orologio al minuto
	const tick = () => (clock.textContent = hhmm(new Date()));
	const id = window.setInterval(tick, 15000);
	host.addEventListener("xl-dispose", () => window.clearInterval(id), { once: true });
}

function hhmm(d: Date): string {
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function renderStats(host: HTMLElement, ctx: RenderCtx): void {
	const { data, today } = ctx;
	const open = data.todos.filter((t) => !t.done);
	const overdue = open.filter((t) => t.due && t.due < today).length;
	const habitsDone = data.habits.filter((h) => {
		const v = buildHabitView(h, data.log, today);
		return v.doneToday;
	}).length;
	const grid = el("div", { cls: "xl-stats" });
	const cell = (n: string, label: string, cls = "") =>
		el("div", { cls: `xl-stat ${cls}` }, [
			el("div", { cls: "xl-stat-n", text: n }),
			el("div", { cls: "xl-stat-l", text: label }),
		]);
	grid.appendChild(cell(String(open.length), ctx.lang === "it" ? "aperte" : "open"));
	grid.appendChild(cell(String(overdue), ctx.lang === "it" ? "in ritardo" : "overdue", overdue ? "is-alert" : ""));
	grid.appendChild(cell(`${habitsDone}/${data.habits.length}`, ctx.lang === "it" ? "abitudini" : "habits"));
	host.appendChild(grid);
}

/* ---------------- Habits ---------------- */

export function renderHabits(host: HTMLElement, ctx: RenderCtx, withAdd = true): void {
	const section = el("div", { cls: "xl-section" });
	section.appendChild(sectionTitle(ui("habits", ctx.lang)));
	if (withAdd) section.appendChild(habitAddForm(ctx));

	if (ctx.data.habits.length === 0) {
		section.appendChild(el("div", { cls: "xl-empty", text: ui("noHabits", ctx.lang) }));
		host.appendChild(section);
		return;
	}
	const list = el("div", { cls: "xl-habit-scroll" });
	const it = ctx.lang === "it";
	const groups = buildHabitGroups(ctx.data, ctx.today);
	const flatIds = (order: number[]): string[] => order.flatMap((i) => groups[i].habits.map((v) => v.habit.id));

	// Whole groups are draggable to reorder (grab a category anywhere, or a lone
	// habit); every group is also a drop target. Reordering rewrites the habit
	// order in the frontmatter (category order follows habit order).
	let dragFrom = -1;
	const clearDrops = () =>
		list.querySelectorAll(".xl-drop-before,.xl-drop-after").forEach((n) => n.classList.remove("xl-drop-before", "xl-drop-after"));
	const dragSource = (node: HTMLElement, gi: number) => {
		node.setAttribute("draggable", "true");
		node.addEventListener("dragstart", (e) => {
			const d = e as DragEvent;
			// setData is required for a drag to actually start in some engines
			if (d.dataTransfer) {
				d.dataTransfer.effectAllowed = "move";
				d.dataTransfer.setData("text/plain", String(gi));
			}
			dragFrom = gi;
			node.classList.add("is-dragging");
		});
		node.addEventListener("dragend", () => {
			node.classList.remove("is-dragging");
			clearDrops();
			dragFrom = -1;
		});
		node.addEventListener("dragover", (e) => {
			if (dragFrom < 0) return;
			e.preventDefault();
			const rect = node.getBoundingClientRect();
			const after = (e as DragEvent).clientY > rect.top + rect.height / 2;
			clearDrops();
			if (gi !== dragFrom) node.classList.add(after ? "xl-drop-after" : "xl-drop-before");
		});
		node.addEventListener("drop", (e) => {
			if (dragFrom < 0 || gi === dragFrom) return;
			e.preventDefault();
			const rect = node.getBoundingClientRect();
			const after = (e as DragEvent).clientY > rect.top + rect.height / 2;
			clearDrops();
			const order = groups.map((_, i) => i).filter((i) => i !== dragFrom);
			let idx = order.indexOf(gi);
			if (idx < 0) idx = order.length;
			if (after) idx++;
			order.splice(idx, 0, dragFrom);
			ctx.store.reorderHabits(flatIds(order));
		});
	};

	groups.forEach((group, gi) => {
		if (group.category) {
			const cs = group.category;
			const cat = el("div", { cls: "xl-category" });
			const iconSvg = lucideSvg(cs.icon, 13);
			const iconEl = el("span", { cls: "xl-category-icon xl-cat-editable", html: iconSvg ?? "", attr: { title: it ? "Cambia icona" : "Change icon" } });
			if (!iconSvg) iconEl.textContent = "◆";
			iconEl.onclick = (e) => {
				e.stopPropagation();
				ctx.pickIcon(cs.icon, (newIcon) => {
					if (newIcon && newIcon !== cs.icon) ctx.store.setCategoryIcon(cs.icon, newIcon);
				});
			};
			const nameEl = el("span", { cls: "xl-category-name xl-cat-editable", text: cs.name, attr: { title: it ? "Rinomina categoria" : "Rename category" } });
			nameEl.onclick = (e) => {
				e.stopPropagation();
				startCategoryRename(nameEl, cs.icon, cs.name, ctx);
			};
			const grip = el("span", { cls: "xl-cat-grip", text: "⠿", attr: { "aria-hidden": "true", title: it ? "Trascina per riordinare" : "Drag to reorder" } });
			const head = el("div", { cls: "xl-category-head" }, [
				grip,
				iconEl,
				nameEl,
				el("span", { cls: "xl-group-count", text: String(group.habits.length) }),
			]);
			cat.appendChild(head);
			const body = el("div", { cls: "xl-category-body" });
			for (const v of group.habits) body.appendChild(habitRow(v, ctx));
			cat.appendChild(body);
			dragSource(cat, gi);
			list.appendChild(cat);
		} else {
			const row = habitRow(group.habits[0], ctx);
			row.classList.add("xl-habit-draggable");
			dragSource(row, gi);
			list.appendChild(row);
		}
	});
	section.appendChild(list);
	host.appendChild(section);
}

/** Swap a category's name label for an inline input (commit on Enter/blur). */
function startCategoryRename(nameEl: HTMLElement, icon: string, name: string, ctx: RenderCtx): void {
	// the whole category is draggable; disable it so the text field stays editable
	const cat = nameEl.closest(".xl-category");
	cat?.setAttribute("draggable", "false");
	const input = el("input", { cls: "xl-category-name-input", attr: { type: "text", value: name } }) as HTMLInputElement;
	input.addEventListener("mousedown", (e) => e.stopPropagation());
	nameEl.replaceWith(input);
	input.focus();
	input.select();
	let done = false;
	const commit = (save: boolean) => {
		if (done) return;
		done = true;
		const v = input.value.trim();
		if (save && v && v !== name) ctx.store.setCategoryName(icon, v);
		else ctx.rerender();
	};
	input.onkeydown = (e) => {
		if (e.key === "Enter") commit(true);
		if (e.key === "Escape") commit(false);
	};
	input.onblur = () => commit(true);
}

function habitAddForm(ctx: RenderCtx): HTMLElement {
	const form = el("div", { cls: "xl-add" });
	let chosenIcon = "";
	const iconBtn = el("button", { cls: "xl-add-icon", attr: { title: ctx.lang === "it" ? "Scegli un'icona" : "Choose an icon" } });
	const refreshIcon = () => {
		const svg = chosenIcon ? lucideSvg(chosenIcon, 15) : null;
		if (svg) iconBtn.innerHTML = svg;
		else iconBtn.textContent = "◆";
	};
	refreshIcon();
	iconBtn.onclick = () => ctx.pickIcon(chosenIcon, (icon) => { chosenIcon = icon; refreshIcon(); });

	const input = el("input", {
		cls: "xl-add-text",
		attr: { type: "text", placeholder: ui("newHabit", ctx.lang) },
	}) as HTMLInputElement;
	const btn = el("button", { cls: "xl-add-btn", text: "+" });
	const submit = () => {
		const name = input.value.trim();
		if (!name) return;
		ctx.store.addHabit(name, chosenIcon || undefined);
		input.value = "";
		chosenIcon = "";
		refreshIcon();
	};
	btn.onclick = submit;
	input.onkeydown = (e) => {
		if (e.key === "Enter") submit();
	};
	form.append(iconBtn, input, btn);
	return form;
}

let pieSeq = 0;
/** The counter BOX itself becomes a square pie: `goal` wedges radiating from the
    centre to the box edges (clipped to the rounded square), `count` of them filled —
    it fills the whole square as the habit is done through the day. */
function pieCounter(count: number, goal: number): string {
	const size = 100;
	const c = size / 2;
	const R = 75; // past the corners (≈70.7) so each wedge reaches the square edge
	const rx = 22; // rounded-square clip, matching the box's corner radius
	const n = Math.max(1, goal);
	const filled = Math.min(Math.max(0, count), n);
	const polar = (deg: number): [number, number] => {
		const rad = ((deg - 90) * Math.PI) / 180;
		return [c + R * Math.cos(rad), c + R * Math.sin(rad)];
	};
	// ONE continuous slice for the filled fraction — no inter-wedge gaps, so there's
	// no star/seam artefact at the centre and the fill is a single flat colour.
	let body = "";
	if (filled <= 0) {
		body = "";
	} else if (filled >= n) {
		body = `<rect x="0" y="0" width="${size}" height="${size}" rx="${rx}" class="xl-pie-on"/>`;
	} else {
		const sweep = (filled / n) * 360;
		const [x0, y0] = polar(0);
		const [x1, y1] = polar(sweep);
		const large = sweep > 180 ? 1 : 0;
		body = `<path d="M${c},${c} L${x0.toFixed(2)},${y0.toFixed(2)} A${R},${R} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z" class="xl-pie-on"/>`;
	}
	const id = `xl-pieclip-${++pieSeq}`;
	return `<svg viewBox="0 0 ${size} ${size}" class="xl-pie" preserveAspectRatio="none" aria-hidden="true"><defs><clipPath id="${id}"><rect x="0" y="0" width="${size}" height="${size}" rx="${rx}"/></clipPath></defs><g clip-path="url(#${id})">${body}</g></svg>`;
}

function habitRow(v: HabitView, ctx: RenderCtx): HTMLElement {
	const { habit } = v;
	const card = el("div", { cls: `xl-habit ${v.doneToday ? "is-done" : ""}` });
	const row = el("div", { cls: "xl-habit-row" });

	const counterMode = habit.countable || habit.goal > 1;
	if (counterMode) {
		const counter = el("button", { cls: `xl-count ${v.doneToday ? "is-done" : ""}` });
		if (habit.goal > 1) {
			counter.setAttribute("title", `${v.countToday}/${habit.goal}`);
			if (v.doneToday) {
				// completed: same filled accent square + check as the other habits
				counter.textContent = "✓";
			} else {
				// otherwise a pie inside the square, one wedge per completion
				counter.classList.add("xl-count-pie");
				counter.innerHTML = pieCounter(v.countToday, habit.goal);
			}
		} else {
			counter.textContent = String(v.countToday);
		}
		const atGoal = !habit.countable && v.countToday >= habit.goal;
		counter.onclick = (e) => {
			e.stopPropagation();
			if (atGoal) return;
			playComplete();
			counter.classList.add("xl-pop");
			ctx.store.incrementHabit(habit.id, ctx.today);
		};
		row.appendChild(counter);
		if (v.countToday > 0) {
			const minus = el("button", { cls: "xl-count-minus", text: "−" });
			minus.onclick = (e) => {
				e.stopPropagation();
				ctx.store.decrementHabit(habit.id, ctx.today);
			};
			row.appendChild(minus);
		}
	} else {
		const check = el("button", { cls: `xl-check ${v.doneToday ? "is-done" : ""}`, text: v.doneToday ? "✓" : "" });
		check.onclick = (e) => {
			e.stopPropagation();
			if (!v.doneToday) {
				playComplete();
				check.classList.add("xl-pop");
			}
			ctx.store.toggleHabit(habit.id, ctx.today);
		};
		row.appendChild(check);
	}

	// no icon for a single habit: icons are only for the category
	row.appendChild(el("span", { cls: "xl-habit-name", text: habit.name, attr: { title: habit.name } }));
	if (v.streak > 0) row.appendChild(el("span", { cls: "xl-streak", text: `${v.streak}×` }));

	const strip = el("div", { cls: "xl-strip" });
	for (const day of v.last) {
		strip.appendChild(
			el("div", {
				cls: `xl-dot ${day.done ? "is-done" : ""} ${day.today ? "is-today" : ""}`,
				attr: { title: day.date },
			})
		);
	}
	row.appendChild(strip);

	const del = el("button", { cls: "xl-del", text: "×" });
	del.onclick = (e) => {
		e.stopPropagation();
		if (confirm(ctx.lang === "it" ? `Eliminare "${habit.name}"?` : `Delete "${habit.name}"?`)) {
			ctx.store.deleteHabit(habit.id);
		}
	};
	row.appendChild(del);

	row.onclick = () => {
		if (ctx.expanded.has(habit.id)) ctx.expanded.delete(habit.id);
		else ctx.expanded.add(habit.id);
		ctx.rerender();
	};
	card.appendChild(row);
	card.oncontextmenu = (e) => {
		e.preventDefault();
		e.stopPropagation();
		openContextMenu(e.clientX, e.clientY, habitMenu(v, ctx));
	};

	if (ctx.expanded.has(habit.id)) {
		card.appendChild(heatmap(v.counts, ctx));
		card.appendChild(habitSettings(habit, ctx));
	}
	return card;
}

function habitSettings(habit: Habit, ctx: RenderCtx): HTMLElement {
	const wrap = el("div");
	const key = `s:${habit.id}`;
	const open = ctx.settingsOpen.has(key);
	const toggle = el("button", {
		cls: "xl-habit-settings-toggle",
		text: open ? (ctx.lang === "it" ? "Nascondi impostazioni" : "Hide settings") : ui("settings", ctx.lang),
	});
	toggle.onclick = (e) => {
		e.stopPropagation();
		if (open) ctx.settingsOpen.delete(key);
		else ctx.settingsOpen.add(key);
		ctx.rerender();
	};
	wrap.appendChild(toggle);
	if (!open) return wrap;

	const panel = el("div", { cls: "xl-habit-settings" });
	panel.onclick = (e) => e.stopPropagation();

	panel.appendChild(
		stepper(ui("perDay", ctx.lang), habit.goal, 1, (g) =>
			ctx.store.setHabitFields(habit.id, { goal: g === 1 ? "" : g })
		)
	);
	panel.appendChild(
		toggleRow(ui("freeCount", ctx.lang), habit.countable, (on) =>
			ctx.store.setHabitFields(habit.id, { countable: on ? "true" : "" })
		)
	);
	panel.appendChild(
		stepper(ui("cadence", ctx.lang), habit.cadence, 1, (c) =>
			ctx.store.setHabitFields(habit.id, { cadence: c === 1 ? "" : c })
		)
	);
	panel.appendChild(remindersRow(habit, ctx));
	wrap.appendChild(panel);
	return wrap;
}

function stepper(label: string, value: number, min: number, onChange: (v: number) => void): HTMLElement {
	const row = el("div", { cls: "xl-setting" });
	row.appendChild(el("span", { cls: "xl-setting-label", text: label }));
	const val = el("span", { cls: "xl-step-val", text: String(value) });
	const minus = el("button", { cls: "xl-step-btn", text: "−" });
	const plus = el("button", { cls: "xl-step-btn", text: "+" });
	minus.onclick = () => onChange(Math.max(min, value - 1));
	plus.onclick = () => onChange(value + 1);
	row.appendChild(el("div", { cls: "xl-stepper" }, [minus, val, plus]));
	return row;
}

function toggleRow(label: string, on: boolean, onChange: (on: boolean) => void): HTMLElement {
	const row = el("div", { cls: "xl-setting" });
	row.appendChild(el("span", { cls: "xl-setting-label", text: label }));
	const tog = el("button", { cls: `xl-toggle ${on ? "is-on" : ""}` }, [el("span", { cls: "xl-toggle-knob" })]);
	tog.onclick = () => onChange(!on);
	row.appendChild(tog);
	return row;
}

function remindersRow(habit: Habit, ctx: RenderCtx): HTMLElement {
	const row = el("div", { cls: "xl-setting xl-setting-col" });
	row.appendChild(el("span", { cls: "xl-setting-label", text: ui("reminders", ctx.lang) }));
	const chips = el("div", { cls: "xl-rem-chips" });
	for (const time of habit.reminders) {
		const x = el("span", { cls: "xl-rem-chip-x", text: "×" });
		x.onclick = () => ctx.store.setHabitReminders(habit.id, habit.reminders.filter((r) => r !== time));
		chips.appendChild(el("span", { cls: "xl-rem-chip", text: time }, [x]));
	}
	const input = el("input", { cls: "xl-rem-input", attr: { type: "time" } }) as HTMLInputElement;
	const add = el("button", { cls: "xl-rem-addbtn", text: "+" });
	add.onclick = () => {
		const v = input.value.trim();
		if (!/^\d{1,2}:\d{2}$/.test(v) || habit.reminders.includes(v)) return;
		ctx.store.setHabitReminders(habit.id, [...habit.reminders, v].sort());
	};
	chips.appendChild(el("div", { cls: "xl-rem-add" }, [input, add]));
	row.appendChild(chips);
	return row;
}

function heatmap(counts: Map<string, number>, ctx: RenderCtx): HTMLElement {
	const weeks = ctx.heatmapWeeks;
	const scroller = el("div", { cls: "xl-heatmap" });
	const grid = el("div", { cls: "xl-heatmap-grid" });
	const t0 = new Date();
	const dow = (t0.getDay() + 6) % 7;
	const monday = addDays(ctx.today, -dow);
	const start = addDays(monday, -(weeks - 1) * 7);
	let done = 0;
	for (let w = 0; w < weeks; w++) {
		const col = el("div", { cls: "xl-heatmap-col" });
		for (let d = 0; d < 7; d++) {
			const date = addDays(start, w * 7 + d);
			const cell = el("div", { cls: "xl-cell", attr: { title: date } });
			if (date > ctx.today) cell.classList.add("is-future");
			else if (counts.has(date)) {
				cell.classList.add("is-done");
				done++;
			}
			if (date === ctx.today) cell.classList.add("is-today");
			col.appendChild(cell);
		}
		grid.appendChild(col);
	}
	scroller.appendChild(grid);
	requestAnimationFrame(() => (scroller.scrollLeft = scroller.scrollWidth));
	const cap = ctx.lang === "it"
		? `${done} completamenti nelle ultime ${weeks} settimane`
		: `${done} completions in the last ${weeks} weeks`;
	const box = el("div");
	box.append(scroller, el("div", { cls: "xl-heatmap-caption", text: cap }));
	return box;
}

/* ---------------- Single habit ---------------- */

export function renderSingleHabit(host: HTMLElement, ctx: RenderCtx, habitId: string | undefined): void {
	const habit = ctx.data.habits.find((h) => h.id === habitId);
	const section = el("div", { cls: "xl-section" });
	if (!habit) {
		section.appendChild(el("div", { cls: "xl-empty", text: ctx.lang === "it" ? "Scegli un'abitudine nelle impostazioni del riquadro." : "Pick a habit in the tile settings." }));
		host.appendChild(section);
		return;
	}
	ctx.expanded.add(habit.id);
	const v = buildHabitView(habit, ctx.data.log, ctx.today);
	section.appendChild(habitRow(v, ctx));
	host.appendChild(section);
}

/* ---------------- Todos (by date) ---------------- */

export function renderTodos(host: HTMLElement, ctx: RenderCtx): void {
	const section = el("div", { cls: "xl-section" });
	section.appendChild(sectionTitle(ui("todos", ctx.lang)));
	const form = todoAddForm(ctx);
	form.prepend(el("div", { cls: "xl-add-sep" }));
	form.prepend(sortControl(ctx));
	section.appendChild(form);
	const list = el("div", { cls: "xl-todo-scroll" });

	// tasks exported from a note: one section per note, above everything else
	const sources = groupTodosBySource(ctx.data.todos);
	const openMain = ctx.data.todos.filter((t) => !t.done && !t.source);
	if (openMain.length === 0 && sources.length === 0) {
		list.appendChild(el("div", { cls: "xl-empty", text: ui("allDone", ctx.lang) + " ✨" }));
	}
	for (const g of sources) {
		const groupEl = groupDetails(`src:${g.source}`, "xl-group xl-group-source", ctx);
		groupEl.appendChild(
			el("summary", { cls: "xl-group-title" }, [
				el("span", { cls: "xl-group-name", text: g.title }),
				el("span", { cls: "xl-group-count", text: String(g.todos.length) }),
				noteLink(g.source, ctx),
			])
		);
		for (const todo of g.todos) groupEl.appendChild(todoRow(todo, ctx));
		list.appendChild(groupEl);
	}

	// "Overdue on top": pull overdue tasks into a pinned block above everything
	// else, static in every sort mode (skipped in manual-drag mode, which is a
	// full hand-ordered override).
	const isOverdue = (t: Todo) => !t.done && !!t.due && t.due < ctx.today;
	const pinOverdue = ctx.overdueTop && !ctx.draggable;
	if (pinOverdue) {
		const od = openMain.filter(isOverdue).sort((a, b) => (a.due ?? "").localeCompare(b.due ?? "") || a.lineNo - b.lineNo);
		if (od.length) {
			const groupEl = groupDetails("grp:overdue-pin", "xl-group xl-group-overdue", ctx);
			groupEl.appendChild(
				el("summary", { cls: "xl-group-title" }, [
					el("span", { text: labelFor("overdue", ctx.lang) }),
					el("span", { cls: "xl-group-count", text: String(od.length) }),
				])
			);
			for (const todo of od) groupEl.appendChild(todoRow(todo, ctx));
			list.appendChild(groupEl);
		}
	}
	const restMain = pinOverdue ? openMain.filter((t) => !isOverdue(t)) : openMain;

	if (ctx.sort === "date") {
		// default: grouped by due date (the overdue group is skipped once pinned)
		for (const g of groupTodos(ctx.data.todos, ctx.today)) {
			if (pinOverdue && g.id === "overdue") continue;
			const groupEl = groupDetails(`grp:${g.id}`, `xl-group ${g.overdue ? "xl-group-overdue" : ""}`, ctx);
			groupEl.appendChild(
				el("summary", { cls: "xl-group-title" }, [
					el("span", { text: labelFor(g.id, ctx.lang) }),
					el("span", { cls: "xl-group-count", text: String(g.todos.length) }),
				])
			);
			for (const todo of g.todos) groupEl.appendChild(todoRow(todo, ctx));
			list.appendChild(groupEl);
		}
	} else {
		// flat sorted list; draggable mode follows the file order (the manual one)
		const ordered = ctx.draggable
			? [...restMain].sort((a, b) => a.lineNo - b.lineNo)
			: [...restMain].sort(sortComparator(ctx.sort));
		if (!pinOverdue || ordered.length) flatTodoList(list, ordered, ctx);
	}

	const done = doneTodos(ctx.data.todos);
	if (done.length) {
		const details = el("details", { cls: "xl-done-group" });
		details.appendChild(el("summary", { text: `${ui("completed", ctx.lang)} (${done.length})` }));
		for (const todo of done) details.appendChild(todoRow(todo, ctx));
		list.appendChild(details);
	}
	section.appendChild(list);
	host.appendChild(section);
}

function labelFor(id: TodoGroupId, lang: Lang): string {
	return groupLabel(id, lang);
}

/** A <details> whose open/closed state is remembered across re-renders. */
function groupDetails(key: string, cls: string, ctx: RenderCtx): HTMLDetailsElement {
	const open = !ctx.collapsedGroups.has(key);
	const d = el("details", { cls, attr: open ? { open: "" } : {} }) as HTMLDetailsElement;
	d.addEventListener("toggle", () => {
		if (d.open) ctx.collapsedGroups.delete(key);
		else ctx.collapsedGroups.add(key);
	});
	return d;
}

/** The sort button + menu (sort modes and the Draggable toggle). */
function sortControl(ctx: RenderCtx): HTMLElement {
	const it = ctx.lang === "it";
	const btn = el("button", { cls: "xl-sort-btn", attr: { type: "button", title: it ? "Ordina" : "Sort" } });
	btn.textContent = NF.sort;
	btn.style.fontFamily = "var(--xl-nerd)";
	btn.onclick = () => {
		const r = btn.getBoundingClientRect();
		const cur = ctx.sort;
		const tick = (on: boolean) => (on ? "✓ " : "    ");
		const items: MenuEntry[] = [
			{ label: tick(cur === "date") + (it ? "Per data" : "By date"), onClick: () => ctx.setTodoSort("date") },
			{ label: tick(cur === "priority") + (it ? "Priorità" : "Priority"), onClick: () => ctx.setTodoSort("priority") },
		];
		// "Added" and "Due" are single entries whose two directions are interchangeable:
		// a ⇅ hint + the active direction; clicking the active one flips it.
		const addedActive = cur === "added-desc" || cur === "added-asc";
		const addedDir = cur === "added-asc" ? (it ? "vecchie" : "oldest") : it ? "recenti" : "newest";
		items.push({
			label: tick(addedActive) + (it ? "Aggiunta" : "Added") + ` · ${addedDir} ⇅`,
			onClick: () => ctx.setTodoSort(cur === "added-desc" ? "added-asc" : cur === "added-asc" ? "added-desc" : "added-desc"),
		});
		const dueActive = cur === "due-asc" || cur === "due-desc";
		const dueDir = cur === "due-desc" ? (it ? "lontana" : "furthest") : it ? "vicina" : "nearest";
		items.push({
			label: tick(dueActive) + (it ? "Scadenza" : "Due") + ` · ${dueDir} ⇅`,
			onClick: () => ctx.setTodoSort(cur === "due-asc" ? "due-desc" : cur === "due-desc" ? "due-asc" : "due-asc"),
		});
		items.push(null);
		items.push({
			label: tick(ctx.overdueTop) + (it ? "In ritardo in cima" : "Overdue on top"),
			onClick: () => ctx.setOverdueTop(!ctx.overdueTop),
		});
		items.push({
			label: tick(ctx.draggable) + (it ? "Trascinabile" : "Draggable"),
			onClick: () => ctx.setTodoDraggable(!ctx.draggable),
		});
		openContextMenu(Math.max(6, r.right - 200), r.bottom + 4, items);
	};
	return btn;
}

/** A flat task list; with drag-to-reorder when draggable is on. */
function flatTodoList(list: HTMLElement, ordered: Todo[], ctx: RenderCtx): void {
	if (ordered.length === 0) {
		list.appendChild(el("div", { cls: "xl-empty", text: ui("allDone", ctx.lang) + " ✨" }));
		return;
	}
	let fromLine = -1;
	const clear = () =>
		list.querySelectorAll(".xl-drop-before,.xl-drop-after").forEach((n) => n.classList.remove("xl-drop-before", "xl-drop-after"));
	for (const todo of ordered) {
		const row = todoRow(todo, ctx);
		if (ctx.draggable) {
			row.classList.add("xl-draggable");
			row.setAttribute("draggable", "true");
			row.addEventListener("dragstart", (e) => {
				fromLine = todo.lineNo;
				(e as DragEvent).dataTransfer!.effectAllowed = "move";
				row.classList.add("is-dragging");
			});
			row.addEventListener("dragend", () => {
				row.classList.remove("is-dragging");
				clear();
			});
			row.addEventListener("dragover", (e) => {
				e.preventDefault();
				const rect = row.getBoundingClientRect();
				const after = (e as DragEvent).clientY > rect.top + rect.height / 2;
				clear();
				row.classList.add(after ? "xl-drop-after" : "xl-drop-before");
			});
			row.addEventListener("drop", (e) => {
				e.preventDefault();
				const rect = row.getBoundingClientRect();
				const after = (e as DragEvent).clientY > rect.top + rect.height / 2;
				if (fromLine < 0 || fromLine === todo.lineNo) return;
				const order = ordered.map((t) => t.lineNo).filter((n) => n !== fromLine);
				let idx = order.indexOf(todo.lineNo);
				if (idx < 0) idx = order.length;
				if (after) idx++;
				order.splice(idx, 0, fromLine);
				ctx.store.reorderTodos(order);
			});
		}
		list.appendChild(row);
	}
}

/* ---------------- Todos (folders) ---------------- */

export function renderFolders(host: HTMLElement, ctx: RenderCtx): void {
	const section = el("div", { cls: "xl-section" });
	section.appendChild(sectionTitle(ui("tasks", ctx.lang)));
	section.appendChild(todoAddForm(ctx));
	const scroll = el("div", { cls: "xl-todo-scroll" });
	const folders = groupTodosByFolder(ctx.data.todos, ui("inbox", ctx.lang));
	if (folders.length === 0) {
		scroll.appendChild(el("div", { cls: "xl-empty", text: ui("allDone", ctx.lang) + " ✨" }));
	}
	for (const folder of folders) {
		const det = el("details", { cls: "xl-folder", attr: { open: "" } });
		const count = folder.sections.reduce((a, s) => a + s.todos.length, 0);
		det.appendChild(
			el("summary", { cls: "xl-folder-title" }, [
				el("span", { text: folder.list }),
				el("span", { cls: "xl-group-count", text: String(count) }),
				folder.source ? noteLink(folder.source, ctx) : null,
			])
		);
		for (const sec of folder.sections) {
			if (sec.section) {
				const sub = el("details", { cls: "xl-subfolder", attr: { open: "" } });
				sub.appendChild(
					el("summary", { cls: "xl-subfolder-title" }, [
						el("span", { text: sec.section }),
						el("span", { cls: "xl-group-count", text: String(sec.todos.length) }),
					])
				);
				for (const todo of sec.todos) sub.appendChild(todoRow(todo, ctx));
				det.appendChild(sub);
			} else {
				for (const todo of sec.todos) det.appendChild(todoRow(todo, ctx));
			}
		}
		scroll.appendChild(det);
	}
	section.appendChild(scroll);
	host.appendChild(section);
}

/** Button that opens, in Obsidian, the note a section's tasks were exported from. */
function noteLink(source: string, ctx: RenderCtx): HTMLElement {
	const label = ctx.lang === "it" ? "Apri la nota in Obsidian" : "Open the note in Obsidian";
	const btn = el("button", { cls: "xl-note-link", attr: { title: label, "aria-label": label }, html: lucideSvg("arrow-up-right", 12) ?? "↗" });
	btn.onclick = (e) => {
		// inside a <summary>: don't toggle the group
		e.preventDefault();
		e.stopPropagation();
		ctx.openNote(source);
	};
	return btn;
}

/** set when a task is added, so the next-rendered + button pops once */
let popAddBtn = false;
/** signature of the task just added, so its freshly-rendered row grows in once */
let justAdded: { text: string; due: string | null; time: string | null } | null = null;

function todoAddForm(ctx: RenderCtx): HTMLElement {
	const form = el("div", { cls: "xl-add" });
	const qaHint =
		ctx.lang === "it"
			? "Scrittura rapida: es. «pagare affitto domani 9:00 !alta»"
			: "Quick add: e.g. “pay rent tomorrow 9am !high”";
	const input = el("input", {
		cls: "xl-add-text",
		attr: { type: "text", placeholder: ui("newTask", ctx.lang), title: qaHint },
	}) as HTMLInputElement;
	// highlight overlay: a mirror behind the (transparent-text) input that paints
	// the recognised smart-text (dates / times / priority) in the accent colour.
	const field = el("div", { cls: "xl-add-field" });
	const mirror = el("div", { cls: "xl-add-mirror", attr: { "aria-hidden": "true" } });
	field.append(mirror, input);
	const paintMirror = () => {
		const raw = input.value;
		mirror.textContent = "";
		if (raw) {
			const { spans } = analyze(raw);
			let i = 0;
			for (const s of spans) {
				if (s.start > i) mirror.appendChild(document.createTextNode(raw.slice(i, s.start)));
				mirror.appendChild(el("span", { cls: `xl-smart xl-smart-${s.kind}`, text: raw.slice(s.start, s.end) }));
				i = s.end;
			}
			if (i < raw.length) mirror.appendChild(document.createTextNode(raw.slice(i)));
		}
		mirror.scrollLeft = input.scrollLeft;
	};
	input.addEventListener("input", paintMirror);
	input.addEventListener("scroll", () => { mirror.scrollLeft = input.scrollLeft; });
	const date = dateButton(null, ctx.dateFormat);
	const time = timeButton();
	// custom priority picker: a compact button whose glyph/colour reflect the
	// chosen priority; clicking opens a colour-coded menu.
	let curPrio: Priority = Priority.None;
	const prio = el("button", {
		cls: "xl-add-prio",
		attr: { type: "button", title: ctx.lang === "it" ? "Priorità" : "Priority" },
	});
	const paintPrio = () => {
		prio.textContent = PRIO_BTN_GLYPH;
		prio.style.color = PRIO_VAR[curPrio];
		prio.classList.toggle("is-set", curPrio !== Priority.None);
	};
	paintPrio();
	prio.onclick = () => {
		const r = prio.getBoundingClientRect();
		openContextMenu(
			r.left,
			r.bottom + 4,
			PRIO_PICK.map((c) => ({
				label: ctx.lang === "it" ? c.it : c.en,
				icon: c.glyph,
				iconColor: c.color,
				onClick: () => {
					curPrio = c.value;
					paintPrio();
				},
			}))
		);
	};
	// media attach: a paperclip that picks files, copies them into the vault, and
	// embeds them into the task (Obsidian `![[…]]`) on submit.
	const pendingMedia: string[] = [];
	const fileInput = el("input", {
		cls: "xl-file-hidden",
		attr: { type: "file", multiple: "true", accept: "image/*,video/*,audio/*,application/pdf" },
	}) as HTMLInputElement;
	const clip = el("button", {
		cls: "xl-pickbtn xl-clip",
		text: "",
		attr: { type: "button", title: ctx.lang === "it" ? "Allega media" : "Attach media" },
	});
	const paintClip = () => {
		clip.classList.toggle("is-set", pendingMedia.length > 0);
		clip.title = pendingMedia.length
			? (ctx.lang === "it" ? `${pendingMedia.length} allegato/i` : `${pendingMedia.length} attached`)
			: ctx.lang === "it" ? "Allega media" : "Attach media";
	};
	clip.onclick = () => fileInput.click();
	fileInput.onchange = async () => {
		const files = Array.from(fileInput.files ?? []);
		fileInput.value = "";
		for (const f of files) {
			try {
				const bytes = Array.from(new Uint8Array(await f.arrayBuffer()));
				pendingMedia.push(await ctx.attachMedia(f.name, bytes));
			} catch {
				/* attach failed: skip this file */
			}
		}
		paintClip();
	};

	const btn = el("button", { cls: "xl-add-btn", text: "+" });
	// pop the + when a task was just added (the form is rebuilt on re-render)
	if (popAddBtn) {
		popAddBtn = false;
		requestAnimationFrame(() => btn.classList.add("xl-pop"));
	}
	const submit = () => {
		const raw = input.value.trim();
		if (!raw) return;
		// TickTick-style quick add: pull date / time / priority out of the text,
		// but anything set explicitly in the pickers wins.
		const q = quickParse(raw);
		const parsed = q.text.length > 0;
		let text = parsed ? q.text : raw;
		// append any attached media as Obsidian embeds, so they persist in the line
		if (pendingMedia.length) text = `${text} ${pendingMedia.map((p) => `![[${p}]]`).join(" ")}`.trim();
		const due = date.getIso() ?? (parsed ? q.due : null);
		const t = time.getValue() || (parsed ? q.time : null);
		const prio = curPrio !== Priority.None ? curPrio : parsed && q.priority ? PRIO_FROM_KEY[q.priority] : Priority.None;
		// feedback: a falling "drop" sound now, a pop on the + button, and the new
		// row grows in (the inverse of the check-off collapse) on the next render
		playAdd();
		popAddBtn = true;
		justAdded = { text, due: due ?? null, time: t ?? null };
		if (ctx.draggable && ctx.sort !== "date") ctx.store.addTodoSorted(text, prio, due, t, ctx.sort);
		else ctx.store.addTodo(text, prio, due, t);
		input.value = "";
		paintMirror();
		date.clear();
		time.clear();
		curPrio = Priority.None;
		paintPrio();
		pendingMedia.length = 0;
		paintClip();
	};
	btn.onclick = submit;
	input.onkeydown = (e) => {
		if (e.key === "Enter") submit();
	};
	form.append(field, date.root, time.root, prio, clip, fileInput, btn);
	return form;
}

/** Context-menu entries for a task (all its editable options). */
function todoMenu(todo: Todo, ctx: RenderCtx): MenuEntry[] {
	const it = ctx.lang === "it";
	return [
		{ label: it ? "Modifica…" : "Edit…", icon: NF.edit, onClick: () => ctx.editTodo(todo) },
		{
			label: todo.done ? (it ? "Riapri" : "Reopen") : it ? "Completa" : "Complete",
			icon: todo.done ? NF.undo : NF.check,
			onClick: () => ctx.store.toggleTodo(todo),
		},
		{
			label: it ? "Priorità" : "Priority",
			icon: NF.flag,
			children: PRIO_PICK.map((c) => ({
				label: it ? c.it : c.en,
				icon: c.glyph,
				iconColor: c.color,
				onClick: () => ctx.store.updateTodo(todo, { priority: c.value }),
			})),
		},
		null,
		{ label: it ? "Elimina" : "Delete", icon: NF.trash, danger: true, onClick: () => ctx.store.deleteTodo(todo) },
	];
}

/** Context-menu entries for a habit (all its editable options). */
function habitMenu(v: HabitView, ctx: RenderCtx): MenuEntry[] {
	const it = ctx.lang === "it";
	const { habit } = v;
	const counter = habit.countable || habit.goal > 1;
	const items: MenuEntry[] = [];
	if (counter) {
		items.push({ label: "+1", icon: NF.plus, onClick: () => ctx.store.incrementHabit(habit.id, ctx.today) });
		items.push({ label: "−1", icon: NF.minus, disabled: v.countToday <= 0, onClick: () => ctx.store.decrementHabit(habit.id, ctx.today) });
	} else {
		items.push({
			label: v.doneToday ? (it ? "Segna da fare" : "Mark not done") : it ? "Segna fatto" : "Mark done",
			icon: v.doneToday ? NF.undo : NF.check,
			onClick: () => ctx.store.toggleHabit(habit.id, ctx.today),
		});
	}
	items.push(null);
	items.push({
		label: it ? "Impostazioni…" : "Settings…",
		icon: NF.cog,
		onClick: () => {
			ctx.expanded.add(habit.id);
			ctx.settingsOpen.add(`s:${habit.id}`);
			ctx.rerender();
		},
	});
	items.push({
		label: ctx.expanded.has(habit.id) ? (it ? "Nascondi cronologia" : "Hide history") : it ? "Cronologia" : "History",
		icon: NF.history,
		onClick: () => {
			if (ctx.expanded.has(habit.id)) ctx.expanded.delete(habit.id);
			else ctx.expanded.add(habit.id);
			ctx.rerender();
		},
	});
	items.push(null);
	items.push({ label: it ? "Elimina" : "Delete", icon: NF.trash, danger: true, onClick: () => ctx.store.deleteHabit(habit.id) });
	return items;
}

function todoRow(todo: Todo, ctx: RenderCtx): HTMLElement {
	const wrap = el("div", { cls: `xl-todo ${todo.done ? "is-done" : ""}` });
	// the row just added by the quick-add form grows in once (inverse of collapse)
	if (justAdded && !todo.done && todo.text === justAdded.text && (todo.due ?? null) === justAdded.due && (todo.time ?? null) === justAdded.time) {
		justAdded = null;
		requestAnimationFrame(() => expandIn(wrap));
	}
	const row = el("div", { cls: "xl-todo-main" });
	const check = el("button", { cls: `xl-check xl-check-sm ${todo.done ? "is-done" : ""}`, text: todo.done ? "✓" : "" });
	check.onclick = (e) => {
		e.stopPropagation();
		if (todo.done) {
			ctx.store.toggleTodo(todo);
			return;
		}
		playComplete();
		check.classList.add("is-done", "xl-pop");
		check.textContent = "✓";
		collapseThenRun(wrap, () => ctx.store.toggleTodo(todo));
	};
	row.appendChild(check);

	if (todo.priority !== Priority.None) {
		row.appendChild(el("span", { cls: `xl-prio-dot ${PRIO_CLASS[todo.priority]}` }));
	}
	// pull any media embeds out of the text: they render as thumbnails, not raw `![[…]]`
	const { clean, paths } = extractMedia(todo.text);
	const text = el("div", { cls: "xl-todo-text" });
	renderRich(text, clean);
	// click on the text = open the edit popup (not the links); inline rename is gone
	text.onclick = (e) => {
		if ((e.target as HTMLElement).closest("a")) return;
		e.stopPropagation();
		ctx.editTodo(todo);
	};
	row.appendChild(text);
	if (paths.length) row.appendChild(mediaStrip(paths, ctx));
	// click in the empty space of the row = edit popup
	row.onclick = () => ctx.editTodo(todo);
	// right-click = context menu with every editable option
	row.oncontextmenu = (e) => {
		e.preventDefault();
		e.stopPropagation();
		openContextMenu(e.clientX, e.clientY, todoMenu(todo, ctx));
	};

	if (todo.due || todo.time) {
		const overdue = !todo.done && !!todo.due && todo.due < ctx.today;
		const dateText = todo.due ? (todo.due === ctx.today ? ui("dueToday", ctx.lang) : formatDue(todo.due, ctx.lang)) : "";
		row.appendChild(el("span", { cls: `xl-due ${overdue ? "is-overdue" : ""}`, text: [dateText, todo.time].filter(Boolean).join(" ") }));
	}
	const del = el("button", { cls: "xl-del", text: "×" });
	del.onclick = (e) => {
		e.stopPropagation();
		ctx.store.deleteTodo(todo);
	};
	row.appendChild(del);
	wrap.appendChild(row);

	if (todo.description) {
		const desc = el("div", { cls: "xl-todo-desc" });
		for (const line of todo.description.split("\n")) {
			const d = el("div");
			renderRich(d, line);
			desc.appendChild(d);
		}
		wrap.appendChild(desc);
	}
	return wrap;
}

function formatDue(iso: string, lang: Lang): string {
	const [y, m, d] = iso.split("-").map(Number);
	const date = new Date(y, m - 1, d);
	const sameYear = y === new Date().getFullYear();
	return date.toLocaleDateString(locale(lang), { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }) });
}

/* ---------------- History overview ---------------- */

export function renderHistory(host: HTMLElement, ctx: RenderCtx): void {
	const section = el("div", { cls: "xl-section" });
	section.appendChild(sectionTitle(ui("history", ctx.lang)));
	if (ctx.data.habits.length === 0) {
		section.appendChild(el("div", { cls: "xl-empty", text: ui("noHabits", ctx.lang) }));
		host.appendChild(section);
		return;
	}
	for (const group of buildHabitGroups(ctx.data, ctx.today)) {
		if (group.category) {
			section.appendChild(
				el("div", { cls: "xl-hist-cat" }, [el("span", { text: group.category.name })])
			);
		}
		for (const v of group.habits) section.appendChild(historyLine(v, ctx));
	}
	host.appendChild(section);
}

function historyLine(v: HabitView, ctx: RenderCtx): HTMLElement {
	const line = el("div", { cls: "xl-hist-line" });
	line.appendChild(el("span", { cls: "xl-hist-name", text: v.habit.name, attr: { title: v.habit.name } }));
	const s = streak(v.counts, ctx.today, v.habit.goal, v.habit.cadence);
	if (s > 0) line.appendChild(el("span", { cls: "xl-streak", text: `${s}×` }));
	const strip = el("div", { cls: "xl-hist-strip" });
	const DAYS = 28;
	for (let i = DAYS - 1; i >= 0; i--) {
		const d = addDays(ctx.today, -i);
		strip.appendChild(
			el("div", { cls: `xl-cell ${v.counts.has(d) ? "is-done" : ""} ${d === ctx.today ? "is-today" : ""}`, attr: { title: d } })
		);
	}
	line.appendChild(strip);
	return line;
}

/* ---------------- Dispatcher ---------------- */

export function renderTileBody(host: HTMLElement, type: string, habitId: string | undefined, ctx: RenderCtx): void {
	clear(host);
	switch (type) {
		case "header": return renderHeader(host, ctx);
		case "stats": return renderStats(host, ctx);
		case "habits": return renderHabits(host, ctx);
		case "todos": return renderTodos(host, ctx);
		case "folders": return renderFolders(host, ctx);
		case "history": return renderHistory(host, ctx);
		case "habit": return renderSingleHabit(host, ctx, habitId);
		default: host.appendChild(el("div", { cls: "xl-empty", text: "?" }));
	}
}
