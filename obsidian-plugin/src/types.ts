export interface Habit {
	id: string;
	name: string;
	emoji: string;
	/** nome icona (lucide o Iconize), es. "lucide-book"; vince sull'emoji */
	icon: string;
	/** ogni quanti giorni l'abitudine "conta" per lo streak (1 = ogni giorno) */
	cadence: number;
	/** data ISO di inizio (opzionale), usata con duration per le abitudini a termine */
	start: string;
	/** durata in giorni (0 = senza fine) */
	duration: number;
	/** se true l'abitudine si conta più volte al giorno */
	countable: boolean;
	/** completamenti al giorno necessari perché il giorno sia "fatto" */
	goal: number;
}

export interface Category {
	/** nome icona condivisa dalle abitudini del gruppo */
	icon: string;
	/** nome visualizzato della categoria */
	name: string;
}

/** habitId -> (data ISO YYYY-MM-DD -> numero di completamenti in quel giorno) */
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
