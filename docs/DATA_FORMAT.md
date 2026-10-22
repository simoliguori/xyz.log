# Shared data format

All data lives in **three markdown files** inside a vault folder (default: `Tracker/`).
Both the Obsidian plugin and the other clients read and write these files; a synced folder
(Obsidian Sync or otherwise) keeps PC and phone aligned. No database: markdown is the only
source of truth.

## 1. `Habits.md` — habit definitions

Habits are defined in the YAML frontmatter:

```markdown
---
habits:
  - id: meditation
    name: Meditation
    icon: lucide-flower
  - id: reading
    name: Reading
    emoji: "📖"
    cadence: 2
  - id: english
    name: English course
    start: 2026-09-01
    duration: 90
categories:
  - icon: lucide-flower
    name: Wellbeing
---

# Habits

The body is free text (notes, motivations, …).
```

Rules:
- `id`: unique slug, `a-z0-9-` only, used in the log. **Don't change it** after you start
  tracking (history would detach). Created from the name when you add a habit from the UI.
- `name`: display name.
- `emoji`: optional.
- `icon`: optional [lucide](https://lucide.dev) icon name (e.g. `lucide-book`) or an
  Iconize icon. If present it **wins over the emoji**. Habits sharing the same icon are
  grouped into a **category**.
- `cadence`: integer ≥ 1 (default `1`). How often the habit must be done for the streak to
  continue (e.g. `2` = every other day).
- `goal`: integer ≥ 1 (default `1`). Completions needed in a day for it to count as done.
- `countable`: `true`/`false` (default `false`). Habits logged multiple times a day.
- `start` + `duration`: fixed-term habits. `start` is an ISO date, `duration` is days
  (`0` = open-ended).
- Frontmatter order is the display order.

### `categories:` (optional)

A parallel list giving a **name** to a group of habits that share an icon:

- `icon`: the shared icon.
- `name`: label shown above the group (editable by clicking it in the UI).

## 2. `Habit Log.md` — history

One line per completion, strict format:

```markdown
# Habit history

- [x] 2026-07-01 meditation
- [x] 2026-07-01 reading
- [x] 2026-07-02 meditation
```

Rules:
- Line format: `- [x] YYYY-MM-DD <habit-id>`.
- Checking a habit = adding the line; unchecking = removing it. Countable habits add one
  line per completion (so a day with `goal: 2` done twice has two lines).
- Lines that don't match the format are ignored (free notes are fine).
- Streaks and heatmaps are **derived** from these lines, never stored.

## 3. `Todo.md` — tasks (with sub-folders and descriptions)

Tasks use the **Tasks** plugin emoji syntax, organized into sub-folders via headings, with
optional descriptions.

```markdown
# Todo

## Inbox

- [ ] Buy the gift 📅 2026-07-05 ⏫
- [ ] Call the dentist 🔼

## ideas

### live visual

- [ ] lidar video idea
	description on indented lines
	with an [embedded link](https://example.com)

## shopping

- [x] Pay the bill 📅 2026-07-01 ✅ 2026-07-01
```

Structure:
- `## List` → **first-level sub-folder** (e.g. `Inbox`, `ideas`).
- `### Section` → **second-level sub-folder** inside the current list.
- `- [ ]` / `- [x]` → a task.
- **Indented, non-task lines** right under a task → its **description** (joined). It may
  contain markdown links `[text](url)` and bare URLs, which are rendered clickable.

Task fields (all optional, any order after the text):

| Field | Syntax | Notes |
|---|---|---|
| Due date | `📅 YYYY-MM-DD` | |
| Priority | `🔺` highest, `⏫` high, `🔼` medium, `🔽` low, `⏬` lowest | absent = normal |
| Done | `✅ YYYY-MM-DD` | added automatically when checked |
| Tag | `#tag` | shown inline |

Rules:
- Completing = `- [ ]` → `- [x]` + ` ✅ <today>` appended.
- New tasks are appended at the end of the file.
- Non-task lines (headings, descriptions) are preserved as-is.
- The `todos` block groups by due date; the `folders` block groups by list → section.

## Concurrency and sync

- Both clients write with **minimal line-based edits** (add/remove/replace a single line)
  to reduce Obsidian Sync conflicts.
- Independent line-based formats make merges almost always painless.

> Keep parsing logic in sync across all parsers (TypeScript in the Obsidian plugin, Kotlin
> in the Android scaffold) and in this spec. The Android parser still needs updating for
> `icon`/`cadence`/`goal`/`countable`/`start`/`duration`, categories, and the Todo
> sub-folders/descriptions.
