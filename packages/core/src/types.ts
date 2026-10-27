/* Data model shared across every client (Obsidian plugin, Windows widget,
   Android app). Pure TypeScript, no runtime dependencies. The Kotlin mirror
   lives in android-widget/.../data/. See docs/DATA_FORMAT.md. */

export interface Habit {
	id: string;
	name: string;
	emoji: string;
	/** icon name (lucide or Iconize), e.g. "lucide-book"; wins over the emoji */
	icon: string;
	/** how often the habit "counts" towards the streak (1 = every day) */
	cadence: number;
	/** ISO start date (optional), used with duration for fixed-term habits */
	start: string;
	/** duration in days (0 = open-ended) */
	duration: number;
	/** when true the habit can be logged several times a day */
	countable: boolean;
	/** completions per day needed for the day to count as "done" */
	goal: number;
	/** "HH:mm" daily reminder times (empty = no reminder) */
	reminders: string[];
}

export interface Category {
	/** icon shared by the habits in the group */
	icon: string;
	/** display name of the category */
	name: string;
}

/** habitId -> (ISO date YYYY-MM-DD -> number of completions that day) */
export type HabitLog = Map<string, Map<string, number>>;

export enum Priority {
	Highest = 0,
	High = 1,
	Medium = 2,
	None = 3,
	Low = 4,
	Lowest = 5,
}

export interface Todo {
	/** full original line, used to identify the task on toggle */
	raw: string;
	lineNo: number;
	done: boolean;
	/** text without the emoji fields (#tags stay inline) */
	text: string;
	due: string | null;
	/** event time "HH:mm" (⏰), kept separate from the date for compatibility */
	time: string | null;
	doneDate: string | null;
	priority: Priority;
	tags: string[];
	/** first-level sub-folder (heading `## List`), e.g. "Inbox", "ideas" */
	list?: string;
	/** second-level sub-folder (heading `### Section`) inside the list */
	section?: string;
	/** free description (indented lines under the task), may contain markdown links */
	description?: string;
}

/** The three files combined, ready for the view-model. */
export interface TrackerData {
	habits: Habit[];
	categories: Category[];
	log: HabitLog;
	todos: Todo[];
}
