import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
	parseHabits,
	parseTodos,
	extractNoteTasks,
	addSourceTasks,
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
	parseCategories,
	setCategoryNameInFrontmatter,
	setCategoryIconInFrontmatter,
	reorderHabitsInFrontmatter,
} from "../src/parser";
import { Priority } from "../src/types";

test("parseHabits reads fields, goal, countable, cadence and reminders", () => {
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

test("parseTimeList and normalizeTime normalize times", () => {
	assert.deepEqual(parseTimeList('["9:0", "21:5"]'), ["09:00", "21:05"]);
	assert.equal(normalizeTime("7:30"), "07:30");
	assert.equal(normalizeTime("nope"), null);
});

test("parseTodoLine extracts date, time, priority and clean text", () => {
	const t = parseTodoLine("- [ ] Dentist 🔼 📅 2026-10-25 ⏰ 15:30", 0)!;
	assert.equal(t.text, "Dentist");
	assert.equal(t.due, "2026-10-25");
	assert.equal(t.time, "15:30");
	assert.equal(t.priority, Priority.Medium);
	assert.equal(t.done, false);
});

test("serializeTodo reproduces the time and round-trips through the parser", () => {
	const line = serializeTodo("Call", Priority.High, "2026-11-01", "10:00");
	const t = parseTodoLine(line, 0)!;
	assert.equal(t.text, "Call");
	assert.equal(t.due, "2026-11-01");
	assert.equal(t.time, "10:00");
	assert.equal(t.priority, Priority.High);
});

test("toggleTodoLine completes and reopens", () => {
	const done = toggleTodoLine("- [ ] Pay 📅 2026-10-20", "2026-10-22");
	assert.match(done, /- \[x\] Pay 📅 2026-10-20 ✅ 2026-10-22/);
	const open = toggleTodoLine(done, "2026-10-22");
	assert.match(open, /- \[ \] Pay 📅 2026-10-20/);
	assert.doesNotMatch(open, /✅/);
});

test("toggleLog adds and removes, parseLog counts duplicates", () => {
	let log = "# Habit history\n";
	log = toggleLog(log, "2026-10-22", "lamictal");
	log = toggleLog(log, "2026-10-22", "lamictal"); // second toggle removes it
	assert.doesNotMatch(log, /lamictal/);
	let log2 = "# h\n- [x] 2026-10-22 lamictal\n- [x] 2026-10-22 lamictal\n";
	const parsed = parseLog(log2);
	assert.equal(parsed.get("lamictal")!.get("2026-10-22"), 2);
});

test("streak respects goal (2 completions per day) and cadence", () => {
	// goal 2: a day only counts with ≥2 completions
	const counts = new Map<string, number>([
		["2026-10-22", 2],
		["2026-10-21", 2],
		["2026-10-20", 1], // only 1: breaks the streak
	]);
	assert.equal(streak(counts, "2026-10-22", 2, 1), 2);
	// cadence 2: one done day per period is enough
	const c2 = new Map<string, number>([
		["2026-10-22", 1],
		["2026-10-19", 1],
	]);
	assert.equal(streak(c2, "2026-10-22", 1, 2), 2);
});

test("addHabitToFrontmatter and setHabitFields write reminders as an array", () => {
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

/* ---------- tasks exported from a note ---------- */

test("parseTodos reads a `## [[Note]]` heading as the note the tasks came from", () => {
	const todos = parseTodos(
		"# Todo\n\n## [[Projects/Launch plan|Launch plan]]\n\n- [ ] Write the brief\n\n## [[Groceries]]\n\n- [ ] Milk\n\n## Inbox\n\n- [ ] Plain"
	);
	assert.equal(todos[0].list, "Launch plan");
	assert.equal(todos[0].source, "Projects/Launch plan");
	assert.equal(todos[1].list, "Groceries");
	assert.equal(todos[1].source, "Groceries");
	assert.equal(todos[2].list, "Inbox");
	assert.equal(todos[2].source, undefined);
});

test("extractNoteTasks keeps open tasks with their description, skips done ones and code", () => {
	const note = [
		"# Plan",
		"- [ ] Draft 📅 2026-11-02",
		"  some context",
		"  - [ ] Sub step",
		"- [x] Already done",
		"  hidden note",
		"```",
		"- [ ] not a task",
		"```",
		"Text",
		"- [ ] Last",
	].join("\n");
	assert.deepEqual(extractNoteTasks(note), [
		["- [ ] Draft 📅 2026-11-02", "\tsome context"],
		["- [ ] Sub step"],
		["- [ ] Last"],
	]);
	// line range: only the last task
	assert.deepEqual(extractNoteTasks(note, 10, 10), [["- [ ] Last"]]);
});

test("addSourceTasks creates the section once and doesn't duplicate on re-export", () => {
	const todo = "# Todo\n\n- [ ] Existing\n";
	const first = addSourceTasks(todo, "Projects/Launch plan.md", [["- [ ] A", "\tdesc"], ["- [ ] B"]]);
	assert.equal(first.added, 2);
	assert.equal(
		first.content,
		"# Todo\n\n- [ ] Existing\n\n## [[Projects/Launch plan|Launch plan]]\n\n- [ ] A\n\tdesc\n- [ ] B\n"
	);
	const second = addSourceTasks(first.content, "Projects/Launch plan.md", [["- [ ] A"], ["- [ ] C"]]);
	assert.equal(second.added, 1);
	assert.equal(
		second.content,
		"# Todo\n\n- [ ] Existing\n\n## [[Projects/Launch plan|Launch plan]]\n\n- [ ] A\n\tdesc\n- [ ] B\n- [ ] C\n"
	);
	assert.equal(addSourceTasks(second.content, "Projects/Launch plan.md", [["- [ ] B"]]).added, 0);
});

/* ---------- categories (edit, icon change, reorder) ---------- */

const CAT_MD = `---
habits:
  - id: med
    name: Meditation
    icon: lucide-flower
  - id: lam
    name: Lamictal
    icon: lucide-pill
  - id: min
    name: Minoxidil
    icon: lucide-pill
  - id: read
    name: Reading
    icon: lucide-book
categories:
  - icon: lucide-pill
    name: Meds
---
# h
`;

test("setCategoryNameInFrontmatter renames the category for its icon", () => {
	const md = setCategoryNameInFrontmatter(CAT_MD, "lucide-pill", "Medicine");
	assert.equal(parseCategories(md).find((c) => c.icon === "lucide-pill")?.name, "Medicine");
	// a brand-new category (no prior entry) is created
	const md2 = setCategoryNameInFrontmatter(CAT_MD, "lucide-book", "Study");
	assert.equal(parseCategories(md2).find((c) => c.icon === "lucide-book")?.name, "Study");
});

test("setCategoryIconInFrontmatter reassigns every member and carries the name", () => {
	const md = setCategoryIconInFrontmatter(CAT_MD, "lucide-pill", "lucide-heart");
	const habits = parseHabits(md);
	// both members moved to the new icon, nothing left on the old one
	assert.deepEqual(
		habits.filter((h) => h.icon === "lucide-heart").map((h) => h.id).sort(),
		["lam", "min"]
	);
	assert.equal(habits.filter((h) => h.icon === "lucide-pill").length, 0);
	// the saved name follows the new icon; the stale entry is gone
	const cats = parseCategories(md);
	assert.equal(cats.find((c) => c.icon === "lucide-heart")?.name, "Meds");
	assert.equal(cats.find((c) => c.icon === "lucide-pill"), undefined);
});

test("reorderHabitsInFrontmatter rewrites habit order (and keeps unnamed ones)", () => {
	// move the two pill habits after reading; omit 'med' (kept, trailing)
	const md = reorderHabitsInFrontmatter(CAT_MD, ["read", "lam", "min"]);
	assert.deepEqual(parseHabits(md).map((h) => h.id), ["read", "lam", "min", "med"]);
	// fields survive the move intact
	assert.equal(parseHabits(md).find((h) => h.id === "lam")?.name, "Lamictal");
});
