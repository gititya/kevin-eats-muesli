# kevin-eats-muesli

STT compression A/B experiment. Tests whether compressing a Muesli dictation transcript before sending it to a coding agent preserves output quality while cutting net tokens.

## What's built
- `ab.py` — two-command CLI (compress + record), three arms: raw / semantic / caveman
- `runs.jsonl` — JSONL log, one entry per task per arm, tracks cache_read/cache_write/cost
- `requirements.txt` — tiktoken, requests
- Full spec: `stt-compression-ab-spec.md`
- Muesli CLI not installed — use `--transcript` or read from Muesli SQLite DB at `~/Library/Application Support/Muesli/muesli.db`

## Idea 1 results (01-todo)
- All 3 arms passed completeness (add/check-off/restore/persist/no-auth/minimal UI)
- Raw: $0.178, 86.5k total context, 235 lines — bare-bones black/gray, closest to kora spirit
- Semantic: $0.232, 130.7k total context, 296 lines — blue accents, more polished, not kora
- Caveman: $0.228, 183.3k total context, 320 lines — dark warm, read kora spec file, kora-adjacent
- Surprise: compressed prompts cost MORE (agent wrote more code, read more context)

## Current phase
Pass 1 — Sonnet. Idea 1 (01-todo) complete across all 3 arms. Moving to idea 2 (02-fd-calc).

## How to resume
1. Check `runs.jsonl` to see which ideas are done (filter by `coding_model` + `arm`)
2. Make sure Ollama is running (`ollama serve`) — compressor model is `qwen2.5:7b`
3. Pick the next idea below and dictate it naturally in Muesli

## The 5 ideas (Pass 1: all on Sonnet)
| # | ID | Idea | Must-survive constraints | Repeats |
|---|---|---|---|---|
| 1 | 01-todo | Todo app — add/check-off, persists on reopen, no login, minimal/clean | persistence, no-auth, aesthetic | 1× |
| 2 | 02-fd-calc | Fixed deposit calculator — amount+rate+years, compound interest, maturity amount AND interest earned separately | compounding not simple, both outputs, three inputs | 1× |
| 3 | 03-gravity | Gravity sim — balls bounce in box, lose energy per bounce, click to add, slider for gravity | damping, wall collisions, click-to-add, slider | 1× |
| 4 | 04-habit | Habit tracker — daily check-offs, streak counter, ONE grace day, GitHub-style heatmap | grace-day rule, streak logic, heatmap | 2–3× |
| 5 | 05-predprey | Predator-prey sim — rabbits breed, foxes eat/starve, sliders, population graph, pause/resume | all rules, starvation, sliders, graph, pause | 2–3× |

Pass 2 (only if Pass 1 promising): repeat ideas 4 and 5 on Opus and GPT-5.5.

## Per-idea workflow
```bash
# 1. Speak the idea naturally in Muesli (ramble, hedge, self-correct — do not read a clean sentence)
# 2. Compress + preview (shows raw vs semantic vs caveman side by side)
python ab.py compress --task-id <ID> --difficulty <N> --coding-model sonnet --transcript "..."

# 3. Build each arm in a fresh empty dir, one shot, no follow-ups
#    ~/tmp/<ID>-raw/  ~/tmp/<ID>-semantic/  ~/tmp/<ID>-caveman/

# 4. Record results (get token counts from /cost in each session)
python ab.py record --task-id <ID> --arm raw --coding-model sonnet --token-source anthropic \
  --input-tokens N --output-tokens N --cache-read N --cache-write N \
  --cost 0.XX --ran true --completeness-pass true --completeness-note ""
# repeat for --arm semantic and --arm caveman
```

Judge completeness **blind** — don't tell the judge which build came from the compressed prompt.

## Decision rule (after all 5 ideas on Sonnet)
- **Keep it** — zero completeness failures AND total tokens meaningfully lower
- **Use selectively** — clean on simple ideas, dropped constraint on harder ones
- **Drop it** — trivial savings OR constraint loss even on simple ideas
