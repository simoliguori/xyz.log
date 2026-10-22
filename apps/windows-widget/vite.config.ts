import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

// Vite serve il frontend del widget. Il core condiviso è importato dai sorgenti
// TS tramite alias, così non serve un passo di build separato del pacchetto.
export default defineConfig({
	root: ".",
	clearScreen: false,
	resolve: {
		alias: {
			"@todo-habits/core": fileURLToPath(
				new URL("../../packages/core/src/index.ts", import.meta.url)
			),
		},
	},
	server: {
		port: 5177,
		strictPort: true,
	},
	build: {
		target: "es2021",
		outDir: "dist",
		emptyOutDir: true,
	},
});
