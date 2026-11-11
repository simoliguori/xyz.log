/* Notification sounds, synthesized with Web Audio (no external files, so the
   project stays redistributable — same approach as sfx.ts). Each is short and
   distinct; the user picks one in settings and previews it. */

export interface NotifSound {
	id: string;
	/** display label (English; "None" is localized in the UI) */
	label: string;
}

export const NOTIF_SOUNDS: NotifSound[] = [
	{ id: "chime", label: "Chime" },
	{ id: "ding", label: "Ding" },
	{ id: "marimba", label: "Marimba" },
	{ id: "bell", label: "Bell" },
	{ id: "blip", label: "Blip" },
	{ id: "pop", label: "Pop" },
	{ id: "none", label: "None" },
];

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
	try {
		const Ctx =
			(window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctx) return null;
		if (!ctx) ctx = new Ctx();
		if (ctx.state === "suspended") void ctx.resume();
		return ctx;
	} catch {
		return null;
	}
}

/** One shaped oscillator note. */
function note(
	ac: AudioContext,
	master: GainNode,
	freq: number,
	start: number,
	dur: number,
	type: OscillatorType,
	peak = 0.9
): void {
	const o = ac.createOscillator();
	const g = ac.createGain();
	o.type = type;
	o.frequency.setValueAtTime(freq, start);
	o.connect(g);
	g.connect(master);
	g.gain.setValueAtTime(0.0001, start);
	g.gain.exponentialRampToValueAtTime(peak, start + 0.015);
	g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
	o.start(start);
	o.stop(start + dur + 0.02);
}

/** Play the notification sound with the given id. "none" (or unknown) is silent. */
export function playNotifSound(id: string): void {
	if (!id || id === "none") return;
	const ac = audio();
	if (!ac) return;
	const now = ac.currentTime;
	const master = ac.createGain();
	master.connect(ac.destination);
	master.gain.setValueAtTime(0.0001, now);
	master.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
	master.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

	switch (id) {
		case "ding":
			note(ac, master, 1174.66, now, 0.6, "sine");
			break;
		case "marimba":
			note(ac, master, 659.25, now, 0.22, "triangle");
			note(ac, master, 880, now + 0.1, 0.22, "triangle");
			note(ac, master, 1046.5, now + 0.2, 0.3, "triangle");
			break;
		case "bell":
			note(ac, master, 830.6, now, 0.9, "sine", 0.8);
			note(ac, master, 1661.2, now, 0.7, "sine", 0.3);
			note(ac, master, 2489, now, 0.5, "sine", 0.12);
			break;
		case "blip":
			note(ac, master, 1200, now, 0.08, "square", 0.5);
			note(ac, master, 1800, now + 0.07, 0.1, "square", 0.4);
			break;
		case "pop":
			note(ac, master, 440, now, 0.12, "sine");
			note(ac, master, 660, now + 0.04, 0.14, "sine");
			break;
		case "chime":
		default:
			note(ac, master, 880, now, 0.45, "sine");
			note(ac, master, 1318.51, now + 0.08, 0.5, "sine");
			break;
	}
}
