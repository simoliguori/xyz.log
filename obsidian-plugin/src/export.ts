import { RangeSetBuilder, StateEffect, StateField, Text } from "@codemirror/state";
import { Decoration, DecorationSet, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";
import { editorInfoField, MarkdownPostProcessorContext, setIcon, TFile } from "obsidian";
import type XyzlogPlugin from "./main";
import { t } from "./strings";

/* "Export tasks into xyz.log" button, shown while hovering a task list in a
   note: in reading view (post-processor) and in the editor (CodeMirror). */

const TASK_RE = /^\s*- \[.\]\s/;

function exportButton(onClick: () => void): HTMLElement {
	const btn = document.createElement("button");
	btn.className = "th-export-btn";
	btn.setAttribute("aria-label", t("addToTasks"));
	btn.setAttribute("title", t("exportTasks"));
	setIcon(btn.createSpan({ cls: "th-export-icon" }), "list-plus");
	btn.createSpan({ text: t("addToTasks") });
	// keep the editor cursor where it is
	btn.onmousedown = (e) => e.preventDefault();
	btn.onclick = (e) => {
		e.preventDefault();
		e.stopPropagation();
		onClick();
	};
	return btn;
}

/* ---------------- reading view ---------------- */

export function exportPostProcessor(plugin: XyzlogPlugin) {
	return (el: HTMLElement, ctx: MarkdownPostProcessorContext): void => {
		if (plugin.store.isTrackedPath(ctx.sourcePath)) return;
		for (const ul of Array.from(el.querySelectorAll("ul"))) {
			// outermost task lists only, and never inside an xyz.log block
			if (!ul.querySelector(":scope > li.task-list-item")) continue;
			if (ul.parentElement?.closest("ul, ol, .th-root")) continue;
			ul.addClass("th-exportable");
			ul.appendChild(
				exportButton(() => {
					const file = plugin.app.vault.getFileByPath(ctx.sourcePath);
					if (!file) return;
					const info = ctx.getSectionInfo(el);
					void plugin.exportTasks(file, info?.lineStart, info?.lineEnd);
				})
			);
		}
	};
}

/* ---------------- editor (live preview / source) ---------------- */

/** Lines (1-based, inclusive) of the task list containing line `n`, or null. */
function taskRun(doc: Text, n: number): { from: number; to: number } | null {
	const inRun = (i: number) => {
		const text = doc.line(i).text;
		return TASK_RE.test(text) || (/^\s/.test(text) && text.trim() !== "");
	};
	if (!inRun(n)) return null;
	let from = n;
	while (from > 1 && inRun(from - 1)) from--;
	let to = n;
	while (to < doc.lines && inRun(to + 1)) to++;
	// the list starts at its first task
	while (from <= to && !TASK_RE.test(doc.line(from).text)) from++;
	return from <= n ? { from, to } : null;
}

/** Every contiguous task list in the document, top to bottom. */
function allTaskRuns(doc: Text): { from: number; to: number }[] {
	const runs: { from: number; to: number }[] = [];
	let i = 1;
	while (i <= doc.lines) {
		if (TASK_RE.test(doc.line(i).text)) {
			const run = taskRun(doc, i);
			if (run) {
				runs.push(run);
				i = run.to + 1;
				continue;
			}
		}
		i++;
	}
	return runs;
}

/* The icon that exports the whole note, parked in the right margin beside the
   topmost task. The bracket itself is drawn in CSS from the line decorations. */
class ExportWidget extends WidgetType {
	constructor(private plugin: XyzlogPlugin) {
		super();
	}
	eq(): boolean {
		return true;
	}
	toDOM(view: EditorView): HTMLElement {
		const btn = exportButton(() => {
			const file = view.state.field(editorInfoField).file;
			if (file instanceof TFile) void this.plugin.exportTasks(file);
		});
		btn.addClass("th-export-btn--margin");
		return btn;
	}
	ignoreEvent(): boolean {
		return true;
	}
}

/** Bracket every task run and park the export icon beside the first one. */
function buildDecorations(doc: Text, plugin: XyzlogPlugin): DecorationSet {
	const b = new RangeSetBuilder<Decoration>();
	allTaskRuns(doc).forEach((run, idx) => {
		for (let n = run.from; n <= run.to; n++) {
			const line = doc.line(n);
			const cls = ["th-exp"];
			if (n === run.from) cls.push("th-exp-top");
			if (n === run.to) cls.push("th-exp-bottom");
			b.add(line.from, line.from, Decoration.line({ class: cls.join(" ") }));
			if (idx === 0 && n === run.from) {
				b.add(line.to, line.to, Decoration.widget({ widget: new ExportWidget(plugin), side: 1 }));
			}
		}
	});
	return b.finish();
}

/** Whether a task list is being hovered (shows the bracket and icon). */
const setActive = StateEffect.define<boolean>();

export function exportEditorExtension(plugin: XyzlogPlugin) {
	const field = StateField.define<{ active: boolean; deco: DecorationSet }>({
		create: () => ({ active: false, deco: Decoration.none }),
		update(value, tr) {
			let active = value.active;
			for (const e of tr.effects) if (e.is(setActive)) active = e.value;
			if (active === value.active && !tr.docChanged) return value;
			return {
				active,
				deco: active ? buildDecorations(tr.state.doc, plugin) : Decoration.none,
			};
		},
		provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
	});

	// Listen on the scroller, not the text content: the bracket and icon live in
	// the right margin (outside .cm-content), so tracking the content alone would
	// drop the button the instant the cursor left the text — making it unclickable.
	const hover = ViewPlugin.define((view) => {
		const set = (active: boolean) => {
			if (view.state.field(field).active !== active) view.dispatch({ effects: setActive.of(active) });
		};
		const onMove = (e: MouseEvent) => {
			const f = view.state.field(editorInfoField).file;
			if (!(f instanceof TFile) || plugin.store.isTrackedPath(f.path)) {
				set(false);
				return;
			}
			const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
			if (pos == null) {
				set(false);
				return;
			}
			set(taskRun(view.state.doc, view.state.doc.lineAt(pos).number) !== null);
		};
		const onLeave = () => set(false);
		view.scrollDOM.addEventListener("mousemove", onMove);
		view.scrollDOM.addEventListener("mouseleave", onLeave);
		return {
			destroy() {
				view.scrollDOM.removeEventListener("mousemove", onMove);
				view.scrollDOM.removeEventListener("mouseleave", onLeave);
			},
		};
	});

	return [field, hover];
}
