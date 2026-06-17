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

## Idea 2 results (02-fd-calc)
- All 3 arms passed completeness (dual modes, multi-row, columns, persistence)
- Raw: $0.211, 90.3k context, 241 lines — full-width inline edit, quarterly compounding, score 4
- Semantic: $0.244, 119.8k context, 532 lines — best UI (summary cards, form), annual compounding, score 5
- Caveman: $0.207, 116.4k context, 236 lines — cheapest but XSS vuln on bank name, score 2

## Idea 3 results (03-gravity)
- Caveman FAILED completeness (UX-dead: auto-runs with no Start affordance, user rated 0/5)
- Raw: $0.239, 474 lines — best physics (dt-scaled, gravity-coupled damping, rest detection), score 4
- Semantic: $0.181, 212 lines — user's favorite experience, 24% cheaper than raw, score 3
- Caveman: $0.173, 226 lines — cheapest but undiscoverable, technically works but UX zero, score 1
- Key finding: caveman preserves feature list but drops framing/intent cues → UX failure mode

## Idea 4 results (04-habit) — INFLECTION POINT
- Grace-day rule: Raw=correct, Semantic=loosened, Caveman=absent
- Compression error surfaces as silent constraint drift — model ships wrong-but-consistent behavior
- Raw: $1.04 (!), 956 lines, score 5 — only arm with correct grace logic
- Semantic: $0.378, 625 lines, score 4 — grace loosened per compressed prompt
- Caveman: $0.239, 544 lines, score 3 — grace entirely absent
- Key finding: cost-per-correct-constraint, not cost-per-line, is the real metric
- Semantic is the "dangerous sweet spot" — cheap, attractive, quietly wrong on hard logic

## Idea 5 results (05-predprey)
- All 3 arms fully complete — fox starvation survived even in semantic (reconstructed from LV model name)
- Raw: $0.66, 369 lines, score 5 — agent-based sim with spatial world, "wins by huge margin" per user
- Semantic: $0.212, 407 lines, score 4 — classic LV+Euler, variability from numerical drift
- Caveman: $0.195, 296 lines, score 4 — LV+RK4 (best math), but uniform graph = less visually engaging
- Key finding: compression safe when omitted detail is recoverable from a named domain model

## Current phase
Pass 1 — Sonnet. All 5 ideas complete. Final analysis done.

## Pass 1 Verdict
- **Semantic → USE SELECTIVELY.** Safe for simple/standard-domain; unsafe for custom bespoke logic.
- **Caveman → DROP IT.** 2/5 failures, avg quality 2.8, only XSS, only 0/5 UX rating.
- Instruction token savings (75-80%) do NOT reliably lower total cost — cache + output dominate.
- The central risk is silent constraint drift: polished apps that confidently implement wrong logic.

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
