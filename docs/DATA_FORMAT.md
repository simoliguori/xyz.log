# Formato dati condiviso

Tutti i dati vivono in **tre file markdown** dentro una cartella del vault (default: `Tracker/`).
Sia il plugin Obsidian che l'app Android leggono e scrivono questi file. Obsidian Sync li tiene
allineati tra PC e telefono. Nessun database: il markdown è l'unica fonte di verità.

## 1. `Habits.md` — definizione delle abitudini

Le abitudini sono definite nel frontmatter YAML:

```markdown
---
habits:
  - id: meditazione
    name: Meditazione
    icon: lucide-flower
  - id: lettura
    name: Lettura
    emoji: "📖"
    cadence: 2
  - id: corso-inglese
    name: Corso di inglese
    start: 2026-09-01
    duration: 90
categories:
  - icon: lucide-flower
    name: Benessere
---

# Abitudini

Il corpo del file è libero: appunti, motivazioni, ecc.
```

Regole:
- `id`: slug univoco, solo `a-z0-9-`, usato nel log. **Non cambiarlo** dopo aver iniziato a tracciare (o la cronologia si sgancia). Quando crei un'abitudine dalla UI, l'id viene generato dal nome.
- `name`: nome mostrato nelle UI.
- `emoji`: opzionale.
- `icon`: opzionale, nome icona [lucide](https://lucide.dev) (es. `lucide-book`) o di Iconize se installato. Se presente **vince sull'emoji**. Le abitudini che condividono la stessa icona vengono raggruppate in una **categoria**.
- `cadence`: intero ≥ 1 (default `1`). Ogni quanti giorni l'abitudine deve risultare fatta perché lo streak continui (es. `2` = a giorni alterni).
- `goal`: intero ≥ 1 (default `1`). Quanti completamenti nello stesso giorno servono perché il giorno conti come fatto.
- `countable`: `true`/`false` (default `false`). Abitudini da contare più volte al giorno.
- `start` + `duration`: abitudini a termine. `start` è una data ISO, `duration` i giorni di durata (`0` = senza fine).
- L'ordine nel frontmatter è l'ordine di visualizzazione.

### `categories:` (opzionale)

Lista parallela che dà un **nome** a un gruppo di abitudini accomunate dall'icona:

- `icon`: l'icona condivisa dalle abitudini del gruppo.
- `name`: etichetta mostrata sopra il gruppo (rinominabile cliccandola nella UI).

> Nota: questi campi aggiuntivi sono letti dal plugin Obsidian. Il parser Android (`MarkdownParser.kt`) va ancora allineato a `icon`/`cadence`/`goal`/`countable`/`start`/`duration` e alle categorie.

## 2. `Habit Log.md` — cronologia

Una riga per ogni completamento, formato rigido:

```markdown
# Cronologia abitudini

- [x] 2026-07-01 meditazione
- [x] 2026-07-01 lettura
- [x] 2026-07-02 meditazione
```

Regole:
- Formato riga: `- [x] YYYY-MM-DD <habit-id>`.
- Spuntare un'abitudine = aggiungere la riga; togliere la spunta = rimuoverla.
- Le righe che non rispettano il formato vengono ignorate (puoi scrivere note libere nel file).
- Streak e heatmap sono **derivati** da queste righe, mai salvati.

## 3. `Todo.md` — attività

Sintassi **compatibile con il plugin Tasks** di Obsidian (formato emoji):

```markdown
# Todo

- [ ] Comprare il regalo 📅 2026-07-05 ⏫
- [ ] Chiamare il dentista 🔼
- [x] Pagare la bolletta 📅 2026-07-01 ✅ 2026-07-01
```

Campi (tutti opzionali, in qualunque ordine dopo il testo):

| Campo | Sintassi | Note |
|---|---|---|
| Scadenza | `📅 YYYY-MM-DD` | due date |
| Priorità | `🔺` massima, `⏫` alta, `🔼` media, `🔽` bassa, `⏬` minima | assente = normale |
| Completamento | `✅ YYYY-MM-DD` | aggiunto automaticamente quando spunti |
| Tag | `#tag` | liberi, mostrati come pill |

Regole:
- Completare = `- [ ]` → `- [x]` + ` ✅ <oggi>` in coda.
- Le nuove attività vengono aggiunte in fondo al file.
- Righe non-task (titoli, testo) vengono preservate intatte.

## Concorrenza e sync

- Entrambi i client scrivono con modifiche **line-based minime** (aggiunta/rimozione/sostituzione
  di una singola riga) per ridurre i conflitti di Obsidian Sync.
- In caso di conflitto vince la logica di merge di Obsidian Sync; i formati a righe indipendenti
  rendono i merge quasi sempre indolori.
