import { App, Modal, Notice, Setting } from "obsidian";
import type XyzlogPlugin from "./main";
import { PRIORITY_EMOJI, todayISO } from "./parser";
import { Priority } from "./types";
import { t, tf } from "./strings";

/**
 * TickTick import (Obsidian-only, kept out of the shared parser).
 *
 * TickTick's "Backup" export is a CSV whose first rows are metadata
 * (`Date: …`, `Version: …`, a blank line) followed by a header row that
 * starts with `"Folder Name"`. We map each task row onto the `Todo.md`
 * markdown format, grouped by TickTick list.
 */

export interface TickTickTask {
	list: string;
	title: string;
	tags: string[];
	content: string;
	due: string | null;
	time: string | null;
	priority: Priority;
	done: boolean;
	doneDate: string | null;
}

/** Minimal RFC-4180 CSV reader: handles quoted fields, escaped quotes and newlines. */
export function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let inQuotes = false;
	const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

	for (let i = 0; i < src.length; i++) {
		const c = src[i];
		if (inQuotes) {
			if (c === '"') {
				if (src[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n") {
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else {
			field += c;
		}
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	return rows;
}

/** TickTick priority (0/1/3/5) → our Priority enum. */
function mapPriority(raw: string): Priority {
	switch (raw.trim()) {
		case "5":
			return Priority.High;
		case "3":
			return Priority.Medium;
		case "1":
			return Priority.Low;
		default:
			return Priority.None;
	}
}

/** Extract `YYYY-MM-DD` and `HH:mm` from a TickTick ISO datetime. */
function splitDateTime(raw: string, allDay: boolean): { date: string | null; time: string | null } {
	const m = raw.trim().match(/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/);
	if (!m) return { date: null, time: null };
	const time = !allDay && m[2] && !(m[2] === "00" && m[3] === "00") ? `${m[2]}:${m[3]}` : null;
	return { date: m[1], time };
}

/** Parse a TickTick backup CSV into tasks. Returns `[]` if no header row is found. */
export function parseTickTick(csv: string): TickTickTask[] {
	const rows = parseCsv(csv);
	const headerIdx = rows.findIndex(
		(r) => r[0]?.trim() === "Folder Name" || (r.includes("Title") && r.includes("Due Date"))
	);
	if (headerIdx < 0) return [];

	const header = rows[headerIdx].map((h) => h.trim());
	const col = (name: string) => header.indexOf(name);
	const iList = col("List Name");
	const iTitle = col("Title");
	const iTags = col("Tags");
	const iContent = col("Content");
	const iDue = col("Due Date");
	const iPrio = col("Priority");
	const iStatus = col("Status");
	const iDone = col("Completed Time");
	const iAllDay = col("Is All Day");

	const tasks: TickTickTask[] = [];
	for (let i = headerIdx + 1; i < rows.length; i++) {
		const r = rows[i];
		const title = (r[iTitle] ?? "").trim();
		if (!title) continue;

		const allDay = (r[iAllDay] ?? "").trim().toLowerCase() === "true";
		const { date: due, time } = splitDateTime(r[iDue] ?? "", allDay);
		const doneRaw = splitDateTime(r[iDone] ?? "", true).date;
		const done = (r[iStatus] ?? "").trim() === "2";

		tasks.push({
			list: (r[iList] ?? "").trim() || "Inbox",
			title,
			tags: (r[iTags] ?? "")
				.split(/[,\s]+/)
				.map((s) => s.trim())
				.filter(Boolean),
			content: (r[iContent] ?? "").trim(),
			due,
			time,
			priority: mapPriority(r[iPrio] ?? ""),
			done,
			doneDate: done ? doneRaw ?? todayISO() : null,
		});
	}
	return tasks;
}

/** Serialize parsed tasks into `Todo.md` markdown, grouped by list. */
export function tickTickToMarkdown(tasks: TickTickTask[]): string {
	const byList = new Map<string, TickTickTask[]>();
	for (const task of tasks) {
		if (!byList.has(task.list)) byList.set(task.list, []);
		byList.get(task.list)!.push(task);
	}

	const out: string[] = [];
	for (const [list, items] of byList) {
		out.push("", `## ${list}`, "");
		for (const task of items) {
			const box = task.done ? "x" : " ";
			const tags = task.tags.map((tg) => (tg.startsWith("#") ? tg : `#${tg}`)).join(" ");
			let line = `- [${box}] ${task.title}`;
			if (tags) line += ` ${tags}`;
			if (task.priority !== Priority.None) line += ` ${PRIORITY_EMOJI[task.priority]}`;
			if (task.due) line += ` 📅 ${task.due}`;
			if (task.time) line += ` ⏰ ${task.time}`;
			if (task.done && task.doneDate) line += ` ✅ ${task.doneDate}`;
			out.push(line);
			if (task.content) {
				for (const descLine of task.content.split(/\n/)) {
					if (descLine.trim()) out.push(`\t${descLine.trim()}`);
				}
			}
		}
	}
	return out.join("\n");
}

/** Modal: pick a TickTick CSV backup, preview the count, confirm the import. */
export class TickTickImportModal extends Modal {
	private tasks: TickTickTask[] = [];

	constructor(app: App, private plugin: XyzlogPlugin) {
		super(app);
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl("h2", { text: t("importTickTickTitle") });
		contentEl.createEl("p", { text: t("importTickTickHelp"), cls: "th-import-help" });

		const fileInput = contentEl.createEl("input", {
			type: "file",
			attr: { accept: ".csv,text/csv" },
		});

		const status = contentEl.createEl("p", { cls: "th-import-status" });

		const actions = new Setting(contentEl);
		let importBtn!: HTMLButtonElement;
		actions.addButton((b) =>
			b
				.setButtonText(t("importAction"))
				.setCta()
				.setDisabled(true)
				.onClick(() => void this.runImport())
				.then((b) => (importBtn = b.buttonEl))
		);
		actions.addButton((b) => b.setButtonText(t("cancel")).onClick(() => this.close()));

		fileInput.addEventListener("change", async () => {
			const file = fileInput.files?.[0];
			if (!file) return;
			const text = await file.text();
			this.tasks = parseTickTick(text);
			if (this.tasks.length === 0) {
				status.setText(t("importNothing"));
				importBtn.disabled = true;
			} else {
				const lists = new Set(this.tasks.map((task) => task.list)).size;
				status.setText(tf.importFound(this.tasks.length, lists));
				importBtn.disabled = false;
			}
		});
	}

	private async runImport(): Promise<void> {
		if (this.tasks.length === 0) return;
		const markdown = tickTickToMarkdown(this.tasks);
		await this.plugin.store.appendTodoMarkdown(markdown);
		this.plugin.refreshView();
		new Notice(tf.importDone(this.tasks.length));
		this.close();
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
