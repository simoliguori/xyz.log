/** Mini helper DOM: crea un elemento con classi, testo, attributi e figli. */
export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	opts: {
		cls?: string;
		text?: string;
		attr?: Record<string, string>;
		html?: string;
	} = {},
	children: (Node | null)[] = []
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (opts.cls) node.className = opts.cls;
	if (opts.text !== undefined) node.textContent = opts.text;
	if (opts.html !== undefined) node.innerHTML = opts.html;
	if (opts.attr) for (const [k, v] of Object.entries(opts.attr)) node.setAttribute(k, v);
	for (const c of children) if (c) node.appendChild(c);
	return node;
}

export function clear(node: HTMLElement): void {
	while (node.firstChild) node.removeChild(node.firstChild);
}

/** Testo con link markdown [t](url), URL nudi e #tag resi cliccabili. */
export function renderRich(host: HTMLElement, text: string): void {
	const re = /\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s)]+)|(#[\w/-]+)/g;
	let last = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text)) !== null) {
		if (m.index > last) host.appendChild(document.createTextNode(text.slice(last, m.index)));
		if (m[1] !== undefined) {
			host.appendChild(el("a", { cls: "xl-link", text: m[1], attr: { href: m[2], target: "_blank", rel: "noopener" } }));
		} else if (m[3] !== undefined) {
			host.appendChild(el("a", { cls: "xl-link", text: m[3], attr: { href: m[3], target: "_blank", rel: "noopener" } }));
		} else if (m[4] !== undefined) {
			host.appendChild(el("span", { cls: "xl-tag", text: m[4] }));
		}
		last = m.index + m[0].length;
	}
	if (last < text.length) host.appendChild(document.createTextNode(text.slice(last)));
}
