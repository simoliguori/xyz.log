# Piano del progetto — *xyz.log* (nome provvisorio)

> Habit & todo tracker **markdown-first**, multi-client, con un widget desktop sempre
> attivo. Obiettivo: sostituire TickTick con un sistema aperto dove **i dati sono tuoi**
> (file markdown nel vault), sincronizzati ovunque.

![Architettura](images/architettura.svg)

## Principio guida: modularità

La modularità è **il focus principale** del progetto. Ogni funzione (abitudini, todo,
cronologia, singola abitudine, …) è un **modulo indipendente** che si compone liberamente:
nel plugin come blocco ` ```todo-habits ` con opzioni, nel widget come scheda. Lo stesso
vale per il codice (`packages/core` riusato da tutti i client) e per il repo: feature
isolate, combinabili, testabili da sole. La "homepage" è solo **una composizione di
moduli**, non un pezzo monolitico.

![Mockup widget desktop](images/widget-mockup.svg)

## 1. Idea in una riga

Tre file markdown nel vault sono l'**unica fonte di verità**; ogni client (plugin
Obsidian, widget Android, widget Windows) li legge e scrive. Niente database, niente
server, nessun lock-in. La sync (Obsidian Sync o qualsiasi cartella sincronizzata) tiene
tutto allineato tra PC e telefono.

## 2. Stato attuale (già implementato)

**Plugin Obsidian** (`obsidian-plugin/`, TypeScript):
- vista dedicata + blocco ` ```todo-habits ` incorporabile nelle note (opzioni `habits`,
  `todos`, `header`, `habit:<id>`, **`croce`**);
- abitudini con icone (lucide/Iconize), **categorie** per icona, **streak** a cadenza,
  **heatmap stile GitHub**, abitudini **contabili** (goal N volte/giorno);
- todo compatibili col plugin **Tasks** (date `📅`, priorità, completamento `✅`, tag);
- aggiunta/rinomina/eliminazione abitudini dalla UI; picker icone a griglia;
- layout **dashboard** componibile: todo a sinistra (alto, scrollabile), abitudini in alto
  a destra e cronologia di un'abitudine **selezionabile** in basso a destra; a larghezza
  piena;
- comando palette «Inserisci blocco»; UI compatta.

**Widget Android** (`android-widget/`, Kotlin + Glance): due widget home (abitudini e
todo), parser markdown speculare, accent color personalizzabile.

**Formato condiviso**: `docs/DATA_FORMAT.md`. **Import da TickTick** (CSV → `Todo.md`,
abitudini → `Habits.md` + `Habit Log.md`) già sperimentato.

**Font**: rimosso il font proprietario (NType82); ora **Space Grotesk** (OFL) per i
titoli — niente asset non ridistribuibili nel CSS.

## 3. Architettura di riferimento

```
            ┌─────────────────────────────────────────────┐
            │   Vault / cartella sincronizzata (markdown)  │
            │   Habits.md   ·   Habit Log.md   ·   Todo.md │
            └──────────────┬───────────────┬──────────────┘
                           │               │
        ┌──────────────────┼───────────────┼──────────────────┐
        │                  │               │                  │
  Plugin Obsidian     Widget Android   Widget Windows     (futuri client)
  (TS, già fatto)     (Kotlin)         (da costruire)
```

**Core condiviso** — oggi il parser/renderer esiste solo lato Obsidian. Passo chiave:
estrarre `parser` + `types` + `renderer` + `styles` in un pacchetto **`packages/core`**
(TypeScript, zero dipendenze da Obsidian) riusato da:
- plugin Obsidian (già TS),
- **widget Windows** (webview),
- eventuale versione web/PWA.

Struttura monorepo proposta (pnpm workspaces):

```
packages/core/          parser, tipi, renderer, stili (TS puro)
apps/obsidian-plugin/   adapter Obsidian sopra core
apps/windows-widget/    Tauri (Rust + webview) sopra core
android-widget/         Kotlin (parser speculare)
docs/                   formato, piano, immagini
```

## 4. Widget desktop Windows

Requisiti dell'utente:
- **parte allo startup**;
- **resta in background sul desktop**, come un gadget;
- **non appare nella taskbar**;
- **resta visibile anche con “mostra desktop” / tutte le finestre minimizzate**;
- abitudini (e funzioni) in **schede separate**, stile widget TickTick ma più completo.

### 4.1 Scelta tecnologica

| Opzione | Riuso codice | Footprint | Desktop-pinning | Verdetto |
|---|---|---|---|---|
| **Tauri** (Rust + webview) | alto (riusa il renderer TS nella webview) | ~5–10 MB, RAM bassa | via Win32 in Rust | **consigliata** |
| Electron | altissimo | ~100 MB, RAM alta | via modulo nativo | ok ma pesante per un “sempre acceso” |
| .NET WPF/WinUI | nullo (riscrittura XAML) | basso | nativo, il più semplice | solo se si rinuncia al riuso |

**Consigliata: Tauri.** Un processo leggero, sempre attivo, che mostra la stessa UI del
plugin (stesso `core`), con le parti “di sistema” scritte in Rust.

### 4.2 Comportamento “gadget da desktop” (Windows)

- **Niente taskbar**: finestra con `skip_taskbar` + stile `WS_EX_TOOLWINDOW`.
- **Senza bordi**: `decorations: false`, trasparenza opzionale.
- **Ancorata al desktop / sopravvive a “mostra desktop”**: si fa “figlia” del layer del
  wallpaper (`Progman` → si forza la creazione di `WorkerW`, poi `SetParent` della nostra
  finestra a `WorkerW`). È la tecnica dei wallpaper/gadget: la finestra vive dietro le
  icone del desktop e non viene minimizzata dal “mostra desktop”.
  - Variante più semplice (fase 1): finestra `always_on_bottom`, non minimizzabile, senza
    taskbar — buona al 90%, ma un “mostra desktop” può comunque nasconderla. Il pinning a
    `WorkerW` è la soluzione robusta (fase 4).
- **Avvio automatico**: `tauri-plugin-autostart` (scrive la chiave Run del registro).
- **Tray**: icona nella system tray per mostra/nascondi, impostazioni, uscita.
- **Schede**: una tab bar compatta (Abitudini · Todo · Oggi) che riusa i render già
  esistenti; il layout “croce” è già un buon punto di partenza.

### 4.3 Accesso ai file

- l'utente sceglie la cartella del tracker (es. `vault/allegati/tracker`);
- **watch** dei tre file (debounce) → re-render al cambiamento (anche da Obsidian/Sync);
- scritture **line-based minime** (come il plugin) per ridurre i conflitti di sync.

## 5. Notifiche / reminder

Requisito: reminder **opzionali** a orari della giornata, impostati **insieme** all'habit
o all'evento quando metti la data; gli habit sono **giornalieri**, quindi alla creazione
si chiede se vuoi un reminder (e a che ora/e).

**Modello dati (nel markdown, così sincronizza ovunque):**
- **Abitudini** — campo opzionale nel frontmatter per habit:
  ```yaml
  - id: minoxidil
    name: minoxidil
    goal: 2
    reminders: ["09:00", "21:00"]   # una notifica per orario, ogni giorno
  ```
- **Todo/eventi** — orario opzionale accanto alla data. Due opzioni di sintassi:
  - `⏰ HH:mm` accanto al `📅 YYYY-MM-DD` (riconoscibile, poco invasivo), oppure
  - `📅 YYYY-MM-DD HH:mm` (data+ora unite).
  Scelta consigliata: `📅 data` + `⏰ ora` separati, per restare compatibili col parsing
  attuale.

**Chi fa scattare le notifiche:** il client **sempre attivo**.
- **Widget Windows**: notifiche toast native (`tauri-plugin-notification`) con uno
  scheduler che legge gli orari dal markdown e pianifica gli avvisi del giorno.
- **Android**: `AlarmManager` + notifiche.
- Plugin Obsidian: può avvisare quando è aperto, ma non è affidabile per i reminder
  pianificati (Obsidian non è sempre in esecuzione) → i notificatori “veri” sono il widget
  Windows e Android.

**UX:** quando aggiungi una data a un todo → campo orario reminder opzionale. Quando crei
un habit → “Vuoi un promemoria?” con uno o più orari (es. 2/giorno per minoxidil).

## 6. Open source

- **Licenza**: MIT (massima adozione) o GPL-3.0 (copyleft). Da decidere.
- **Font**: risolto per il plugin (Space Grotesk/OFL). Resta da ripulire l'asset NType82
  lato Android prima della pubblicazione (già `gitignored`).
- **CI**: GitHub Actions per buildare plugin + widget e pubblicare le release.
- **Contribuzione**: `CONTRIBUTING.md`, issue template, `DATA_FORMAT.md` come contratto
  tra i parser (va tenuto allineato in TS e Kotlin).
- **Repo**: ancora **non creata** su GitHub. Si crea quando il nome è deciso.

## 7. Roadmap a fasi

- **Fase 0 — fatto**: formato markdown condiviso, plugin Obsidian completo, widget
  Android, import TickTick, rimozione font proprietario.
- **Fase 1 — fondamenta OSS**: rebrand al nome scelto; estrai `packages/core`; licenza;
  README con immagini; crea la repo GitHub.
- **Fase 2 — widget Windows MVP (Tauri)**: finestra senza bordi/taskbar, schede
  Abitudini/Todo/Oggi in sola lettura dai file.
- **Fase 3 — interattività**: spunta abitudini, aggiungi/completa todo scrivendo nel
  markdown; watch bidirezionale.
- **Fase 4 — gadget**: pinning a `WorkerW`, autostart, tray, trasparenza.
- **Fase 5 — notifiche**: reminder opzionali (habit giornalieri + eventi con orario),
  scheduler + toast.
- **Fase 6 — release**: CI, pacchetti, documentazione, v1.0 open source.

## 8. Decisioni aperte

1. **Nome** (in discussione): `xyz.log` vs alternative — vedi nota nel thread.
2. **Licenza**: MIT o GPL-3.0?
3. **Repo GitHub**: pubblica subito o privata finché non è pronta?
4. **Idee TickTick** (59 appunti): nota di riferimento separata o import come todo?
