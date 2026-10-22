import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseTodoLine } from "../src/parser";
import {
	groupTodos,
	collectReminders,
	buildHabitView,
} from "../src/viewmodel";
import { Habit, HabitLog, Todo, TrackerData } from "../src/types";

const today = "2026-10-22";

function todo(line: string): Todo {
	return parseTodoLine(line, 0)!;
}

test("groupTodos mette gli eventi futuri (e di oggi) SOPRA i mancati", () => {
	const todos = [
		todo("- [ ] Scaduto 📅 2026-10-10"),
		todo("- [ ] Oggi 📅 2026-10-22"),
		todo("- [ ] Domani 📅 2026-10-23"),
		todo("- [ ] Senza data"),
	];
	const groups = groupTodos(todos, today);
	const order = groups.map((g) => g.id);
	// today/next7 prima di overdue; nodate in fondo
	assert.deepEqual(order, ["today", "next7", "overdue", "nodate"]);
	assert.ok(order.indexOf("overdue") > order.indexOf("next7"));
	assert.ok(order.indexOf("overdue") > order.indexOf("today"));
});

test("groupTodos ordina gli eventi datati per data e ora", () => {
	const todos = [
		todo("- [ ] B 📅 2026-11-30 ⏰ 09:00"),
		todo("- [ ] A 📅 2026-10-25 ⏰ 18:00"),
		todo("- [ ] C 📅 2026-10-25 ⏰ 08:00"),
	];
	const groups = groupTodos(todos, today);
	// 25/10 è nei prossimi 7 giorni; stessa data → ordina per ora (C prima di A)
	const next7 = groups.find((g) => g.id === "next7")!;
	assert.deepEqual(next7.todos.map((t) => t.text), ["C", "A"]);
	// 30/11 è "più avanti"
	const later = groups.find((g) => g.id === "later")!;
	assert.deepEqual(later.todos.map((t) => t.text), ["B"]);
});

test("collectReminders raccoglie promemoria di abitudini ed eventi", () => {
	const habit: Habit = {
		id: "lamictal",
		name: "Lamictal",
		emoji: "",
		icon: "",
		cadence: 1,
		start: "",
		duration: 0,
		countable: false,
		goal: 2,
		reminders: ["09:00", "21:00"],
	};
	const data: TrackerData = {
		habits: [habit],
		categories: [],
		log: new Map() as HabitLog,
		todos: [todo("- [ ] Visita 📅 2026-10-25 ⏰ 15:30")],
	};
	const rem = collectReminders(data);
	assert.equal(rem.filter((r) => r.kind === "habit").length, 2);
	const ev = rem.find((r) => r.kind === "todo")!;
	assert.equal(ev.time, "15:30");
	assert.equal(ev.date, "2026-10-25");
});

test("buildHabitView calcola doneToday con goal e la striscia", () => {
	const habit: Habit = {
		id: "lamictal",
		name: "Lamictal",
		emoji: "",
		icon: "",
		cadence: 1,
		start: "",
		duration: 0,
		countable: false,
		goal: 2,
		reminders: [],
	};
	const log: HabitLog = new Map([["lamictal", new Map([[today, 2]])]]);
	const v = buildHabitView(habit, log, today, 7);
	assert.equal(v.countToday, 2);
	assert.equal(v.doneToday, true);
	assert.equal(v.last.length, 7);
	assert.equal(v.last[6].today, true);
	assert.equal(v.last[6].done, true);
});
