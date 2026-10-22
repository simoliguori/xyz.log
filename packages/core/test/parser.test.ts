import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
	parseHabits,
	parseTodos,
	parseLog,
	parseTodoLine,
	serializeTodo,
	toggleLog,
	toggleTodoLine,
	streak,
	parseTimeList,
	normalizeTime,
	addHabitToFrontmatter,
	setHabitFieldsInFrontmatter,
	serializeTimeList,
} from "../src/parser";
import { Priority } from "../src/types";

test("parseHabits legge campi, goal, countable, cadence e reminders", () => {
	const md = `---
habits:
  - id: lamictal
    name: Lamictal
    goal: 2
    reminders: ["09:00", "21:00"]
  - id: pushup
    name: Push-up
    countable: true
  - id: english
    name: English
    cadence: 2
---
# Habits
`;
	const habits = parseHabits(md);
	assert.equal(habits.length, 3);
	const lam = habits[0];
	assert.equal(lam.id, "lamictal");
	assert.equal(lam.goal, 2);
	assert.deepEqual(lam.reminders, ["09:00", "21:00"]);
	assert.equal(habits[1].countable, true);
	assert.equal(habits[1].goal, 1);
	assert.equal(habits[2].cadence, 2);
	assert.deepEqual(habits[2].reminders, []);
});

test("parseTimeList e normalizeTime normalizzano gli orari", () => {
	assert.deepEqual(parseTimeList('["9:0", "21:5"]'), ["09:00", "21:05"]);
	assert.equal(normalizeTime("7:30"), "07:30");
	assert.equal(normalizeTime("boh"), null);
});

test("parseTodoLine estrae data, ora, priorità e testo pulito", () => {
	const t = parseTodoLine("- [ ] Dentista 🔼 📅 2026-10-25 ⏰ 15:30", 0)!;
	assert.equal(t.text, "Dentista");
	assert.equal(t.due, "2026-10-25");
	assert.equal(t.time, "15:30");
	assert.equal(t.priority, Priority.Medium);
	assert.equal(t.done, false);
});

test("serializeTodo riproduce ora ed è reversibile dal parser", () => {
	const line = serializeTodo("Chiamata", Priority.High, "2026-11-01", "10:00");
	const t = parseTodoLine(line, 0)!;
	assert.equal(t.text, "Chiamata");
	assert.equal(t.due, "2026-11-01");
	assert.equal(t.time, "10:00");
	assert.equal(t.priority, Priority.High);
});

test("toggleTodoLine completa e riapre", () => {
	const done = toggleTodoLine("- [ ] Pagare 📅 2026-10-20", "2026-10-22");
	assert.match(done, /- \[x\] Pagare 📅 2026-10-20 ✅ 2026-10-22/);
	const open = toggleTodoLine(done, "2026-10-22");
	assert.match(open, /- \[ \] Pagare 📅 2026-10-20/);
	assert.doesNotMatch(open, /✅/);
});

test("toggleLog aggiunge e rimuove, parseLog conta i doppioni", () => {
	let log = "# Habit history\n";
	log = toggleLog(log, "2026-10-22", "lamictal");
	log = toggleLog(log, "2026-10-22", "lamictal"); // secondo scatto rimuove
	assert.doesNotMatch(log, /lamictal/);
	let log2 = "# h\n- [x] 2026-10-22 lamictal\n- [x] 2026-10-22 lamictal\n";
	const parsed = parseLog(log2);
	assert.equal(parsed.get("lamictal")!.get("2026-10-22"), 2);
});

test("streak rispetta goal (2 completamenti al giorno) e cadence", () => {
	// goal 2: un giorno conta solo con ≥2 completamenti
	const counts = new Map<string, number>([
		["2026-10-22", 2],
		["2026-10-21", 2],
		["2026-10-20", 1], // solo 1: interrompe
	]);
	assert.equal(streak(counts, "2026-10-22", 2, 1), 2);
	// cadence 2: basta un giorno fatto per periodo
	const c2 = new Map<string, number>([
		["2026-10-22", 1],
		["2026-10-19", 1],
	]);
	assert.equal(streak(c2, "2026-10-22", 1, 2), 2);
});

test("addHabitToFrontmatter e setHabitFields scrivono reminders come array", () => {
	let md = `---\nhabits:\n  - id: a\n    name: A\n---\n# h\n`;
	md = addHabitToFrontmatter(md, { id: "b", name: "B" });
	assert.match(md, /- id: b/);
	md = setHabitFieldsInFrontmatter(md, "b", {
		goal: 2,
		reminders: serializeTimeList(["08:00", "20:00"]),
	});
	const habits = parseHabits(md);
	const b = habits.find((h) => h.id === "b")!;
	assert.equal(b.goal, 2);
	assert.deepEqual(b.reminders, ["08:00", "20:00"]);
});
