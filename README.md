# xyz.log

> A **markdown-first**, **modular** habit tracker and to-do system, multi-client and
> local-first. Your data lives as plain markdown files in your vault — no database, no
> server, no lock-in. Compatible with the Obsidian **Tasks** plugin.
>
> **Project plan** (architecture, Windows desktop widget, notifications, open source):
> [docs/PLAN.md](docs/PLAN.md). Core focus: **modularity** — every function is a
> composable block; a "homepage" is just a composition of modules.

![Architecture](docs/images/architettura.svg)

![Desktop widget mockup](docs/images/widget-mockup.svg)

## Clients

- **`packages/core/`** — shared TypeScript logic (markdown parser, view-model, i18n,
  reminders) with unit tests. The canonical parsing/grouping lives here and is reused by
  the Windows widget. **Implemented.**
- **`obsidian-plugin/`** — Obsidian plugin (desktop + mobile): a dedicated view and
  composable ` ```todo-habits ` blocks you can drop in any note. Habits can be done
  **multiple times a day** (counter), there's a **mobile swipe** between habits and tasks,
  and per-habit settings (times/day, free count, cadence, reminders). **Implemented.**
- **`apps/windows-widget/`** — always-on desktop gadget (Tauri): a **modular, tile-based**
  dashboard (horizontal/vertical, resizable, draggable tiles across custom tabs), native
  **notifications**, autostart and desktop pinning. Frontend implemented and previewable in
  a browser; the Rust shell builds with the Rust toolchain. **Implemented.**
- **`android-widget/`** — Kotlin/Glance home-screen widgets **+** a **swipeable** app
  (habits ⇄ tasks), counter habits, and **AlarmManager notifications**. Parser at parity
  with the core. **Implemented** (needs the Android SDK/Gradle to build).

All clients read and write the **same three markdown files** in a vault folder
(default `Tracker/`), kept in sync by Obsidian Sync (or any synced folder):

- `Habits.md` — habit definitions (YAML frontmatter)
- `Habit Log.md` — history (`- [x] YYYY-MM-DD <id>`); streaks and heatmaps are derived
- `Todo.md` — tasks (Tasks-plugin emoji syntax), with **sub-folders** (`## list` /
  `### section`) and **descriptions** (indented lines, links supported)

File format: [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md) · Shared design tokens:
[design/tokens.json](design/tokens.json)

## Modular blocks

Drop a code block in any note and compose what you need (one option per line):

```todo-habits
header
habits
todos
```

| Option | Shows |
|---|---|
| `habits` | the habits section |
| `todos` | the to-do list, grouped by due date |
| `folders` (`cartelle`) | tasks grouped by **list → section**, with descriptions/links |
| `cross` (`croce`) | the dashboard: tasks left, habits + selectable history right |
| `habit: <id>` | a single habit with its GitHub-style heatmap |
| `header` | a heading with today's date |

Empty block = habits + todos. Each block is interactive and live-updates when the files
change.

## Language

The UI ships in **English** and can be switched to **Italian** in the plugin settings
(*Settings → xyz.log → Language*).

## Aesthetic

Minimal dark (`#1e1e1e`), **Roboto Mono** for text and **Space Grotesk** (OFL, free) for
headings — loaded from Google Fonts, no proprietary fonts embedded (so the project stays
redistributable).

Accent color follows the Obsidian theme accent (*Settings → Appearance → Accent color*),
with lighter/soft variants derived via `color-mix`.

## Build — Obsidian plugin

```
cd obsidian-plugin
npm install
npm run build
```

Copy `main.js`, `manifest.json` and `styles.css` into
`<vault>/.obsidian/plugins/xyzlog/`, then enable **xyz.log** in *Settings → Community
plugins*. Open it from the ribbon icon or the "Open xyz.log" command; on first run it
creates `Habits.md`, `Habit Log.md` and `Todo.md` in the data folder.

## Build — Windows widget (Tauri)

```
cd packages/core && npm install        # logica condivisa
cd ../../apps/windows-widget && npm install
npm run dev                             # anteprima del frontend su http://localhost:5177
npm run tauri dev                       # app nativa (richiede Rust: https://rustup.rs)
npm run tauri build                     # installer .exe (NSIS)
```

The frontend runs in any browser against sample data (mock backend); the native build
needs the **Rust toolchain**. Replace the placeholder icons with your own via
`npm run tauri icon src-tauri/icons/icon.svg`.

## Build — Android app

```
cd android-widget && ./gradlew assembleDebug   # richiede Android SDK + JDK 17
```

Grant notification permission on first run; reminders use exact alarms and survive reboot.

## Structure

```
docs/DATA_FORMAT.md     shared markdown format spec
docs/PLAN.md            architecture, roadmap, open-source plan
design/tokens.json      shared palette and fonts
packages/core/          shared TypeScript logic (parser, view-model, i18n) + tests
obsidian-plugin/        Obsidian plugin (own parser/renderer in src/)
apps/windows-widget/    Tauri desktop gadget (TS frontend + Rust shell)
android-widget/         Kotlin app + Glance widgets (mirror parser)
```

## License

MIT — see [LICENSE](LICENSE).
