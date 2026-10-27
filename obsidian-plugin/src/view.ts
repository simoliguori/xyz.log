import { ItemView, WorkspaceLeaf } from "obsidian";
import type XyzlogPlugin from "./main";
import { TrackerRenderer } from "./renderer";

export const VIEW_TYPE = "xyzlog-view";

export class TrackerView extends ItemView {
	private renderer: TrackerRenderer | null = null;

	constructor(leaf: WorkspaceLeaf, private plugin: XyzlogPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE;
	}

	getDisplayText(): string {
		return "xyz.log";
	}

	getIcon(): string {
		return "calendar-check";
	}

	async onOpen(): Promise<void> {
		await this.render();
	}

	async render(): Promise<void> {
		if (!this.renderer) {
			this.renderer = new TrackerRenderer(this.plugin, this.contentEl, {
				header: true,
				habits: true,
				todos: true,
				cross: false,
				folders: false,
			});
		}
		await this.renderer.render();
	}
}
