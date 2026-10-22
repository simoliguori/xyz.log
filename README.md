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

- **`obsidian-plugin/`** — Obsidian plugin (desktop + mobile): a dedicated view and
  composable ` ```todo-habits ` blocks you can drop in any note. **Implemented.**
- **widget Windows** — an always-on desktop gadget (Tauri). **Planned** — see the PLAN.
- **`android-widget/`** — Kotlin/Glance home-screen widgets. **Early scaffold, not
  functional yet** (code only; never built/shipped).

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

## Structure

```
docs/DATA_FORMAT.md     shared markdown format spec
docs/PLAN.md            architecture, roadmap, open-source plan
design/tokens.json      shared palette and fonts
obsidian-plugin/        TypeScript plugin (pure parser/renderer in src/)
android-widget/         Kotlin scaffold (mirror parser) — not functional yet
```

## License

MIT — see [LICENSE](LICENSE).
