export interface Habit {
	id: string;
	name: string;
	emoji: string;
}

/** habitId -> insieme di date ISO (YYYY-MM-DD) completate */
export type HabitLog = Map<string, Set<string>>;

export enum Priority {
	Highest = 0,
	High = 1,
	Medium = 2,
	None = 3,
	Low = 4,
	Lowest = 5,
}

export interface Todo {
	/** riga originale completa, usata per identificare la task al toggle */
	raw: string;
	lineNo: number;
	done: boolean;
	/** testo senza i campi emoji (i #tag restano inline) */
	text: string;
	due: string | null;
	doneDate: string | null;
	priority: Priority;
	tags: string[];
}
