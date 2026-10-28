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
	btn.setAttribute("aria-label", t("exportTasks"));
	setIcon(btn.createSpan({ cls: "th-export-icon" }), "list-checks");
	btn.createSpan({ text: t("exportTasks") });
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

class ExportWidget extends WidgetType {
	constructor(private plugin: XyzlogPlugin, private line: number) {
		super();
	}
	eq(other: ExportWidget): boolean {
		return other.line === this.line;
	}
	toDOM(view: EditorView): HTMLElement {
		const btn = exportButton(() => {
			const file = view.state.field(editorInfoField).file;
			const run = taskRun(view.state.doc, Math.min(this.line, view.state.doc.lines));
			if (!(file instanceof TFile) || !run) return;
			void this.plugin.exportTasks(file, run.from - 1, run.to - 1);
		});
		btn.addClass("th-export-btn--inline");
		return btn;
	}
	ignoreEvent(): boolean {
		return true;
	}
}

/** First line of the hovered task list (null = none). */
const setHovered = StateEffect.define<number | null>();

export function exportEditorExtension(plugin: XyzlogPlugin) {
	const field = StateField.define<{ line: number | null; deco: DecorationSet }>({
		create: () => ({ line: null, deco: Decoration.none }),
		update(value, tr) {
			let line = value.line;
			for (const e of tr.effects) if (e.is(setHovered)) line = e.value;
			if (tr.docChanged && line !== null) {
				// follow edits; drop the button if the list is gone
				const from = tr.startState.doc.line(line).from;
				line = tr.state.doc.lineAt(tr.changes.mapPos(from)).number;
				if (!TASK_RE.test(tr.state.doc.line(line).text)) line = null;
			}
			if (line === value.line && !tr.docChanged) return value;
			const b = new RangeSetBuilder<Decoration>();
			if (line !== null) {
				const at = tr.state.doc.line(line).to;
				b.add(at, at, Decoration.widget({ widget: new ExportWidget(plugin, line), side: 1 }));
			}
			return { line, deco: b.finish() };
		},
		provide: (f) => EditorView.decorations.from(f, (v) => v.deco),
	});

	const hover = ViewPlugin.define((view) => {
		const set = (line: number | null) => {
			if (view.state.field(field).line !== line) view.dispatch({ effects: setHovered.of(line) });
		};
		const file = () => view.state.field(editorInfoField).file;
		return {
			mousemove(e: MouseEvent) {
				const f = file();
				if (!f || plugin.store.isTrackedPath(f.path)) return;
				const pos = view.posAtCoords({ x: e.clientX, y: e.clientY }, false);
				const run = taskRun(view.state.doc, view.state.doc.lineAt(pos).number);
				set(run ? run.from : null);
			},
			mouseleave() {
				set(null);
			},
		};
	}, {
		eventHandlers: {
			mousemove(e) {
				this.mousemove(e);
			},
			mouseleave() {
				this.mouseleave();
			},
		},
	});

	return [field, hover];
}
