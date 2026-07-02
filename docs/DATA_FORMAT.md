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
    emoji: "🧘"
  - id: lettura
    name: Lettura
    emoji: "📖"
---

# Abitudini

Il corpo del file è libero: appunti, motivazioni, ecc.
```

Regole:
- `id`: slug univoco, solo `a-z0-9-`, usato nel log. **Non cambiarlo** dopo aver iniziato a tracciare (o la cronologia si sgancia).
- `name`: nome mostrato nelle UI.
- `emoji`: opzionale.
- L'ordine nel frontmatter è l'ordine di visualizzazione.

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
