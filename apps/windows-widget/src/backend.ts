import type { Reminder } from "@xyzlog/core";
import type { AppConfig, TabLayout } from "./layout";
import { defaultTabs } from "./layout";

/** The three tracker files as raw text: parsing happens in the core, on the
   frontend side, so the logic stays single and shared. */
export interface VaultFiles {
	habits: string;
	log: string;
	todo: string;
}

export type FileKey = "habits" | "log" | "todo";

export interface Backend {
	readFiles(): Promise<VaultFiles>;
	writeFile(which: FileKey, content: string): Promise<void>;
	getConfig(): Promise<AppConfig>;
	setConfig(cfg: AppConfig): Promise<void>;
	pickFolder(): Promise<string | null>;
	/** look for an "xyz.log" folder inside the vault; null if there's none */
	locateDataFolder(vault: string): Promise<string | null>;
	/** create `<parent>/xyz.log` with the tracker files; returns the path */
	createDataFolder(parent: string): Promise<string>;
	/** notify the backend when one of the files changes (external edit / sync) */
	onFilesChanged(cb: () => void): void;
	/** hand the backend the list of reminders to schedule as notifications */
	syncReminders(reminders: Reminder[]): Promise<void>;
	/** show a notification right away (used by the "Test notification" button) */
	notify(title: string, body: string): Promise<void>;
	setOpacity(pct: number): Promise<void>;
	setPinned(on: boolean): Promise<void>;
	setAutostart(on: boolean): Promise<void>;
	/** open a vault note (path without `.md`, relative to the vault) in Obsidian */
	openNote(source: string): Promise<void>;
	/** Obsidian's current accent color (from appearance.json), or null */
	obsidianAccent(): Promise<string | null>;
	minimizeWindow(): Promise<void>;
	closeWindow(): Promise<void>;
	readonly isReal: boolean;
}

const DEFAULT_CONFIG = (): AppConfig => ({
	folder: "",
	lang: "en",
	accent: "#44437a",
	opacity: 95,
	pinned: false,
	autostart: true,
	notifications: true,
	syncAccent: true,
	activeTab: 0,
	tabs: defaultTabs(),
});

/* ------------------------------------------------------------------ */
/* Real backend (Tauri): invokes the Rust commands in src-tauri.       */
/* ------------------------------------------------------------------ */

function isTauri(): boolean {
	return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

class TauriBackend implements Backend {
	readonly isReal = true;
	private invoke!: <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>;
	private ready: Promise<void>;

	constructor() {
		this.ready = (async () => {
			const core = await import("@tauri-apps/api/core");
			const event = await import("@tauri-apps/api/event");
			this.invoke = core.invoke;
			// the backend emits "vault-changed" when a file changes on disk
			this.changeEvent = event.listen;
		})();
	}

	private changeEvent!: (
		name: string,
		cb: () => void
	) => Promise<() => void>;

	async readFiles(): Promise<VaultFiles> {
		await this.ready;
		return this.invoke<VaultFiles>("read_files");
	}
	async writeFile(which: FileKey, content: string): Promise<void> {
		await this.ready;
		await this.invoke("write_file", { which, content });
	}
	async getConfig(): Promise<AppConfig> {
		await this.ready;
		const cfg = await this.invoke<Partial<AppConfig>>("get_config");
		return { ...DEFAULT_CONFIG(), ...cfg, tabs: cfg.tabs?.length ? cfg.tabs : defaultTabs() };
	}
	async setConfig(cfg: AppConfig): Promise<void> {
		await this.ready;
		await this.invoke("set_config", { cfg });
	}
	async pickFolder(): Promise<string | null> {
		await this.ready;
		return this.invoke<string | null>("pick_folder");
	}
	async locateDataFolder(vault: string): Promise<string | null> {
		await this.ready;
		return this.invoke<string | null>("locate_data_folder", { vault });
	}
	async createDataFolder(parent: string): Promise<string> {
		await this.ready;
		return this.invoke<string>("create_data_folder", { parent });
	}
	onFilesChanged(cb: () => void): void {
		void this.ready.then(() => this.changeEvent("vault-changed", cb));
	}
	async syncReminders(reminders: Reminder[]): Promise<void> {
		await this.ready;
		await this.invoke("sync_reminders", { reminders });
	}
	async notify(title: string, body: string): Promise<void> {
		await this.ready;
		await this.invoke("notify_now", { title, body });
	}
	async setOpacity(pct: number): Promise<void> {
		await this.ready;
		await this.invoke("set_opacity", { pct });
	}
	async setPinned(on: boolean): Promise<void> {
		await this.ready;
		await this.invoke("set_pinned", { on });
	}
	async setAutostart(on: boolean): Promise<void> {
		await this.ready;
		await this.invoke("set_autostart", { on });
	}
	async obsidianAccent(): Promise<string | null> {
		await this.ready;
		return this.invoke<string | null>("obsidian_accent");
	}
	async openNote(source: string): Promise<void> {
		await this.ready;
		await this.invoke("open_note", { note: source });
	}
	async minimizeWindow(): Promise<void> {
		await this.ready;
		await this.invoke("minimize_window");
	}
	async closeWindow(): Promise<void> {
		await this.ready;
		await this.invoke("close_window");
	}
}

/* ------------------------------------------------------------------ */
/* Mock backend (browser): in-memory sample data + localStorage, to try */
/* out the interface without the native app.                            */
/* ------------------------------------------------------------------ */

const SAMPLE: VaultFiles = {
	habits: `---
habits:
  - id: meditation
    name: Meditation
    icon: lucide-flower
    reminders: ["08:00"]
  - id: lamictal
    name: Lamictal
    icon: lucide-pill
    goal: 2
    reminders: ["09:00", "21:00"]
  - id: minoxidil
    name: Minoxidil
    icon: lucide-pill
    goal: 2
    reminders: ["09:00", "21:00"]
  - id: reading
    name: Reading
    emoji: "📖"
    cadence: 2
  - id: water
    name: Water
    emoji: "💧"
    countable: true
categories:
  - icon: lucide-pill
    name: Meds
---

# Habits
`,
	log: `# Habit history

- [x] ${iso(-1)} meditation
- [x] ${iso(-2)} meditation
- [x] ${iso(0)} meditation
- [x] ${iso(0)} lamictal
- [x] ${iso(-1)} lamictal
- [x] ${iso(-1)} lamictal
- [x] ${iso(0)} water
- [x] ${iso(0)} water
- [x] ${iso(0)} water
`,
	todo: `# Todo

## Inbox

- [ ] Call the dentist 🔼 📅 ${iso(2)} ⏰ 15:30
- [ ] Buy the gift ⏫ 📅 ${iso(5)}
- [ ] Pay the bill 🔺 📅 ${iso(-3)}
- [ ] Reply to emails 📅 ${iso(0)} ⏰ 18:00
- [ ] Undated idea

## projects

### visual

- [ ] lidar prototype
	description on indented lines
	with a [link](https://example.com)

## [[Projects/Launch plan|Launch plan]]

- [ ] Write the brief 📅 ${iso(1)}
- [ ] Book the venue
`,
};

function iso(deltaDays: number): string {
	const d = new Date();
	d.setDate(d.getDate() + deltaDays);
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${d.getFullYear()}-${m}-${day}`;
}

const LS_FILES = "xl.files";
const LS_CONFIG = "xl.config";

class MockBackend implements Backend {
	readonly isReal = false;
	private files: VaultFiles;
	private listeners: (() => void)[] = [];

	constructor() {
		this.files = load<VaultFiles>(LS_FILES) ?? structuredClone(SAMPLE);
	}

	async readFiles(): Promise<VaultFiles> {
		return structuredClone(this.files);
	}
	async writeFile(which: FileKey, content: string): Promise<void> {
		this.files[which] = content;
		save(LS_FILES, this.files);
		for (const cb of this.listeners) cb();
	}
	async getConfig(): Promise<AppConfig> {
		const saved = load<AppConfig>(LS_CONFIG);
		const cfg = { ...DEFAULT_CONFIG(), ...saved };
		cfg.folder = cfg.folder || "(preview) vault/xyz.log";
		if (!cfg.tabs?.length) cfg.tabs = defaultTabs();
		return cfg;
	}
	async setConfig(cfg: AppConfig): Promise<void> {
		save(LS_CONFIG, cfg);
	}
	async pickFolder(): Promise<string | null> {
		return "(preview) vault";
	}
	async locateDataFolder(vault: string): Promise<string | null> {
		return `${vault}/xyz.log`;
	}
	async createDataFolder(parent: string): Promise<string> {
		return `${parent}/xyz.log`;
	}
	onFilesChanged(cb: () => void): void {
		this.listeners.push(cb);
	}
	async syncReminders(_reminders: Reminder[]): Promise<void> {
		/* in the preview there's no native scheduler */
	}
	async notify(title: string, body: string): Promise<void> {
		if ("Notification" in window && Notification.permission === "granted") {
			new Notification(title, { body });
		} else {
			console.info(`[notification] ${title} — ${body}`);
		}
	}
	async setOpacity(_pct: number): Promise<void> {}
	async setPinned(_on: boolean): Promise<void> {}
	async setAutostart(_on: boolean): Promise<void> {}
	async obsidianAccent(): Promise<string | null> {
		return null;
	}
	async openNote(source: string): Promise<void> {
		// no vault in the preview: hand the link to the browser
		window.open(`obsidian://open?file=${encodeURIComponent(source)}`);
	}
	async minimizeWindow(): Promise<void> {}
	async closeWindow(): Promise<void> {}
}

function load<T>(key: string): T | null {
	try {
		const raw = localStorage.getItem(key);
		return raw ? (JSON.parse(raw) as T) : null;
	} catch {
		return null;
	}
}

function save<T>(key: string, value: T): void {
	try {
		localStorage.setItem(key, JSON.stringify(value));
	} catch {
		/* storage not available */
	}
}

export function createBackend(): Backend {
	return isTauri() ? new TauriBackend() : new MockBackend();
}

export type { AppConfig, TabLayout };
