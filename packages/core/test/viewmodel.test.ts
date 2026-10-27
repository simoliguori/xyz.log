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

test("groupTodos puts future (and today's) events ABOVE missed ones", () => {
	const todos = [
		todo("- [ ] Overdue 📅 2026-10-10"),
		todo("- [ ] Today 📅 2026-10-22"),
		todo("- [ ] Tomorrow 📅 2026-10-23"),
		todo("- [ ] No date"),
	];
	const groups = groupTodos(todos, today);
	const order = groups.map((g) => g.id);
	// today/next7 before overdue; nodate last
	assert.deepEqual(order, ["today", "next7", "overdue", "nodate"]);
	assert.ok(order.indexOf("overdue") > order.indexOf("next7"));
	assert.ok(order.indexOf("overdue") > order.indexOf("today"));
});

test("groupTodos sorts dated events by date and time", () => {
	const todos = [
		todo("- [ ] B 📅 2026-11-30 ⏰ 09:00"),
		todo("- [ ] A 📅 2026-10-25 ⏰ 18:00"),
		todo("- [ ] C 📅 2026-10-25 ⏰ 08:00"),
	];
	const groups = groupTodos(todos, today);
	// 25/10 is within the next 7 days; same date → sort by time (C before A)
	const next7 = groups.find((g) => g.id === "next7")!;
	assert.deepEqual(next7.todos.map((t) => t.text), ["C", "A"]);
	// 30/11 is "later"
	const later = groups.find((g) => g.id === "later")!;
	assert.deepEqual(later.todos.map((t) => t.text), ["B"]);
});

test("groupTodos: undated tasks go from newest to oldest", () => {
	const todos = [
		parseTodoLine("- [ ] old", 2)!,
		parseTodoLine("- [ ] mid", 5)!,
		parseTodoLine("- [ ] new", 9)!,
	];
	const nodate = groupTodos(todos, today).find((g) => g.id === "nodate")!;
	assert.deepEqual(nodate.todos.map((t) => t.text), ["new", "mid", "old"]);
});

test("collectReminders gathers habit and event reminders", () => {
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
		todos: [todo("- [ ] Appointment 📅 2026-10-25 ⏰ 15:30")],
	};
	const rem = collectReminders(data);
	assert.equal(rem.filter((r) => r.kind === "habit").length, 2);
	const ev = rem.find((r) => r.kind === "todo")!;
	assert.equal(ev.time, "15:30");
	assert.equal(ev.date, "2026-10-25");
});

test("buildHabitView computes doneToday with goal and the strip", () => {
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
