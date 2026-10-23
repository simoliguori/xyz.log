/* Suono di completamento: un piccolo "ding" morbido a due note (Web Audio,
   nessun file esterno). Condiviso nello stile col plugin Obsidian. */

let ctx: AudioContext | null = null;

export function playComplete(): void {
	try {
		const Ctx =
			(window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!Ctx) return;
		if (!ctx) ctx = new Ctx();
		if (ctx.state === "suspended") void ctx.resume();
		const now = ctx.currentTime;

		const master = ctx.createGain();
		master.connect(ctx.destination);
		master.gain.setValueAtTime(0.0001, now);
		master.gain.exponentialRampToValueAtTime(0.09, now + 0.015);
		master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);

		// due note in quinta (A5 → E6), morbide e con una piccola coda
		const notes: [number, number][] = [
			[880, 0],
			[1318.51, 0.08],
		];
		for (const [freq, t] of notes) {
			const o = ctx.createOscillator();
			const g = ctx.createGain();
			o.type = "sine";
			o.frequency.setValueAtTime(freq, now + t);
			o.connect(g);
			g.connect(master);
			g.gain.setValueAtTime(0.0001, now + t);
			g.gain.exponentialRampToValueAtTime(0.9, now + t + 0.02);
			g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.42);
			o.start(now + t);
			o.stop(now + t + 0.45);
		}
	} catch {
		/* audio non disponibile: ignora */
	}
}
