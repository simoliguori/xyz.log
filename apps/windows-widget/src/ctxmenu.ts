// A right-click context menu: a popup over a dimmed backdrop, with optional
// flyout submenus. Opening animates in with the shared bézier (see styles.css).

import { el } from "./dom";

export interface MenuItem {
	label: string;
	/** small leading glyph (emoji or short text) */
	icon?: string;
	/** CSS color for the icon (e.g. a per-priority accent) */
	iconColor?: string;
	danger?: boolean;
	disabled?: boolean;
	/** a flyout submenu */
	children?: MenuItem[];
	onClick?: () => void;
}

/** `null` renders a divider line. */
export type MenuEntry = MenuItem | null;

let overlay: HTMLElement | null = null;

export function closeContextMenu(): void {
	if (overlay) {
		overlay.remove();
		overlay = null;
		window.removeEventListener("keydown", onKey);
	}
}

function onKey(e: KeyboardEvent): void {
	if (e.key === "Escape") closeContextMenu();
}

function position(menu: HTMLElement, x: number, y: number): void {
	const pad = 6;
	const r = menu.getBoundingClientRect();
	let left = x;
	let top = y;
	if (left + r.width + pad > window.innerWidth) left = Math.max(pad, window.innerWidth - r.width - pad);
	if (top + r.height + pad > window.innerHeight) top = Math.max(pad, window.innerHeight - r.height - pad);
	menu.style.left = `${left}px`;
	menu.style.top = `${top}px`;
}

function buildMenu(items: MenuEntry[], depth: number): HTMLElement {
	const menu = el("div", { cls: `xl-ctx-menu ${depth > 0 ? "is-sub" : ""}`.trim() });
	let openFlyout: HTMLElement | null = null;

	for (const item of items) {
		if (item === null) {
			menu.appendChild(el("div", { cls: "xl-ctx-sep" }));
			continue;
		}
		const row = el("button", {
			cls: `xl-ctx-item ${item.danger ? "is-danger" : ""} ${item.disabled ? "is-disabled" : ""} ${item.children ? "has-sub" : ""}`.trim(),
			attr: { type: "button" },
		});
		if (item.icon) {
			const ic = el("span", { cls: "xl-ctx-icon", text: item.icon });
			if (item.iconColor) ic.style.color = item.iconColor;
			row.appendChild(ic);
		}
		row.appendChild(el("span", { cls: "xl-ctx-label", text: item.label }));
		if (item.children) row.appendChild(el("span", { cls: "xl-ctx-arrow", text: "▸" }));

		if (item.disabled) {
			menu.appendChild(row);
			continue;
		}

		if (item.children) {
			const showFlyout = () => {
				if (openFlyout) openFlyout.remove();
				const fly = buildMenu(item.children!, depth + 1);
				menu.appendChild(fly);
				const rr = row.getBoundingClientRect();
				const fr = fly.getBoundingClientRect();
				let fx = rr.right + 2;
				if (fx + fr.width + 6 > window.innerWidth) fx = rr.left - fr.width - 2;
				fly.style.left = `${fx - menu.getBoundingClientRect().left}px`;
				fly.style.top = `${rr.top - menu.getBoundingClientRect().top}px`;
				openFlyout = fly;
			};
			row.onmouseenter = showFlyout;
			row.onclick = showFlyout;
		} else {
			row.onclick = () => {
				closeContextMenu();
				item.onClick?.();
			};
		}
		menu.appendChild(row);
	}
	return menu;
}

/** Open a context menu at the given viewport coordinates. */
export function openContextMenu(x: number, y: number, items: MenuEntry[]): void {
	closeContextMenu();
	overlay = el("div", { cls: "xl-ctx-overlay" });
	const menu = buildMenu(items, 0);
	overlay.appendChild(menu);
	document.body.appendChild(overlay);
	position(menu, x, y);
	overlay.addEventListener("mousedown", (e) => {
		if (e.target === overlay) closeContextMenu();
	});
	overlay.addEventListener("contextmenu", (e) => {
		e.preventDefault();
		closeContextMenu();
	});
	window.addEventListener("keydown", onKey);
}
