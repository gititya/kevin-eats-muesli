# STT Compression A/B — Build Spec

**What this is:** A quick, controlled test of one question — does compressing a dictated
instruction before it reaches a coding agent preserve the output while cutting net tokens?

**Method in one line:** Dictate 5 product ideas in my own voice; feed the same raw transcript to
both arms (once raw, once compressed) and compare what each agent builds — one shot, no iteration.

**Scope discipline:** This is a personal go/no-go, not a publishable study. Build it fast, run it
for a few days, decide. The "Out of scope" section below is load-bearing — do not add those
things now.

---

## The two arms

- **Arm A (control):** raw Muesli transcript → coding agent, one shot, build to completion.
- **Arm B (treatment):** same raw transcript → local compressor (Qwen 2.5 7B via Ollama,
  compression prompt below) → compressed instruction → coding agent, one shot, build to completion.

Same voice input feeds both arms. No back-and-forth, no multi-turn. Multi-turn replay diverges
after turn 1 and breaks the comparison — each arm is a single prompt and whatever the agent
builds from it.

Each arm starts from its own fresh, empty working directory. The agent picks its own stack.
Judge each build for completeness against the spoken brief independently — not against the other
arm's code structure (two agents picking different stacks from the same brief will always diverge
structurally; that's noise, not signal).

---

## What stays constant on every idea (the spine)

Measured identically on all 5 ideas:

1. **Completeness vs spoken brief (binary + note).** Did the build include every feature and
   constraint from the brief, or were any dropped, mangled, or silently resolved differently?
   List each dropped/changed item. This is the primary signal and the whole reason the experiment
   exists.
2. **Did the build run at all (binary).** Basic smoke test — does it start without crashing?
3. **Total tokens to complete**, both arms — input + output + tool-call tokens. This is the real
   cost comparison. (Input-token savings alone are trivial and already known; the question is
   whether the *end-to-end* total actually drops.)

---

## Comparison (within the same model, per idea)

- **PRIMARY — completeness vs spoken brief:** did the compressed build drop or mangle any
  feature/constraint the raw build got right? List each dropped/changed item. Core signal.
- **Binary: did each build run/work at all.**
- **SECONDARY — code quality** (structure/readability): low weight. At one run per arm, most
  code-style differences are agent randomness, not compression.
- Token/cost numbers per the schema.

---

## The 5 ideas

Dictate each in your own words. The text below is a seed; the bracketed items are the constraints
that **must** survive compression — these are what you check in the completeness comparison.

| # | Idea | Must-survive constraints |
|---|---|---|
| 1 | Todo app — add/check-off, persists on reopen, no login, minimal/clean | persistence, no-auth, aesthetic |
| 2 | Fixed deposit calculator — amount+rate+years, compound interest, show maturity amount AND interest earned separately | compounding not simple, both outputs, three inputs |
| 3 | Gravity sim — balls bounce in a box under gravity, lose energy per bounce so they settle, click to add, slider for gravity | damping, wall collisions, click-to-add, slider |
| 4 | Habit tracker — daily check-offs, streak counter, one grace day so a single miss doesn't reset, GitHub-style heatmap | grace-day rule, streak logic, heatmap |
| 5 | Predator-prey sim — rabbits breed, foxes eat rabbits, foxes starve without food, sliders for rates, population graph over time, pause/resume | all rules, starvation, sliders, graph, pause |

Ideas 3, 4, and 5 deliberately carry more constraints — those stress the compressor. Ideas 1 and 2
are the floor.

---

## Coding model structure

Three coding agents in scope: **Sonnet**, **Opus**, **GPT-5.5**. Never mix models inside a single
comparison — a comparison is always raw-vs-compressed on the same model.

**Pass 1:** all 5 ideas × both arms on **Sonnet** → clean primary read.

**Pass 2** (only if Pass 1 is promising): repeat **only ideas 4 and 5** × both arms on **Opus**
and on **GPT-5.5**. That's where a smarter model's ability to rescue a lossy compressed prompt
shows up — the most informative place to compare models.

---

## Repeats

- **Ideas 1–3:** one run per arm.
- **Ideas 4–5:** 2–3 runs per arm, so a failure can be attributed to compression rather than
  stack/sampling luck.

---

## Token accounting

Measure tokens with each model's **own** usage report:
- Sonnet / Opus → Anthropic usage figures
- GPT-5.5 → OpenAI usage figures

Do **not** apply one tokenizer across all three. Do **not** compare an Anthropic-counted figure
against an OpenAI-counted one — they tokenize the same text differently, so only same-source
numbers are comparable.

Keep **instruction-token counts** (tiktoken, used only for the raw-vs-compressed ratio) clearly
separate from **total-session tokens** (from each agent's own report). Label every figure with
its source.

---

## Per-idea protocol

1. **Speak the instruction the messy way you actually would** — ramble, hedge, self-correct. Do
   not read a clean sentence; that makes the compressor's job artificially easy.
2. Save the raw transcript: `muesli-cli dictations get <latest_id>` → `rawTranscript`.
3. Run the raw transcript through the compressor → compressed text.
4. **Peek + safety step:** display raw + compressed side by side. Eyeball for silent constraint
   drops. This is your one-keystroke safety net and hides compression latency inside your read time.
5. **Arm A** — paste the raw transcript into the coding agent, fresh empty directory, one shot,
   build to completion.
6. **Arm B** — paste the compressed text into the same coding agent, separate fresh empty
   directory, one shot, build to completion.
7. Log everything (schema below).
8. **Blind completeness check:** when a model judges the two builds, don't indicate which came
   from the compressed prompt. Prefer objective checks (does feature X exist, does the math come
   out right, was the negative constraint honored) over subjective scores.

---

## Logging schema (one JSONL line per idea per arm per model run)

Lock this before you start — you cannot reconstruct it later.

```
{
  "task_id": "04-habit-tracker",
  "difficulty_rank": 4,
  "arm": "compressed",                 // "raw" | "compressed"
  "coding_model": "sonnet",            // "sonnet" | "opus" | "gpt-5.5"
  "spoken_raw_transcript": "...",
  "compressed_text": "...",            // null for raw arm
  "instruction_tokens": 142,           // tiktoken — raw-vs-compressed ratio only
  "token_source": "anthropic",         // "anthropic" | "openai" — source of total_tokens below
  "total_tokens": { "input": 0, "output": 0, "tool": 0 },
  "completed": true,
  "ran": true,                         // did the build start without crashing
  "completeness_pass": true,           // did the build include every feature/constraint from the brief
  "completeness_note": "",             // list any dropped or mangled items
  "compressor_latency_ms": 1340,       // compressed arm only
  "notes": ""
}
```

`output` tokens double as a quality tripwire: a bad compression often *raises* output tokens
(agent asks a clarifying question or flails after losing a constraint), so a savings that
evaporates in output is itself a signal.

---

## The compressor

- **Model:** Qwen 2.5 7B via Ollama. One model only.
- **Prompt (core directive: never resolve ambiguity — surface it):**

  > You receive a raw speech-to-text transcript from a developer dictating an instruction to an
  > AI coding agent. Rewrite it as a concise, precise instruction that preserves: (1) the specific
  > target — file, function, symbol, or component; (2) the action verb; (3) all explicit and
  > implicit constraints, including negatives ("don't touch X"); (4) uncertainty — if the speaker
  > was unsure, preserve the ambiguity explicitly rather than resolving it. Strip: filler, false
  > starts, repetition, preamble, politeness, and narrated reasoning that isn't a constraint.
  > Output one to three sentences. Never resolve an ambiguity — surface it.

- **Peek + safety step:** before sending the compressed version to the agent, display raw +
  compressed side by side. This is where you eyeball it, it's your one-keystroke safety net
  against a silent constraint drop, and it hides the compression latency inside your read time.

---

## Decision rule (deliberately simple — no pre-registration)

After Pass 1 (all 5 ideas on Sonnet):

- **Keep it / wire it in** if Arm B caused **zero completeness failures** *and* total tokens
  were meaningfully lower.
- **Use it selectively** if Arm B was clean on the simpler ideas but dropped a constraint
  on the harder ones — note where it broke and only compress below that complexity.
- **Drop it** if savings were trivial (output tokens dominated everything) *or* it dropped
  constraints even on simple ideas.

If Pass 1 is promising, run Pass 2 (ideas 4 and 5 on Opus and GPT-5.5) to see whether a
smarter model recovers from a lossy compressed prompt — or makes the savings larger.

---

## Explicitly out of scope (keep it simple — add only if you later decide to open-source)

- Oracle intent checklists
- A second LLM "verifier" pass (adds its own latency and token cost)
- Pre-registered statistical thresholds
- Segmented metrics / multi-run noise-floor statistics across the whole set
- Multi-model bake-off on the compressor (just Qwen 2.5 7B)
- Multi-user recruitment

---

## Honest limitations of this design

- **Coarse result.** 5 ideas at one run each (except 4 and 5) gives a go/no-go, not a precise
  breaking point. Enough to decide whether to wire it in.
- **Single run catches catastrophes, not subtleties.** One run per arm reliably surfaces dropped
  constraints; it will *not* detect small quality degradations. The 2–3 repeats on ideas 4 and 5
  help separate compression failures from stack/sampling luck, but this is still a small sample.
- **Empty-directory builds amplify agent variance.** Two agents starting from scratch will make
  different stack choices even from the same prompt. Structural divergence is expected and is not
  signal — only completeness against the brief matters.
- **Controlled ≠ real.** Speaking each instruction naturally is the only mitigation for making
  the compressor's job artificially easy.
