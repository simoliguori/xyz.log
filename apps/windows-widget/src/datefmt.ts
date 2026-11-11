// Date format for the task date fields. The native <input type="date"> follows
// the OS locale (so on an Italian PC it always shows "gg/mm/aaaa" and eats a lot
// of width); here we use a compact text field whose format the user picks in
// settings, with a small calendar button that still opens the native picker.

import { el } from "./dom";
import { NF } from "./nf";

export type DateFormat = "dmy" | "mdy" | "iso";

export const DATE_FORMATS: DateFormat[] = ["dmy", "mdy", "iso"];

/** Placeholder / human label for a format, e.g. "dd/mm/yyyy". */
export function datePlaceholder(fmt: DateFormat): string {
	switch (fmt) {
		case "mdy":
			return "mm/dd/yyyy";
		case "iso":
			return "yyyy-mm-dd";
		default:
			return "dd/mm/yyyy";
	}
}

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO `yyyy-mm-dd` → display text in the chosen format. "" if iso is empty/invalid. */
export function formatIso(iso: string | null | undefined, fmt: DateFormat): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
	if (!m) return "";
	const [, y, mo, d] = m;
	if (fmt === "iso") return `${y}-${mo}-${d}`;
	if (fmt === "mdy") return `${mo}/${d}/${y}`;
	return `${d}/${mo}/${y}`;
}

/** Display text (lenient about separators / leading zeros) → ISO `yyyy-mm-dd`,
   or null if it isn't a valid date. */
export function parseDate(text: string, fmt: DateFormat): string | null {
	const parts = text.trim().split(/[^\d]+/).filter(Boolean).map(Number);
	if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return null;
	let y: number, mo: number, d: number;
	if (fmt === "iso") [y, mo, d] = parts;
	else if (fmt === "mdy") [mo, d, y] = parts;
	else [d, mo, y] = parts;
	if (y < 100) y += 2000;
	if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1000 || y > 9999) return null;
	// reject impossible days like 31/02
	const dt = new Date(y, mo - 1, d);
	if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
	return `${y}-${pad(mo)}-${pad(d)}`;
}

export interface DateField {
	root: HTMLElement;
	/** current value as ISO `yyyy-mm-dd`, or null when empty/invalid */
	getIso(): string | null;
	clear(): void;
}

/** A compact date field: a format-aware text input plus a calendar button that
   opens the native picker. `extraClass` lets callers tag it (add row vs modal). */
export function dateField(iso: string | null, fmt: DateFormat, extraClass = ""): DateField {
	const root = el("div", { cls: `xl-datefield ${extraClass}`.trim() });
	const text = el("input", {
		cls: "xl-df-text",
		attr: {
			type: "text",
			placeholder: datePlaceholder(fmt),
			inputmode: "numeric",
			value: iso ? formatIso(iso, fmt) : "",
			title: datePlaceholder(fmt),
		},
	}) as HTMLInputElement;
	// hidden-but-rendered native input, used only to pop the calendar
	const native = el("input", {
		cls: "xl-df-native",
		attr: { type: "date", tabindex: "-1", "aria-hidden": "true", value: iso ?? "" },
	}) as HTMLInputElement;
	const cal = el("button", { cls: "xl-df-cal", text: NF.calendar, attr: { type: "button", tabindex: "-1" } });

	const markBad = () => {
		const bad = text.value.trim() !== "" && parseDate(text.value, fmt) === null;
		text.classList.toggle("is-bad", bad);
	};
	text.oninput = markBad;
	cal.onclick = () => {
		const cur = parseDate(text.value, fmt);
		if (cur) native.value = cur;
		try {
			(native as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
		} catch {
			/* no-op: browser without showPicker */
		}
	};
	native.onchange = () => {
		text.value = native.value ? formatIso(native.value, fmt) : "";
		markBad();
	};

	root.append(text, native, cal);
	return {
		root,
		getIso: () => parseDate(text.value, fmt),
		clear: () => {
			text.value = "";
			native.value = "";
			text.classList.remove("is-bad");
		},
	};
}

const CLOCK_GLYPH = ""; // clock-o

/** A compact icon BUTTON (no visible text) that opens the native date picker; it
   tints when a date is set and shows the value as a tooltip. */
export function dateButton(iso: string | null, fmt: DateFormat): DateField {
	const root = el("div", { cls: "xl-pickbtn-wrap" });
	const native = el("input", {
		cls: "xl-df-native",
		attr: { type: "date", tabindex: "-1", "aria-hidden": "true", value: iso ?? "" },
	}) as HTMLInputElement;
	const btn = el("button", { cls: "xl-pickbtn", text: NF.calendar, attr: { type: "button" } });
	const paint = () => {
		const set = !!native.value;
		btn.classList.toggle("is-set", set);
		btn.title = set ? formatIso(native.value, fmt) : datePlaceholder(fmt);
	};
	btn.onclick = () => {
		try {
			(native as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
		} catch {
			/* no showPicker: ignore */
		}
	};
	native.onchange = paint;
	paint();
	root.append(native, btn);
	return {
		root,
		getIso: () => native.value || null,
		clear: () => {
			native.value = "";
			paint();
		},
	};
}

export interface TimeField {
	root: HTMLElement;
	getValue(): string;
	clear(): void;
}

/** A compact icon BUTTON (no visible text) that opens the native time picker. */
export function timeButton(value = ""): TimeField {
	const root = el("div", { cls: "xl-pickbtn-wrap" });
	const native = el("input", {
		cls: "xl-df-native",
		attr: { type: "time", tabindex: "-1", "aria-hidden": "true", value },
	}) as HTMLInputElement;
	const btn = el("button", { cls: "xl-pickbtn", text: CLOCK_GLYPH, attr: { type: "button" } });
	const paint = () => {
		const set = !!native.value;
		btn.classList.toggle("is-set", set);
		btn.title = set ? native.value : "--:--";
	};
	btn.onclick = () => {
		try {
			(native as HTMLInputElement & { showPicker?: () => void }).showPicker?.();
		} catch {
			/* no showPicker: ignore */
		}
	};
	native.onchange = paint;
	paint();
	root.append(native, btn);
	return {
		root,
		getValue: () => native.value,
		clear: () => {
			native.value = "";
			paint();
		},
	};
}
