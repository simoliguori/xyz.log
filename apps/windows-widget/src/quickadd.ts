// TickTick-style quick add: parse a natural-language task line into text + due
// date + time + priority, AND report the matched spans so the UI can highlight
// them. Bilingual (EN/IT). Self-contained (no imports) so it can be unit-tested
// with `node --experimental-strip-types`.

export type PrioKey = "highest" | "high" | "medium" | "low" | "lowest";
export type SpanKind = "date" | "time" | "priority";

export interface Span {
	start: number;
	end: number; // exclusive
	kind: SpanKind;
}

export interface QuickResult {
	text: string;
	due: string | null; // YYYY-MM-DD
	time: string | null; // HH:mm
	priority: PrioKey | null;
	spans: Span[]; // ranges in the ORIGINAL string
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => {
	const x = new Date(d);
	x.setDate(x.getDate() + n);
	return x;
};

// EN + IT full weekday names only (short forms collide with ordinary words)
const WEEKDAYS: Record<string, number> = {
	sunday: 0, domenica: 0,
	monday: 1, lunedi: 1, "lunedì": 1,
	tuesday: 2, martedi: 2, "martedì": 2,
	wednesday: 3, mercoledi: 3, "mercoledì": 3,
	thursday: 4, giovedi: 4, "giovedì": 4,
	friday: 5, venerdi: 5, "venerdì": 5,
	saturday: 6, sabato: 6,
};
const MONTHS: Record<string, number> = {
	january: 1, jan: 1, gennaio: 1, gen: 1,
	february: 2, feb: 2, febbraio: 2,
	march: 3, marzo: 3,
	april: 4, apr: 4, aprile: 4,
	may: 5, maggio: 5, mag: 5,
	june: 6, jun: 6, giugno: 6, giu: 6,
	july: 7, jul: 7, luglio: 7, lug: 7,
	august: 8, aug: 8, agosto: 8, ago: 8,
	september: 9, sep: 9, sept: 9, settembre: 9, set: 9,
	october: 10, oct: 10, ottobre: 10, ott: 10,
	november: 11, nov: 11, novembre: 11,
	december: 12, dec: 12, dicembre: 12, dic: 12,
};
const PRIO_WORDS: Record<string, PrioKey> = {
	highest: "highest", massima: "highest", urgent: "highest", urgente: "highest",
	high: "high", alta: "high",
	medium: "medium", media: "medium", med: "medium",
	low: "low", bassa: "low",
	lowest: "lowest", minima: "lowest",
};

const wkKeys = Object.keys(WEEKDAYS).join("|");
const moKeys = Object.keys(MONTHS).join("|");
const prKeys = Object.keys(PRIO_WORDS).join("|");

const to24 = (h: number, ap?: string) => {
	if (!ap) return h;
	const pm = /p/i.test(ap);
	if (pm && h < 12) return h + 12;
	if (!pm && h === 12) return 0;
	return h;
};
const nextWeekday = (base: Date, target: number, forceNext: boolean) => {
	let delta = (target - base.getDay() + 7) % 7;
	if (delta === 0 && forceNext) delta = 7;
	return addDays(base, delta);
};

interface State {
	due: string | null;
	time: string | null;
	priority: PrioKey | null;
	today: Date;
	eveningIfNoTime: boolean;
}

// Each matcher: a token regex (anchored to word edges, no leading space) + an
// apply fn. `slot` guards single-value fields (only the first date/time wins).
interface Matcher {
	kind: SpanKind;
	slot?: "date" | "time";
	re: RegExp;
	apply: (m: RegExpMatchArray, st: State) => boolean; // false = don't consume
}

const MATCHERS: Matcher[] = [
	// priority
	{
		kind: "priority",
		re: /(?<=^|\s)(!{1,3})(?=\s|$)/,
		apply: (m, st) => {
			st.priority = m[1].length >= 3 ? "highest" : m[1].length === 2 ? "high" : "medium";
			return true;
		},
	},
	{
		kind: "priority",
		re: new RegExp(`(?<=^|\\s)!(${prKeys})(?=\\s|$)`, "i"),
		apply: (m, st) => {
			st.priority = PRIO_WORDS[m[1].toLowerCase()];
			return true;
		},
	},
	// time
	{
		kind: "time", slot: "time",
		re: /(?<=^|\s)(?:at|alle(?: ore)?|ore|h)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?(?=\s|$)/i,
		apply: (m, st) => {
			const h = to24(parseInt(m[1], 10), m[3]);
			const mm = m[2] ? parseInt(m[2], 10) : 0;
			if (h > 23 || mm > 59) return false;
			st.time = `${pad(h)}:${pad(mm)}`;
			return true;
		},
	},
	{
		kind: "time", slot: "time",
		re: /(?<=^|\s)(\d{1,2}):(\d{2})\s*(am|pm)?(?=\s|$)/i,
		apply: (m, st) => {
			const h = to24(parseInt(m[1], 10), m[3]);
			const mm = parseInt(m[2], 10);
			if (h > 23 || mm > 59) return false;
			st.time = `${pad(h)}:${pad(mm)}`;
			return true;
		},
	},
	{
		kind: "time", slot: "time",
		re: /(?<=^|\s)(\d{1,2})\s*(am|pm)(?=\s|$)/i,
		apply: (m, st) => {
			const h = to24(parseInt(m[1], 10), m[2]);
			if (h > 23) return false;
			st.time = `${pad(h)}:00`;
			return true;
		},
	},
	// relative dates
	{ kind: "date", slot: "date", re: /(?<=^|\s)(today|oggi)(?=\s|$)/i, apply: (_m, st) => ((st.due = isoOf(st.today)), true) },
	{ kind: "date", slot: "date", re: /(?<=^|\s)(tomorrow|domani)(?=\s|$)/i, apply: (_m, st) => ((st.due = isoOf(addDays(st.today, 1))), true) },
	{
		kind: "date", slot: "date",
		re: /(?<=^|\s)(tonight|stasera|stanotte)(?=\s|$)/i,
		apply: (_m, st) => {
			st.due = isoOf(st.today);
			st.eveningIfNoTime = true;
			return true;
		},
	},
	{
		kind: "date", slot: "date",
		re: /(?<=^|\s)(?:in|tra|fra)\s+(\d{1,3})\s*(days?|giorni|weeks?|settimane?|settimana)(?=\s|$)/i,
		apply: (m, st) => {
			const n = parseInt(m[1], 10);
			const weeks = /week|settiman/i.test(m[2]);
			st.due = isoOf(addDays(st.today, weeks ? n * 7 : n));
			return true;
		},
	},
	{ kind: "date", slot: "date", re: /(?<=^|\s)(next week|prossima settimana)(?=\s|$)/i, apply: (_m, st) => ((st.due = isoOf(addDays(st.today, 7))), true) },
	{
		kind: "date", slot: "date",
		re: new RegExp(`(?<=^|\\s)(?:next|prossimo|prossima)\\s+(${wkKeys})(?=\\s|$)`, "i"),
		apply: (m, st) => ((st.due = isoOf(nextWeekday(st.today, WEEKDAYS[m[1].toLowerCase()], true))), true),
	},
	{
		kind: "date", slot: "date",
		re: new RegExp(`(?<=^|\\s)(${wkKeys})(?=\\s|$)`, "i"),
		apply: (m, st) => ((st.due = isoOf(nextWeekday(st.today, WEEKDAYS[m[1].toLowerCase()], false))), true),
	},
	// explicit dates
	{
		kind: "date", slot: "date",
		re: /(?<=^|\s)(\d{4})-(\d{1,2})-(\d{1,2})(?=\s|$)/,
		apply: (m, st) => {
			const mo = +m[2], d = +m[3];
			if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
			st.due = `${m[1]}-${pad(mo)}-${pad(d)}`;
			return true;
		},
	},
	{
		kind: "date", slot: "date",
		re: /(?<=^|\s)(\d{1,2})[/.](\d{1,2})(?:[/.](\d{2,4}))?(?=\s|$)/,
		apply: (m, st) => {
			const d = +m[1], mo = +m[2];
			let y = m[3] ? +m[3] : st.today.getFullYear();
			if (y < 100) y += 2000;
			if (d < 1 || d > 31 || mo < 1 || mo > 12) return false;
			st.due = `${y}-${pad(mo)}-${pad(d)}`;
			return true;
		},
	},
	{
		kind: "date", slot: "date",
		re: new RegExp(`(?<=^|\\s)(\\d{1,2})\\s+(${moKeys})(?=\\s|$)`, "i"),
		apply: (m, st) => {
			const d = +m[1];
			if (d < 1 || d > 31) return false;
			st.due = `${st.today.getFullYear()}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(d)}`;
			return true;
		},
	},
	{
		kind: "date", slot: "date",
		re: new RegExp(`(?<=^|\\s)(${moKeys})\\s+(\\d{1,2})(?=\\s|$)`, "i"),
		apply: (m, st) => {
			const d = +m[2];
			if (d < 1 || d > 31) return false;
			st.due = `${st.today.getFullYear()}-${pad(MONTHS[m[1].toLowerCase()])}-${pad(d)}`;
			return true;
		},
	},
];

function overlaps(spans: Span[], start: number, end: number): boolean {
	return spans.some((s) => start < s.end && end > s.start);
}

export function analyze(raw: string, today: Date = new Date()): QuickResult {
	const st: State = { due: null, time: null, priority: null, today, eveningIfNoTime: false };
	const spans: Span[] = [];
	for (const mat of MATCHERS) {
		if (mat.slot === "date" && st.due) continue;
		if (mat.slot === "time" && st.time) continue;
		const m = raw.match(mat.re);
		if (!m || m.index == null) continue;
		const start = m.index;
		const end = start + m[0].length;
		if (overlaps(spans, start, end)) continue;
		if (mat.apply(m, st)) spans.push({ start, end, kind: mat.kind });
	}
	if (!st.time && st.eveningIfNoTime) st.time = "20:00";
	spans.sort((a, b) => a.start - b.start);
	// text = original minus the consumed spans, collapsed
	let text = "";
	let i = 0;
	for (const s of spans) {
		text += raw.slice(i, s.start);
		i = s.end;
	}
	text += raw.slice(i);
	text = text.replace(/\s{2,}/g, " ").trim();
	return { text, due: st.due, time: st.time, priority: st.priority, spans };
}

/** Parse only (no spans). */
export function quickParse(raw: string, today: Date = new Date()) {
	const { text, due, time, priority } = analyze(raw, today);
	return { text, due, time, priority };
}
