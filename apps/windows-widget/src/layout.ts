/* Modello della composizione modulare: il widget è fatto di "tab", ciascuna una
   griglia di riquadri (tile). Ogni tile ha un tipo e un ingombro in unità di
   griglia — largo (orizzontale) o alto (verticale) a piacere. Tutto è
   personalizzabile e salvato nella config. */

export type TileType =
	| "header"
	| "habits"
	| "todos"
	| "folders"
	| "history"
	| "habit"
	| "stats";

export interface Tile {
	id: string;
	type: TileType;
	/** larghezza in colonne (1..COLS) */
	w: number;
	/** altezza in righe (1..6) */
	h: number;
	/** per type "habit": l'id dell'abitudine mostrata */
	habitId?: string;
}

export interface TabLayout {
	id: string;
	name: string;
	tiles: Tile[];
}

export interface AppConfig {
	folder: string;
	lang: "it" | "en";
	accent: string;
	/** sincronizza l'accent col colore di Obsidian (appearance.json) */
	syncAccent: boolean;
	opacity: number;
	pinned: boolean;
	autostart: boolean;
	notifications: boolean;
	tabs: TabLayout[];
}

/** Colonne della griglia del widget. */
export const COLS = 4;
export const MAX_H = 6;

export function uid(): string {
	return Math.random().toString(36).slice(2, 9);
}

export const TILE_META: Record<TileType, { it: string; en: string; icon: string }> = {
	header: { it: "Intestazione", en: "Header", icon: "◷" },
	habits: { it: "Abitudini", en: "Habits", icon: "✓" },
	todos: { it: "Attività (per data)", en: "Tasks (by date)", icon: "☰" },
	folders: { it: "Attività (a cartelle)", en: "Tasks (folders)", icon: "🗂" },
	history: { it: "Cronologia", en: "History", icon: "▦" },
	habit: { it: "Abitudine singola", en: "Single habit", icon: "◆" },
	stats: { it: "Riepilogo", en: "Summary", icon: "∑" },
};

export function newTile(type: TileType): Tile {
	const sizes: Partial<Record<TileType, { w: number; h: number }>> = {
		header: { w: COLS, h: 1 },
		habits: { w: 2, h: 3 },
		todos: { w: 2, h: 3 },
		folders: { w: 2, h: 4 },
		history: { w: 2, h: 3 },
		habit: { w: 2, h: 3 },
		stats: { w: COLS, h: 1 },
	};
	const s = sizes[type] ?? { w: 2, h: 2 };
	return { id: uid(), type, w: s.w, h: s.h };
}

export function defaultTabs(): TabLayout[] {
	// Dashboard come il plugin Obsidian: data in alto, attività a sinistra (alta),
	// abitudini in alto a destra e cronologia sotto. Niente riquadro statistiche.
	return [
		{
			id: uid(),
			name: "Today",
			tiles: [
				{ id: uid(), type: "todos", w: 2, h: 6 },
				{ id: uid(), type: "habits", w: 2, h: 6 },
			],
		},
		{
			id: uid(),
			name: "Habits",
			tiles: [{ id: uid(), type: "habits", w: COLS, h: 6 }],
		},
		{
			id: uid(),
			name: "Tasks",
			tiles: [{ id: uid(), type: "folders", w: COLS, h: 6 }],
		},
	];
}
