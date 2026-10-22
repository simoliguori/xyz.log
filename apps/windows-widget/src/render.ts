import {
	addDays,
	buildHabitGroups,
	buildHabitView,
	doneTodos,
	groupTodos,
	groupTodosByFolder,
	Habit,
	HabitView,
	Lang,
	locale,
	PRIORITY_EMOJI,
	Priority,
	streak,
	Todo,
	TrackerData,
	ui,
	groupLabel,
	type TodoGroupId,
} from "@todo-habits/core";
import { clear, el, renderRich } from "./dom";

/** Azioni di scrittura: implementate in main.ts su file + core, poi backend. */
export interface Store {
	toggleHabit(id: string, date: string): void;
	incrementHabit(id: string, date: string): void;
	decrementHabit(id: string, date: string): void;
	toggleTodo(todo: Todo): void;
	deleteTodo(todo: Todo): void;
	addTodo(text: string, prio: Priority, due: string | null, time: string | null): void;
	addHabit(name: string): void;
	deleteHabit(id: string): void;
	setHabitFields(id: string, fields: Record<string, string | number>): void;
	setHabitReminders(id: string, times: string[]): void;
}

export interface RenderCtx {
	data: TrackerData;
	today: string;
	lang: Lang;
	store: Store;
	expanded: Set<string>;
	settingsOpen: Set<string>;
	heatmapWeeks: number;
	rerender: () => void;
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
	for (const group of buildHabitGroups(ctx.data, ctx.today)) {
		if (group.category) {
			const cat = el("div", { cls: "xl-category" });
			cat.appendChild(
				el("div", { cls: "xl-category-head" }, [
					el("span", { cls: "xl-category-name", text: group.category.name }),
					el("span", { cls: "xl-group-count", text: String(group.habits.length) }),
				])
			);
			const body = el("div", { cls: "xl-category-body" });
			for (const v of group.habits) body.appendChild(habitRow(v, ctx));
			cat.appendChild(body);
			list.appendChild(cat);
		} else {
			list.appendChild(habitRow(group.habits[0], ctx));
		}
	}
	section.appendChild(list);
	host.appendChild(section);
}

function habitAddForm(ctx: RenderCtx): HTMLElement {
	const form = el("div", { cls: "xl-add" });
	const input = el("input", {
		cls: "xl-add-text",
		attr: { type: "text", placeholder: ui("newHabit", ctx.lang) },
	}) as HTMLInputElement;
	const btn = el("button", { cls: "xl-add-btn", text: "+" });
	const submit = () => {
		const name = input.value.trim();
		if (!name) return;
		ctx.store.addHabit(name);
		input.value = "";
	};
	btn.onclick = submit;
	input.onkeydown = (e) => {
		if (e.key === "Enter") submit();
	};
	form.append(input, btn);
	return form;
}

function habitRow(v: HabitView, ctx: RenderCtx): HTMLElement {
	const { habit } = v;
	const card = el("div", { cls: `xl-habit ${v.doneToday ? "is-done" : ""}` });
	const row = el("div", { cls: "xl-habit-row" });

	const counterMode = habit.countable || habit.goal > 1;
	if (counterMode) {
		const label = habit.countable ? String(v.countToday) : `${v.countToday}/${habit.goal}`;
		const counter = el("button", { cls: `xl-count ${v.doneToday ? "is-done" : ""}`, text: label });
		const atGoal = !habit.countable && v.countToday >= habit.goal;
		counter.onclick = (e) => {
			e.stopPropagation();
			if (atGoal) return;
			ctx.store.incrementHabit(habit.id, ctx.today);
		};
		counter.oncontextmenu = (e) => {
			e.preventDefault();
			e.stopPropagation();
			if (v.countToday > 0) ctx.store.decrementHabit(habit.id, ctx.today);
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
			ctx.store.toggleHabit(habit.id, ctx.today);
		};
		row.appendChild(check);
	}

	row.appendChild(el("span", { cls: "xl-habit-icon", text: habit.emoji || "•" }));
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
	section.appendChild(todoAddForm(ctx));
	const list = el("div", { cls: "xl-todo-scroll" });

	const groups = groupTodos(ctx.data.todos, ctx.today);
	if (groups.length === 0) {
		list.appendChild(el("div", { cls: "xl-empty", text: ui("allDone", ctx.lang) + " ✨" }));
	}
	for (const g of groups) {
		const groupEl = el("details", { cls: `xl-group ${g.overdue ? "xl-group-overdue" : ""}`, attr: { open: "" } });
		const sum = el("summary", { cls: "xl-group-title" }, [
			el("span", { text: labelFor(g.id, ctx.lang) }),
			el("span", { cls: "xl-group-count", text: String(g.todos.length) }),
		]);
		groupEl.appendChild(sum);
		for (const todo of g.todos) groupEl.appendChild(todoRow(todo, ctx));
		list.appendChild(groupEl);
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

function todoAddForm(ctx: RenderCtx): HTMLElement {
	const form = el("div", { cls: "xl-add" });
	const input = el("input", { cls: "xl-add-text", attr: { type: "text", placeholder: ui("newTask", ctx.lang) } }) as HTMLInputElement;
	const date = el("input", { cls: "xl-add-date", attr: { type: "date" } }) as HTMLInputElement;
	const time = el("input", { cls: "xl-add-time", attr: { type: "time" } }) as HTMLInputElement;
	const prio = el("select", { cls: "xl-add-prio" }) as HTMLSelectElement;
	for (const p of [Priority.None, Priority.Lowest, Priority.Low, Priority.Medium, Priority.High, Priority.Highest]) {
		const opt = el("option", { text: p === Priority.None ? "—" : PRIORITY_EMOJI[p], attr: { value: String(p) } });
		prio.appendChild(opt);
	}
	const btn = el("button", { cls: "xl-add-btn", text: "+" });
	const submit = () => {
		const text = input.value.trim();
		if (!text) return;
		ctx.store.addTodo(text, Number(prio.value) as Priority, date.value || null, time.value || null);
		input.value = "";
		date.value = "";
		time.value = "";
		prio.value = String(Priority.None);
	};
	btn.onclick = submit;
	input.onkeydown = (e) => {
		if (e.key === "Enter") submit();
	};
	form.append(input, date, time, prio, btn);
	return form;
}

function todoRow(todo: Todo, ctx: RenderCtx): HTMLElement {
	const wrap = el("div", { cls: `xl-todo ${todo.done ? "is-done" : ""}` });
	const row = el("div", { cls: "xl-todo-main" });
	const check = el("button", { cls: `xl-check xl-check-sm ${todo.done ? "is-done" : ""}`, text: todo.done ? "✓" : "" });
	check.onclick = () => ctx.store.toggleTodo(todo);
	row.appendChild(check);

	if (todo.priority !== Priority.None) {
		row.appendChild(el("span", { cls: `xl-prio-dot ${PRIO_CLASS[todo.priority]}` }));
	}
	const text = el("div", { cls: "xl-todo-text" });
	renderRich(text, todo.text);
	row.appendChild(text);

	if (todo.due || todo.time) {
		const overdue = !todo.done && !!todo.due && todo.due < ctx.today;
		const dateText = todo.due ? (todo.due === ctx.today ? ui("dueToday", ctx.lang) : formatDue(todo.due, ctx.lang)) : "";
		row.appendChild(el("span", { cls: `xl-due ${overdue ? "is-overdue" : ""}`, text: [dateText, todo.time].filter(Boolean).join(" ") }));
	}
	const del = el("button", { cls: "xl-del", text: "×" });
	del.onclick = () => ctx.store.deleteTodo(todo);
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
