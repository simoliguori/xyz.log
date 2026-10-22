# xyzlog

> Habit tracker e todo **markdown-first**, **modulare**, multi-client.
> **Piano del progetto** — architettura, widget desktop Windows, notifiche, open source:
> [docs/PLAN.md](docs/PLAN.md). Focus principale: **modularità** — ogni funzione è un
> modulo componibile, la "homepage" è solo una composizione di moduli.

Habit tracker con cronologia e todo list con date e priorità, **markdown-first** e multi-client
con la stessa estetica:

- **`obsidian-plugin/`** — plugin per Obsidian (desktop e mobile) con vista dedicata e blocchi modulari
- **`android-widget/`** — app Android con due widget per la home screen (abitudini e todo)
- **widget Windows** — gadget desktop sempre attivo, in arrivo (vedi [PLAN](docs/PLAN.md))

I dati vivono in **tre file markdown nel vault** (default: cartella `Tracker/`), sincronizzati da
Obsidian Sync tra PC e telefono. Nessun database, nessun server: il markdown è l'unica fonte di
verità e i todo sono compatibili con il plugin community **Tasks**.

Formato dei file: [docs/DATA_FORMAT.md](docs/DATA_FORMAT.md) · Design token condivisi: [design/tokens.json](design/tokens.json)

## Estetica

Minimal dark (`#1e1e1e`), **Roboto Mono** per il testo e **Space Grotesk** (OFL, libero) per i
titoli.

Font: caricati da Google Fonts nel CSS del plugin — **niente font proprietari incorporati**, così
il progetto resta ridistribuibile come open source. I widget Glance Android non supportano font
custom → sans di sistema in grassetto.

Colore accent:

- **Obsidian**: segue l'accent del tema (*Impostazioni → Aspetto → Colore di evidenziazione*),
  con varianti chiara/soft derivate via `color-mix`.
- **Android**: default `#44437a`, personalizzabile dall'app (campo hex + anteprima) con bottone
  **Default** per ripristinarlo. Le varianti chiare/soft sono derivate automaticamente.

## Installazione — plugin Obsidian

1. Compila (già fatto se trovi `main.js`):
   ```
   cd obsidian-plugin
   npm install
   npm run build
   ```
2. Copia `main.js`, `manifest.json` e `styles.css` in
   `<vault>/.obsidian/plugins/todo-habits/`.
3. Abilita **Todo & Habits** in *Impostazioni → Plugin della community*.
4. Apri la vista dall'icona nella ribbon (o comando "Apri il tracker"). Al primo avvio crea
   `Tracker/Habits.md`, `Tracker/Habit Log.md` e `Tracker/Todo.md`.
5. Nelle impostazioni del plugin puoi cambiare la cartella dei dati e l'ampiezza della heatmap
   (clic su un'abitudine per espandere la cronologia).

Il plugin funziona anche su **Obsidian mobile** (`isDesktopOnly: false`).

### Tracker dentro una nota

Oltre alla vista dedicata puoi incorporare il tracker in qualsiasi nota con un code block:

````markdown
```todo-habits
```
````

Vuoto mostra abitudini + todo. Opzioni (una per riga):

| Opzione | Effetto |
|---|---|
| `habits` | solo la sezione abitudini |
| `todos` | solo la todo list |
| `habit: <id>` | una singola abitudine con la heatmap GitHub già espansa |
| `header` | aggiunge l'intestazione con la data di oggi |

Esempio per la nota giornaliera (o il suo template):

````markdown
```todo-habits
header
habits
```

```todo-habits
habit: meditazione
```
````

Il blocco è interattivo (spunte, aggiunta task) e si aggiorna da solo quando i file cambiano.

## Installazione — app/widget Android

Prerequisito importante: **il vault sul telefono deve stare in una cartella dello storage
condiviso** (es. `Documents/`), non nella cartella privata dell'app Obsidian, altrimenti il widget
non può leggerlo. Con Obsidian Sync basta creare/spostare il vault in una posizione visibile al
file manager.

1. Apri `android-widget/` in **Android Studio** (scarica da sé Gradle e SDK) e premi Run,
   oppure `./gradlew assembleDebug` e installa l'APK.
2. Apri l'app **Todo & Habits** → *Scegli la cartella del vault* → seleziona la radice del vault.
3. Verifica che la sottocartella dati coincida con quella del plugin (default `Tracker`).
4. Aggiungi i widget **Abitudini** e **Todo** alla home screen.

I widget si aggiornano quando li tocchi (↻), ogni ~30 minuti in automatico, e quando spunti
qualcosa. Le spunte scrivono direttamente i file markdown: alla prossima sincronizzazione le vedi
in Obsidian, e viceversa.

Comportamenti:

- ogni abitudine mostra i **pallini degli ultimi 7 giorni** (pieni = fatto);
- toccando il **nome** di un'abitudine (non la spunta) si apre l'app sulla sua **cronologia
  stile GitHub** (~52 settimane, con l'inizio di ogni mese segnato in alto) — nel plugin Obsidian
  la stessa cronologia si espande cliccando la riga dell'abitudine;
- dall'app puoi regolare l'**opacità dello sfondo** dei widget (0–100%, il testo resta opaco).
  Nota: gli angoli arrotondati dello sfondo richiedono Android 12+.

## Struttura

```
docs/DATA_FORMAT.md     specifica del formato markdown condiviso
design/tokens.json      palette e font condivisi
obsidian-plugin/        plugin TypeScript (parser in src/parser.ts)
android-widget/         app Kotlin + widget Glance (parser speculare in data/MarkdownParser.kt)
vault-sample/Tracker/   file di esempio per provare subito
```

Se modifichi la logica di parsing, tienila allineata in **entrambi** i parser e nella specifica.
