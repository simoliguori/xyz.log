// Nerd Font glyphs (FontAwesome range), rendered via the bundled Symbols Nerd
// Font Mono — so UI icons are consistent and never fall back to Windows emoji.

import { Priority } from "@xyzlog/core";

export const NF = {
	edit: "", // pencil
	check: "", // check
	undo: "", // rotate-left
	flag: "", // flag
	trash: "", // trash
	cog: "", // cog
	history: "", // history
	calendar: "", // calendar
	play: "", // play
	plus: "", // plus
	minus: "", // minus
	exclaim: "", // exclamation — the "priority" affordance
	sort: "", // sort-amount-asc
	grip: "", // grip-lines (drag handle)
} as const;

/** Per-priority accent color (CSS custom properties defined in styles.css). */
export const PRIO_VAR: Record<Priority, string> = {
	[Priority.Highest]: "var(--xl-prio-highest)",
	[Priority.High]: "var(--xl-prio-high)",
	[Priority.Medium]: "var(--xl-prio-medium)",
	[Priority.Low]: "var(--xl-prio-low)",
	[Priority.Lowest]: "var(--xl-prio-lowest)",
	[Priority.None]: "var(--xl-muted)",
};

/** A graded ladder of chevrons so the priority reads at a glance. */
export const PRIO_GLYPH: Record<Priority, string> = {
	[Priority.Highest]: "", // angle-double-up
	[Priority.High]: "", // angle-up
	[Priority.Medium]: "", // minus
	[Priority.Low]: "", // angle-down
	[Priority.Lowest]: "", // angle-double-down
	[Priority.None]: "", // no glyph: just the word
};

export const PRIO_NAME: Record<Priority, { it: string; en: string }> = {
	[Priority.Highest]: { it: "Massima", en: "Highest" },
	[Priority.High]: { it: "Alta", en: "High" },
	[Priority.Medium]: { it: "Media", en: "Medium" },
	[Priority.Low]: { it: "Bassa", en: "Low" },
	[Priority.Lowest]: { it: "Minima", en: "Lowest" },
	[Priority.None]: { it: "Nessuna", en: "None" },
};

/** Order for the priority dropdown: no-priority first (the default), then high→low. */
export const PRIO_ORDER: Priority[] = [
	Priority.None,
	Priority.Highest,
	Priority.High,
	Priority.Medium,
	Priority.Low,
	Priority.Lowest,
];

export function prioLabel(p: Priority, lang: "it" | "en"): string {
	const name = lang === "it" ? PRIO_NAME[p].it : PRIO_NAME[p].en;
	const g = PRIO_GLYPH[p];
	return g ? `${g}  ${name}` : name;
}

/** Choices shown in the priority picker. "Medium" keeps its icon but behaves as
    no priority (value None); there is no separate "None" entry. */
export interface PrioChoice {
	value: Priority;
	glyph: string;
	color: string;
	it: string;
	en: string;
}
export const PRIO_PICK: PrioChoice[] = [
	{ value: Priority.Highest, glyph: PRIO_GLYPH[Priority.Highest], color: PRIO_VAR[Priority.Highest], it: "Massima", en: "Highest" },
	{ value: Priority.High, glyph: PRIO_GLYPH[Priority.High], color: PRIO_VAR[Priority.High], it: "Alta", en: "High" },
	{ value: Priority.None, glyph: PRIO_GLYPH[Priority.Medium], color: PRIO_VAR[Priority.None], it: "Media", en: "Medium" },
	{ value: Priority.Low, glyph: PRIO_GLYPH[Priority.Low], color: PRIO_VAR[Priority.Low], it: "Bassa", en: "Low" },
	{ value: Priority.Lowest, glyph: PRIO_GLYPH[Priority.Lowest], color: PRIO_VAR[Priority.Lowest], it: "Minima", en: "Lowest" },
];

/** Icon on the add-row priority button — a numbered "list-ol" (1·2·3) reads as
    "priority/ranking" and stays distinct from the sort control; it's grey until a
    level is chosen (colour comes from the selection). */
export const PRIO_BTN_GLYPH = "";
