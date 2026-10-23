import { debounce, Editor, MarkdownPostProcessorContext, MarkdownRenderChild, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { TrackerRenderer, RenderOptions } from "./renderer";
import { DEFAULT_SETTINGS, TrackerSettings, TrackerSettingTab } from "./settings";
import { Store } from "./store";
import { setLang, t } from "./strings";
import { TrackerView, VIEW_TYPE } from "./view";

export default class XyzlogPlugin extends Plugin {
	settings: TrackerSettings;
	store: Store;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.store = new Store(this.app, () => this.settings.folder);

		this.registerView(VIEW_TYPE, (leaf) => new TrackerView(leaf, this));

		this.addRibbonIcon("calendar-check", t("openTracker"), () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-tracker",
			name: t("openTracker"),
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: "insert-block",
			name: t("insertBlock"),
			editorCallback: (editor: Editor) => {
				const block = "```xyz.log\nheader\nhabits\ntodos\n```\n";
				editor.replaceSelection(block);
			},
		});

		this.addSettingTab(new TrackerSettingTab(this.app, this));

		// blocco ```xyz.log``` incorporabile in qualsiasi nota
		// (alias retrocompatibili: `xyzlog` e il vecchio `todo-habits`)
		const blockHandler = (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
			const opts = parseEmbedOptions(source);
			el.addClass("th-embed");
			const renderer = new TrackerRenderer(this, el, opts);

			const child = new MarkdownRenderChild(el);
			ctx.addChild(child);
			const refresh = debounce(() => void renderer.render(), 150, true);
			child.registerEvent(
				this.app.vault.on("modify", (file) => {
					if (file instanceof TFile && this.store.isTrackedPath(file.path)) {
						refresh();
					}
				})
			);

			void renderer.render();
		};
		for (const lang of ["xyz.log", "xyzlog", "todo-habits"]) {
			this.registerMarkdownCodeBlockProcessor(lang, blockHandler);
		}

		// ri-renderizza quando uno dei tre file cambia (edit manuale o Obsidian Sync)
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file instanceof TFile && this.store.isTrackedPath(file.path)) {
					this.refreshView();
				}
			})
		);
	}

	refreshView = debounce(
		() => {
			for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
				if (leaf.view instanceof TrackerView) void leaf.view.render();
			}
		},
		150,
		true
	);

	async activateView(): Promise<void> {
		const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (existing) {
			await this.app.workspace.revealLeaf(existing);
			return;
		}
		await this.store.ensureFiles();
		const leaf: WorkspaceLeaf = this.app.workspace.getLeaf("tab");
		await leaf.setViewState({ type: VIEW_TYPE, active: true });
		await this.app.workspace.revealLeaf(leaf);
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		setLang(this.settings.lang);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}

/**
 * Opzioni del blocco ```xyz.log```, una per riga:
 * `habits`, `todos`, `header`, `habit: <id>`. Vuoto = habits + todos.
 */
function parseEmbedOptions(source: string): RenderOptions {
	const opts: RenderOptions = {
		header: false,
		habits: false,
		todos: false,
		cross: false,
		folders: false,
	};
	let any = false;
	for (const raw of source.split(/\r?\n/)) {
		const line = raw.trim().toLowerCase();
		if (!line) continue;
		if (line === "habits" || line === "abitudini") {
			opts.habits = true;
			any = true;
		} else if (line === "todos" || line === "todo") {
			opts.todos = true;
			any = true;
		} else if (line === "cross" || line === "croce" || line === "griglia") {
			opts.cross = true;
			any = true;
		} else if (line === "folders" || line === "cartelle" || line === "liste") {
			opts.folders = true;
			any = true;
		} else if (line === "header" || line === "data") {
			opts.header = true;
		} else {
			const m = line.match(/^habit:\s*([a-z0-9-]+)$/);
			if (m) {
				opts.habitId = m[1];
				any = true;
			}
		}
	}
	if (!any) {
		opts.habits = true;
		opts.todos = true;
	}
	return opts;
}
