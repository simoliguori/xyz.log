import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

// Vite serves the widget frontend. The shared core is imported from its TS
// sources via an alias, so no separate package build step is needed.
export default defineConfig({
	root: ".",
	clearScreen: false,
	resolve: {
		alias: {
			"@xyzlog/core": fileURLToPath(
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
