#!/usr/bin/env python3
"""STT Compression A/B experiment runner.

Commands:
  compress  Compress a transcript and write partial log entries (pre-agent run).
  record    Fill in arm results after the agent run completes.

Typical flow:
  # Before running the agent:
  python ab.py compress --task-id 01-todo --difficulty 1 --coding-model sonnet --from-muesli

  # After running each arm:
  python ab.py record --task-id 01-todo --arm raw --coding-model sonnet --token-source anthropic \\
    --input-tokens 5 --output-tokens 2900 --cache-read 67500 --cache-write 19000 \\
    --cost 0.178 --ran true --completeness-pass true --completeness-note ""
  python ab.py record --task-id 01-todo --arm semantic --coding-model sonnet --token-source anthropic \\
    --input-tokens 6 --output-tokens 3700 --cache-read 106800 --cache-write 23900 \\
    --cost 0.232 --ran true --completeness-pass true --completeness-note ""
"""

import argparse
import json
import os
import subprocess
import sys
import textwrap
import time

import requests

LOG_FILE = "runs.jsonl"
OLLAMA_URL = "http://localhost:11434/api/generate"
COMPRESSOR_MODEL = "qwen2.5:7b"
COMPRESSOR_PROMPTS = {
    "semantic": (
        "You receive a raw speech-to-text transcript from a developer dictating an instruction "
        "to an AI coding agent. Rewrite it as a concise, precise instruction that preserves: "
        "(1) the specific target — file, function, symbol, or component; (2) the action verb; "
        "(3) all explicit and implicit constraints, including negatives (\"don't touch X\"); "
        "(4) uncertainty — if the speaker was unsure, preserve the ambiguity explicitly rather "
        "than resolving it. Strip: filler, false starts, repetition, preamble, politeness, and "
        "narrated reasoning that isn't a constraint. Output one to three sentences. Never resolve "
        "an ambiguity — surface it.\n\nTranscript:\n{transcript}"
    ),
    "caveman": (
        "You receive a raw speech-to-text transcript from a developer dictating an instruction "
        "to an AI coding agent. Compress it using these rules:\n"
        "- Drop: articles (a/an/the), filler (just/really/basically/actually/simply), "
        "pleasantries, hedging, false starts, repetition\n"
        "- Fragments OK. Short synonyms (big not extensive, fix not implement a solution for)\n"
        "- Abbreviate common terms (DB/auth/config/req/res/fn/impl/UI/app)\n"
        "- Strip conjunctions. Use arrows for causality (X -> Y)\n"
        "- One word when one word enough\n"
        "- Technical terms and specific names stay exact\n"
        "- ALL constraints must survive — especially negatives (no X, don't Y)\n"
        "- Pattern: [thing] [action] [reason]. [next step].\n"
        "- Never resolve ambiguity — if speaker was unsure, keep it ambiguous\n\n"
        "Output the compressed version only, nothing else.\n\nTranscript:\n{transcript}"
    ),
}
ARMS = ["raw", "semantic", "caveman"]


def count_tokens(text):
    try:
        import tiktoken
    except ImportError:
        sys.exit("tiktoken not installed. Run: pip install tiktoken")
    enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))


def get_transcript_from_muesli(dictation_id):
    id_arg = dictation_id if dictation_id else "latest"
    result = subprocess.run(
        ["muesli-cli", "dictations", "get", id_arg],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        sys.exit(f"muesli-cli failed: {result.stderr.strip()}")
    data = json.loads(result.stdout)
    transcript = data.get("rawTranscript") or data.get("transcript")
    if not transcript:
        sys.exit(f"No rawTranscript field in muesli-cli output. Keys: {list(data.keys())}")
    return transcript


def compress_transcript(transcript, compressor="semantic"):
    prompt = COMPRESSOR_PROMPTS[compressor].format(transcript=transcript)
    start = time.monotonic()
    try:
        resp = requests.post(
            OLLAMA_URL,
            json={"model": COMPRESSOR_MODEL, "prompt": prompt, "stream": False},
            timeout=120,
        )
        resp.raise_for_status()
    except requests.exceptions.ConnectionError:
        sys.exit(f"Ollama not reachable at {OLLAMA_URL}. Start it with: ollama serve")
    latency_ms = int((time.monotonic() - start) * 1000)
    return resp.json()["response"].strip(), latency_ms


def show_preview(raw, semantic, caveman):
    try:
        width = min(os.get_terminal_size().columns, 160)
    except OSError:
        width = 120
    col = (width - 8) // 3

    raw_lines = textwrap.wrap(raw, col) or [""]
    sem_lines = textwrap.wrap(semantic, col) or [""]
    cav_lines = textwrap.wrap(caveman, col) or [""]

    print()
    print("=" * width)
    print(f"  {'RAW':<{col}} | {'SEMANTIC':<{col}} | {'CAVEMAN':<{col}}")
    print("=" * width)
    max_lines = max(len(raw_lines), len(sem_lines), len(cav_lines))
    for i in range(max_lines):
        l = raw_lines[i] if i < len(raw_lines) else ""
        m = sem_lines[i] if i < len(sem_lines) else ""
        r = cav_lines[i] if i < len(cav_lines) else ""
        print(f"  {l:<{col}} | {m:<{col}} | {r:<{col}}")
    print("=" * width)

    raw_tok = count_tokens(raw)
    sem_tok = count_tokens(semantic)
    cav_tok = count_tokens(caveman)
    sem_red = (raw_tok - sem_tok) / raw_tok * 100 if raw_tok > 0 else 0.0
    cav_red = (raw_tok - cav_tok) / raw_tok * 100 if raw_tok > 0 else 0.0
    print(f"\n  Tokens: raw={raw_tok}  semantic={sem_tok} (-{sem_red:.1f}%)  caveman={cav_tok} (-{cav_red:.1f}%)\n")


def load_log(log_file):
    entries = []
    if os.path.exists(log_file):
        with open(log_file) as f:
            for line in f:
                line = line.strip()
                if line:
                    entries.append(json.loads(line))
    return entries


def save_log(log_file, entries):
    with open(log_file, "w") as f:
        for entry in entries:
            f.write(json.dumps(entry) + "\n")


def find_entry(entries, task_id, arm, coding_model):
    for i, e in enumerate(entries):
        if e["task_id"] == task_id and e["arm"] == arm and e.get("coding_model") == coding_model:
            return i
    return None


def cmd_compress(args):
    if args.from_muesli is not None:
        dictation_id = args.from_muesli if isinstance(args.from_muesli, str) else None
        transcript = get_transcript_from_muesli(dictation_id)
    elif args.transcript:
        transcript = args.transcript
    elif not sys.stdin.isatty():
        transcript = sys.stdin.read().strip()
    else:
        sys.exit("Provide transcript via --transcript TEXT, stdin, or --from-muesli [ID]")

    print(f"Compressing (semantic) via {COMPRESSOR_MODEL}...", file=sys.stderr)
    semantic, sem_latency = compress_transcript(transcript, "semantic")

    print(f"Compressing (caveman) via {COMPRESSOR_MODEL}...", file=sys.stderr)
    caveman, cav_latency = compress_transcript(transcript, "caveman")

    show_preview(transcript, semantic, caveman)

    confirm = input("Looks good? (y to log and continue, n to abort): ").strip().lower()
    if confirm != "y":
        print("Aborted — nothing written.")
        sys.exit(0)

    raw_tok = count_tokens(transcript)
    sem_tok = count_tokens(semantic)
    cav_tok = count_tokens(caveman)

    entries = load_log(args.log)

    new_entries = [
        {
            "task_id": args.task_id,
            "difficulty_rank": args.difficulty,
            "arm": "raw",
            "coding_model": args.coding_model,
            "spoken_raw_transcript": transcript,
            "compressed_text": None,
            "instruction_tokens": raw_tok,
            "token_source": None,
            "agent_tokens": {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0},
            "agent_cost": None,
            "ran": None,
            "completeness_pass": None,
            "completeness_note": "",
            "compressor_latency_ms": None,
            "notes": "",
        },
        {
            "task_id": args.task_id,
            "difficulty_rank": args.difficulty,
            "arm": "semantic",
            "coding_model": args.coding_model,
            "spoken_raw_transcript": transcript,
            "compressed_text": semantic,
            "instruction_tokens": sem_tok,
            "token_source": None,
            "agent_tokens": {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0},
            "agent_cost": None,
            "ran": None,
            "completeness_pass": None,
            "completeness_note": "",
            "compressor_latency_ms": sem_latency,
            "notes": "",
        },
        {
            "task_id": args.task_id,
            "difficulty_rank": args.difficulty,
            "arm": "caveman",
            "coding_model": args.coding_model,
            "spoken_raw_transcript": transcript,
            "compressed_text": caveman,
            "instruction_tokens": cav_tok,
            "token_source": None,
            "agent_tokens": {"input": 0, "output": 0, "cache_read": 0, "cache_write": 0},
            "agent_cost": None,
            "ran": None,
            "completeness_pass": None,
            "completeness_note": "",
            "compressor_latency_ms": cav_latency,
            "notes": "",
        },
    ]

    for entry in new_entries:
        arm = entry["arm"]
        idx = find_entry(entries, args.task_id, arm, args.coding_model)
        if idx is not None:
            if not args.overwrite:
                print(f"Entry ({args.task_id}, {arm}, {args.coding_model}) already exists — skipping. Use --overwrite to replace.")
                continue
            entries[idx] = entry
        else:
            entries.append(entry)

    save_log(args.log, entries)
    print(f"\nLogged to {args.log}")
    print(f"Compressor latency: semantic={sem_latency}ms  caveman={cav_latency}ms")
    print(f"\n--- SEMANTIC (paste into agent) ---\n{semantic}\n")
    print(f"--- CAVEMAN (paste into agent) ---\n{caveman}\n")


def cmd_record(args):
    entries = load_log(args.log)
    idx = find_entry(entries, args.task_id, args.arm, args.coding_model)
    if idx is None:
        sys.exit(
            f"No entry for task_id={args.task_id!r} arm={args.arm!r} coding_model={args.coding_model!r}. "
            "Run 'compress' first."
        )

    entry = entries[idx]
    entry["token_source"] = args.token_source
    entry["agent_tokens"] = {
        "input": args.input_tokens,
        "output": args.output_tokens,
        "cache_read": args.cache_read,
        "cache_write": args.cache_write,
    }
    entry["agent_cost"] = args.cost
    entry["ran"] = args.ran == "true"
    entry["completeness_pass"] = args.completeness_pass == "true"
    entry["completeness_note"] = args.completeness_note
    entry["notes"] = args.notes

    save_log(args.log, entries)
    print(f"Recorded {args.task_id} ({args.arm}, {args.coding_model})")


def main():
    parser = argparse.ArgumentParser(
        prog="ab.py",
        description="STT Compression A/B experiment runner",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--log", default=LOG_FILE, metavar="FILE",
        help=f"JSONL log file (default: {LOG_FILE})",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    # compress
    pc = sub.add_parser("compress", help="Compress transcript and write partial log entries")
    pc.add_argument("--task-id", required=True, metavar="ID",
                    help="Unique idea ID, e.g. '04-habit'")
    pc.add_argument("--difficulty", type=int, required=True, choices=range(1, 6), metavar="N",
                    help="Difficulty rank 1–5")
    pc.add_argument("--coding-model", required=True, choices=["sonnet", "opus", "gpt-5.5"],
                    help="Coding agent model for this run")
    pc.add_argument("--transcript", metavar="TEXT",
                    help="Raw transcript as a string argument")
    pc.add_argument(
        "--from-muesli", nargs="?", const=True, metavar="DICTATION_ID",
        help="Fetch from muesli-cli; optionally specify dictation ID (default: latest)",
    )
    pc.add_argument("--overwrite", action="store_true",
                    help="Overwrite existing log entries for this task-id + model")

    # record
    pr = sub.add_parser("record", help="Record arm results after the agent run completes")
    pr.add_argument("--task-id", required=True, metavar="ID")
    pr.add_argument("--arm", required=True, choices=ARMS)
    pr.add_argument("--coding-model", required=True, choices=["sonnet", "opus", "gpt-5.5"])
    pr.add_argument("--token-source", required=True, choices=["anthropic", "openai"])
    pr.add_argument("--input-tokens", type=int, required=True, metavar="N")
    pr.add_argument("--output-tokens", type=int, required=True, metavar="N")
    pr.add_argument("--cache-read", type=int, default=0, metavar="N")
    pr.add_argument("--cache-write", type=int, default=0, metavar="N")
    pr.add_argument("--cost", type=float, default=None, metavar="$",
                    help="Total session cost in dollars")
    pr.add_argument("--ran", required=True, choices=["true", "false"])
    pr.add_argument("--completeness-pass", required=True, choices=["true", "false"])
    pr.add_argument("--completeness-note", default="", metavar="TEXT")
    pr.add_argument("--notes", default="", metavar="TEXT")

    args = parser.parse_args()
    {"compress": cmd_compress, "record": cmd_record}[args.command](args)


if __name__ == "__main__":
    main()
