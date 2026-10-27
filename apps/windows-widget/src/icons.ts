import { icons } from "lucide";

/* Renders lucide icons (the ones used by the Obsidian plugin) as inline SVG, so
   habits show their icon in the widget too. */

type IconNode = [string, Record<string, string>][];

function pascal(name: string): string {
	return name.replace(/(^|-)([a-z0-9])/g, (_m, _s, c: string) => c.toUpperCase());
}

/** Elenco dei nomi icona lucide in kebab-case (es. "pill", "arrow-down"). */
let cachedNames: string[] | null = null;
export function lucideIconNames(): string[] {
	if (cachedNames) return cachedNames;
	const out: string[] = [];
	for (const key of Object.keys(icons)) {
		const kebab = key
			.replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
			.replace(/([a-z\d])([A-Z])/g, "$1-$2")
			.toLowerCase();
		if (pascal(kebab) === key) out.push(kebab);
	}
	out.sort();
	cachedNames = out;
	return out;
}

/** SVG lucide per un nome icona ("lucide-pill" o "pill"), o null se non esiste. */
export function lucideSvg(iconName: string, size = 14): string | null {
	const key = pascal(iconName.replace(/^lucide-/, ""));
	const node = (icons as Record<string, IconNode>)[key];
	if (!node) return null;
	const inner = node
		.map(([tag, attrs]) => {
			const a = Object.entries(attrs)
				.map(([k, v]) => `${k}="${v}"`)
				.join(" ");
			return `<${tag} ${a} />`;
		})
		.join("");
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}
