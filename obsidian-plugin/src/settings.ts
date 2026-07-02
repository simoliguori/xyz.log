import { App, PluginSettingTab, Setting } from "obsidian";
import type TodoHabitsPlugin from "./main";

export interface TrackerSettings {
	folder: string;
	heatmapWeeks: number;
}

export const DEFAULT_SETTINGS: TrackerSettings = {
	folder: "Tracker",
	heatmapWeeks: 52,
};

export class TrackerSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: TodoHabitsPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Cartella dei dati")
			.setDesc(
				"Cartella del vault che contiene Habits.md, Habit Log.md e Todo.md. Usa la stessa nell'app Android."
			)
			.addText((text) =>
				text
					.setPlaceholder("Tracker")
					.setValue(this.plugin.settings.folder)
					.onChange(async (value) => {
						this.plugin.settings.folder = value.trim() || "Tracker";
						await this.plugin.saveSettings();
						this.plugin.refreshView();
					})
			);

		new Setting(containerEl)
			.setName("Settimane nella heatmap")
			.setDesc("Quante settimane di cronologia mostrare quando espandi un'abitudine (52 ≈ come GitHub).")
			.addSlider((slider) =>
				slider
					.setLimits(12, 53, 1)
					.setValue(this.plugin.settings.heatmapWeeks)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.heatmapWeeks = value;
						await this.plugin.saveSettings();
						this.plugin.refreshView();
					})
			);
	}
}
