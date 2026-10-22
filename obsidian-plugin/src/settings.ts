import { App, PluginSettingTab, Setting } from "obsidian";
import type TodoHabitsPlugin from "./main";
import { Lang, setLang, t } from "./strings";

export interface TrackerSettings {
	folder: string;
	heatmapWeeks: number;
	lang: Lang;
}

export const DEFAULT_SETTINGS: TrackerSettings = {
	folder: "Tracker",
	heatmapWeeks: 52,
	lang: "en",
};

export class TrackerSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: TodoHabitsPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName(t("setLangName"))
			.setDesc(t("setLangDesc"))
			.addDropdown((d) =>
				d
					.addOption("en", "English")
					.addOption("it", "Italiano")
					.setValue(this.plugin.settings.lang)
					.onChange(async (value) => {
						this.plugin.settings.lang = value as Lang;
						setLang(this.plugin.settings.lang);
						await this.plugin.saveSettings();
						this.plugin.refreshView();
						this.display(); // ridisegna le impostazioni nella nuova lingua
					})
			);

		new Setting(containerEl)
			.setName(t("setFolderName"))
			.setDesc(t("setFolderDesc"))
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
			.setName(t("setHeatmapName"))
			.setDesc(t("setHeatmapDesc"))
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
