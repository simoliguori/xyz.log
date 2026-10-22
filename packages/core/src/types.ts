/* Modello dati condiviso tra tutti i client (plugin Obsidian, widget Windows,
   app Android). È TypeScript puro, senza dipendenze di runtime. Lo specchio
   Kotlin vive in android-widget/.../data/. Vedi docs/DATA_FORMAT.md. */

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
	/** orari "HH:mm" dei promemoria giornalieri (vuoto = nessun promemoria) */
	reminders: string[];
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
	/** orario "HH:mm" dell'evento (⏰), separato dalla data per compatibilità */
	time: string | null;
	doneDate: string | null;
	priority: Priority;
	tags: string[];
	/** sottocartella di 1° livello (intestazione `## Lista`), es. "Inbox", "idee" */
	list?: string;
	/** sottocartella di 2° livello (intestazione `### Sezione`) dentro la lista */
	section?: string;
	/** descrizione libera (righe indentate sotto la task), può contenere link markdown */
	description?: string;
}

/** Dato aggregato dei tre file, pronto per il viewmodel. */
export interface TrackerData {
	habits: Habit[];
	categories: Category[];
	log: HabitLog;
	todos: Todo[];
}
