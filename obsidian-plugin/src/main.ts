import { debounce, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { DEFAULT_SETTINGS, TrackerSettings, TrackerSettingTab } from "./settings";
import { Store } from "./store";
import { TrackerView, VIEW_TYPE } from "./view";

export default class TodoHabitsPlugin extends Plugin {
	settings: TrackerSettings;
	store: Store;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.store = new Store(this.app, () => this.settings.folder);

		this.registerView(VIEW_TYPE, (leaf) => new TrackerView(leaf, this));

		this.addRibbonIcon("calendar-check", "Apri Todo & Habits", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-tracker",
			name: "Apri il tracker",
			callback: () => void this.activateView(),
		});

		this.addSettingTab(new TrackerSettingTab(this.app, this));

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
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
