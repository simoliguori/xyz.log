import type { Reminder } from "@todo-habits/core";
import type { AppConfig, TabLayout } from "./layout";
import { defaultTabs } from "./layout";

/** I tre file del tracker come testo grezzo: il parsing avviene nel core,
   lato frontend, così la logica resta una sola e condivisa. */
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
	/** notifica il backend quando uno dei file cambia (edit esterno / sync) */
	onFilesChanged(cb: () => void): void;
	/** passa al backend l'elenco dei promemoria da programmare come notifiche */
	syncReminders(reminders: Reminder[]): Promise<void>;
	/** mostra subito una notifica (usata per il test "Prova notifica") */
	notify(title: string, body: string): Promise<void>;
	setOpacity(pct: number): Promise<void>;
	setPinned(on: boolean): Promise<void>;
	setAutostart(on: boolean): Promise<void>;
	readonly isReal: boolean;
}

const DEFAULT_CONFIG = (): AppConfig => ({
	folder: "",
	lang: "it",
	accent: "#44437a",
	opacity: 90,
	pinned: false,
	autostart: true,
	notifications: true,
	tabs: defaultTabs(),
});

/* ------------------------------------------------------------------ */
/* Backend reale (Tauri): invoca i comandi Rust in src-tauri.          */
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
			// il backend emette "vault-changed" quando un file cambia su disco
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
}

/* ------------------------------------------------------------------ */
/* Backend fittizio (browser): dati d'esempio in memoria + localStorage */
/* per provare l'interfaccia senza l'app nativa.                        */
/* ------------------------------------------------------------------ */

const SAMPLE: VaultFiles = {
	habits: `---
habits:
  - id: meditation
    name: Meditazione
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
    name: Lettura
    emoji: "📖"
    cadence: 2
  - id: water
    name: Acqua
    emoji: "💧"
    countable: true
categories:
  - icon: lucide-pill
    name: Farmaci
---

# Abitudini
`,
	log: `# Cronologia abitudini

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

- [ ] Chiamare il dentista 🔼 📅 ${iso(2)} ⏰ 15:30
- [ ] Comprare il regalo ⏫ 📅 ${iso(5)}
- [ ] Pagare la bolletta 🔺 📅 ${iso(-3)}
- [ ] Rispondere alle email 📅 ${iso(0)} ⏰ 18:00
- [ ] Idea senza data

## progetti

### visual

- [ ] prototipo lidar
	descrizione su righe indentate
	con un [link](https://example.com)
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
		cfg.folder = cfg.folder || "(anteprima) vault/Tracker";
		if (!cfg.tabs?.length) cfg.tabs = defaultTabs();
		return cfg;
	}
	async setConfig(cfg: AppConfig): Promise<void> {
		save(LS_CONFIG, cfg);
	}
	async pickFolder(): Promise<string | null> {
		return "(anteprima) vault/Tracker";
	}
	onFilesChanged(cb: () => void): void {
		this.listeners.push(cb);
	}
	async syncReminders(_reminders: Reminder[]): Promise<void> {
		/* nell'anteprima non c'è uno scheduler nativo */
	}
	async notify(title: string, body: string): Promise<void> {
		if ("Notification" in window && Notification.permission === "granted") {
			new Notification(title, { body });
		} else {
			console.info(`[notifica] ${title} — ${body}`);
		}
	}
	async setOpacity(_pct: number): Promise<void> {}
	async setPinned(_on: boolean): Promise<void> {}
	async setAutostart(_on: boolean): Promise<void> {}
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
		/* storage non disponibile */
	}
}

export function createBackend(): Backend {
	return isTauri() ? new TauriBackend() : new MockBackend();
}

export type { AppConfig, TabLayout };
