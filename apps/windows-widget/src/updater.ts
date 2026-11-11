// Self-update: on startup, ask GitHub if there's a newer release and, with the
// user's OK, download + install it and relaunch. All imports are dynamic so the
// browser preview (which has no Tauri runtime) never pulls them in.

/** Check for an update once; prompt, install and relaunch if the user agrees. */
export async function checkForUpdate(): Promise<void> {
	try {
		const { check } = await import("@tauri-apps/plugin-updater");
		const update = await check();
		if (!update) return;

		let go = true;
		try {
			const { ask } = await import("@tauri-apps/plugin-dialog");
			go = await ask(
				`xyz.log ${update.version} is available (you have ${update.currentVersion}).\n\nDownload and install it now? The app will restart.`,
				{ title: "Update xyz.log", kind: "info", okLabel: "Update", cancelLabel: "Later" }
			);
		} catch {
			// no dialog available — go ahead silently
		}
		if (!go) return;

		await update.downloadAndInstall();

		const { relaunch } = await import("@tauri-apps/plugin-process");
		await relaunch();
	} catch (err) {
		// never let an update hiccup break app start; just log it
		console.error("update check failed", err);
	}
}
