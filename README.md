# kevin-eats-muesli

**Does compressing a voice dictation transcript before sending it to a coding agent preserve output quality while cutting tokens?**

An A/B experiment testing STT (speech-to-text) prompt compression for AI coding agents. Voice dictations from [Muesli](https://muesli.ai) are compressed locally via `qwen2.5:7b` (Ollama) into two formats, then each variant is fed one-shot to Claude Sonnet to build a working app. Completeness, code quality, and cost are compared across three arms.

## The three arms

| Arm | What it is | Compression |
|-----|-----------|-------------|
| **Raw** | Unmodified Muesli transcript — filler, false starts, repetition, all of it | None (0%) |
| **Semantic** | qwen2.5:7b rewrites into clean 1-3 sentence instructions | ~75% token reduction |
| **Caveman** | qwen2.5:7b compresses into terse arrow-notation fragments | ~80% token reduction |

### Semantic system prompt

> You receive a raw speech-to-text transcript from a developer dictating an instruction to an AI coding agent. Rewrite it as a concise, precise instruction that preserves: (1) the specific target — file, function, symbol, or component; (2) the action verb; (3) all explicit and implicit constraints, including negatives ("don't touch X"); (4) uncertainty — if the speaker was unsure, preserve the ambiguity explicitly rather than resolving it. Strip: filler, false starts, repetition, preamble, politeness, and narrated reasoning that isn't a constraint. Output one to three sentences. Never resolve an ambiguity — surface it.

### Caveman reference

Inspired by [mattpocock/skills/caveman](https://github.com/mattpocock/skills/blob/main/skills/productivity/caveman/SKILL.md). Rules: drop articles/filler/pleasantries, use fragments and arrows (`X -> Y`), abbreviate common terms (`DB/auth/config/UI`), keep technical terms exact, preserve all constraints especially negatives. Pattern: `[thing] [action] [reason]. [next step].`

## The 5 experiments

Each idea was dictated naturally in Muesli (rambling, self-correcting, hedging), compressed into all three arms, then built one-shot by Claude Sonnet 4.6 in a fresh empty directory with no follow-up prompts.

| # | Idea | Complexity | What it tested | Key constraint |
|---|------|-----------|----------------|----------------|
| 1 | **Todo app** | Simple | Basic UI + persistence | No login, minimal aesthetic, strikethrough + completed section |
| 2 | **Fixed deposit tracker** | Medium | Multi-row table with dual calculation modes | Enter return amount → calc rate, OR enter rate → calc return |
| 3 | **Gravity simulator** | Medium-visual | Physics simulation with interactive controls | Damping (energy loss per bounce), gravity slider, click-to-add balls |
| 4 | **Habit tracker** | Complex-logic | Custom grace-day streak rule | Miss a habit but do others → streak survives IF all done next day |
| 5 | **Predator-prey sim** | Complex-everything | Lotka-Volterra dynamics, live graphing | Rabbits breed, foxes eat/starve, population graph, pause/resume |

## Build outputs

All builds are single HTML files (or small multi-file apps) that run directly in a browser with no server.

| Idea | Raw | Semantic | Caveman |
|------|-----|----------|---------|
| 01 — Todo | [raw](builds/01-todo-raw.html) | [semantic](builds/01-todo-semantic.html) | [caveman](builds/01-todo-caveman.html) |
| 02 — FD Calc | [raw](builds/02-fd-calc-raw.html) | [semantic](builds/02-fd-calc-semantic.html) | [caveman](builds/02-fd-calc-caveman.html) |
| 03 — Gravity | [raw](builds/03-gravity-raw.html) | [semantic](builds/03-gravity-semantic.html) | [caveman](builds/03-gravity-caveman.html) |
| 04 — Habit | [raw](builds/04-habit-raw/) | [semantic](builds/04-habit-semantic/) | [caveman](builds/04-habit-caveman.html) |
| 05 — Pred-Prey | [raw](builds/05-predprey-raw.html) | [semantic](builds/05-predprey-semantic.html) | [caveman](builds/05-predprey-caveman.html) |

## Results

### Cost

| Arm | Total (5 ideas) | Avg / idea | Instruction tokens (avg) |
|-----|------:|------:|------:|
| Raw | **$2.33** | $0.47 | 237 |
| Semantic | $1.25 | $0.25 | 58 |
| Caveman | **$1.04** | $0.21 | 49 |

Compression cut instruction tokens 75-80%, but instruction tokens are ~0.1% of total context (100k-300k cache + output). On the 3 simple ideas, compressed arms often cost **more** than raw because the agent filled ambiguity by reading more files and writing more code.

### Code quality (1-5, scored by Claude Opus)

| Arm | Avg quality | Range | Security issues |
|-----|---:|---|---|
| Raw | **4.4** | 4-5 | 0 |
| Semantic | 4.0 | 3-5 | 0 |
| Caveman | 2.8 | 1-4 | 1 (XSS in 02-fd-calc) |

### Completeness (did all constraints survive?)

| Arm | Pass rate | Failures |
|-----|---:|---|
| Raw | **5/5** (100%) | None |
| Semantic | 4/5 (80%) | 04-habit: grace-day rule loosened |
| Caveman | 3/5 (60%) | 03-gravity: UX-dead (no Start button), 04-habit: grace rule absent |

### Constraint preservation detail

| Idea | Raw | Semantic | Caveman |
|------|-----|----------|---------|
| 01 Todo | All survived | All survived | All survived |
| 02 FD Calc | All survived | All survived | All survived, but XSS vulnerability |
| 03 Gravity | All survived | All survived | Every feature present but **no Start affordance** — user rated 0/5 |
| 04 Habit | Grace rule correct (strict) | Grace rule **loosened** (any-habit-forgives vs all-required) | Grace rule **entirely absent** |
| 05 Pred-Prey | All survived | Fox starvation dropped from prompt but **recovered from Lotka-Volterra model name** | All survived |

### Per-idea cost and quality breakdown

| Idea | | Raw | Semantic | Caveman |
|------|--|-----|----------|---------|
| 01 Todo | Cost | $0.18 | $0.23 | $0.23 |
| | Quality | 4 | 4 | 4 |
| 02 FD Calc | Cost | $0.21 | $0.24 | $0.21 |
| | Quality | 4 | **5** | 2 |
| 03 Gravity | Cost | $0.24 | $0.18 | $0.17 |
| | Quality | 4 | 3 | 1 |
| 04 Habit | Cost | **$1.04** | $0.38 | $0.24 |
| | Quality | **5** | 4 | 3 |
| 05 Pred-Prey | Cost | $0.66 | $0.21 | $0.19 |
| | Quality | **5** | 4 | 4 |

## Key findings

### 1. Shorter prompts can cost MORE

Instruction tokens are negligible against cache + output. On simple ideas, compressed arms cost ~28% more because the agent compensated for ambiguity by generating more code and reading more context files.

### 2. Cost-per-correct-constraint is the real metric

Caveman's habit tracker was 4x cheaper than raw — and shipped the wrong grace logic. The cheapest arm that violates the spec is the most expensive arm, because the error is silent.

### 3. Compression is safe when detail is recoverable from a named domain model

Semantic dropped "fox starves" from the predator-prey prompt, but Claude reconstructed it because "Lotka-Volterra" implies the death term. The custom grace-day rule had no canonical model to fall back on — it was lost.

### 4. Caveman drops framing, not just words

The gravity sim preserved every feature (damping, slider, add-balls, collisions) but had no Start button — it auto-ran with no affordance. Intent and tone are constraints too, and terse compression strips them first.

### 5. Silent constraint drift is the central risk

Semantic's habit tracker is a polished app that confidently implements the *wrong* grace rule. Without blind completeness testing, this would have shipped unnoticed. This makes semantic compression more hazardous than it appears — it fails prettily.

## Verdict

| Arm | Decision | When to use |
|-----|----------|-------------|
| **Raw** | Keep as default | Always safe. The verbosity that feels wasteful carries intent, framing, and bespoke constraints. |
| **Semantic** | Use selectively | Safe for simple tasks and standard-domain problems where a model name carries the constraints. **Never for custom business rules.** |
| **Caveman** | Drop | 2/5 failures, lowest quality, only security vuln, only 0/5 rating. Marginal savings over semantic don't justify the failure rate. |

## How to prompt from voice

1. **Ramble freely.** False starts and repetition are noise the model handles. Constraints buried in rambling survive; constraints stripped by compression don't.
2. **Name domain models explicitly.** Saying "Lotka-Volterra" or "GitHub-style heatmap" gives the agent a recovery path if your explanation is imperfect.
3. **If you compress, use semantic only**, and only for tasks where all constraints are trivial or anchored to a named model. Add a constraint-checklist verification pass.
4. **Never compress bespoke logic.** Any custom "if X then Y except when Z" will be silently simplified or dropped.
5. **Judge blind.** The only way to catch silent constraint drift is to evaluate output without knowing which arm produced it.

## Stack

- **STT:** Muesli (Parakeet v3)
- **Compressor:** qwen2.5:7b via Ollama (local, ~20s per compression)
- **Coding agent:** Claude Sonnet 4.6 via Claude Code
- **Quality reviewer:** Claude Opus (subagent)
- **Token counting:** tiktoken (cl100k_base)
- **Runner:** `ab.py` — CLI for compress + record workflow
- **Data:** `runs.jsonl` — all token counts, costs, scores, and notes
