#!/usr/bin/env npx tsx
/**
 * Download audio from a URL and transcribe it with Whisper.
 *
 * Uses yt-dlp to download audio (WAV) and openai-whisper to transcribe.
 * Outputs a .md file containing the video URL and transcript text,
 * saved to raw/ for wiki ingestion.
 *
 * Usage:
 *   npx tsx scripts/transcribe.ts <url>
 *   npx tsx scripts/transcribe.ts <url> --model small --language en
 *   npx tsx scripts/transcribe.ts <url> --output-dir ./my-raw
 *
 * Dependencies:
 *   - yt-dlp (https://github.com/yt-dlp/yt-dlp)
 *   - whisper (https://github.com/openai/whisper) — pip install openai-whisper
 */

import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { cwd } from "node:process";

const RAW_DIR = resolve(process.env.RAW_DIR || join(cwd(), "raw"));

interface Options {
  model: string;
  language: string;
  outputDir: string;
}

function parseArgs(): { url: string; opts: Options } {
  const args = process.argv.slice(2);
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    console.log(`
Download audio from a URL and transcribe it with Whisper.

Usage:
  npx tsx scripts/transcribe.ts <url> [options]

Arguments:
  url                   Video/audio URL supported by yt-dlp

Options:
  -m, --model <name>    Whisper model size (tiny|base|small|medium|large)
                        Default: base
  -l, --language <code> Language code (zh, en, ja, etc.)
                        Default: zh
  -o, --output-dir <dir> Output directory for the transcript .md file
                        Default: ./raw/
  -h, --help            Show this help

Examples:
  npx tsx scripts/transcribe.ts "https://www.bilibili.com/video/BV1xx"
  npx tsx scripts/transcribe.ts https://youtu.be/xxxxx --model small --language en
  npx tsx scripts/transcribe.ts https://youtu.be/xxxxx -o ./my-raw

Note: On Windows, wrap the URL in quotes if it contains & to avoid shell splitting.
`);
    process.exit(0);
  }

  const opts: Options = {
    model: "base",
    language: "zh",
    outputDir: RAW_DIR,
  };

  let url = "";

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "-m":
      case "--model":
        opts.model = args[++i];
        break;
      case "-l":
      case "--language":
        opts.language = args[++i];
        break;
      case "-o":
      case "--output-dir":
        opts.outputDir = resolve(args[++i]);
        break;
      default:
        url = args[i];
    }
  }

  if (!url) {
    console.error("Error: URL is required.");
    process.exit(1);
  }

  return { url, opts };
}

/** Search PATH directly for a whisper executable (avoids child-process quirks). */
function findWhisperPath(): string | null {
  return findOnPath(["whisper", "whisper.exe", "whisper.bat", "whisper.cmd"]);
}

/** Build whisper command candidates, most preferred first. */
function whisperCandidates(): string[] {
  const cmds: string[] = [];
  if (process.env.WHISPER_CMD) cmds.push(process.env.WHISPER_CMD);

  const found = findWhisperPath();
  if (found) cmds.push(`"${found}"`);

  // Python module approaches
  const pythons = process.platform === "win32"
    ? ["python", "py", "python3"]
    : ["python3", "python"];
  for (const py of pythons) {
    cmds.push(`${py} -m whisper`);
  }

  cmds.push("whisper");
  return cmds;
}

/** Search PATH for any of the given executable names. */
function findOnPath(names: string[]): string | null {
  const pathEnv = process.env.PATH || "";
  const sep = process.platform === "win32" ? ";" : ":";
  for (const dir of pathEnv.split(sep)) {
    for (const name of names) {
      const full = join(dir.trim(), name);
      if (existsSync(full)) return full;
    }
  }
  return null;
}

/** Find yt-dlp full path, or null. */
function findYtDlp(): string | null {
  const found = findOnPath(["yt-dlp", "yt-dlp.exe", "yt-dlp.bat", "yt-dlp.cmd"]);
  if (found) return found;
  // Fallback: try shell
  try {
    execSync("yt-dlp --version", { stdio: "ignore" });
    return "yt-dlp";
  } catch {
    return null;
  }
}

function checkDependencies(): string | null {
  const ytDlp = findYtDlp();
  if (!ytDlp) {
    console.error("Error: yt-dlp not found. Install it:");
    console.error("  pip install yt-dlp");
    console.error("  https://github.com/yt-dlp/yt-dlp");
    process.exit(1);
  }
  return ytDlp;
}

function run(): void {
  const { url, opts } = parseArgs();
  const ytDlp = checkDependencies();
  if (!ytDlp) return; // checkDependencies already exited

  mkdirSync(opts.outputDir, { recursive: true });
  const tmpDir = resolve(cwd(), ".transcribe-tmp");
  mkdirSync(tmpDir, { recursive: true });

  console.log(`\n[1/2] Downloading audio: ${url}`);
  console.log("─".repeat(50));

  // Download audio as WAV; yt-dlp saves to tmpDir with title as filename
  const outputTmpl = join(tmpDir, "%(title)s.%(ext)s");
  execSync(
    `"${ytDlp}" -x --audio-format wav -o "${outputTmpl}" "${url}"`,
    { stdio: "inherit" },
  );

  // Find the downloaded WAV file
  const files = readdirSync(tmpDir).filter((f: string) => f.endsWith(".wav"));
  if (files.length === 0) {
    console.error("Error: no WAV file was downloaded.");
    process.exit(1);
  }
  const audioFile = join(tmpDir, files[0]);
  const baseName = files[0].replace(/\.wav$/, "");

  console.log(`\n[2/2] Transcribing with whisper (model=${opts.model}, language=${opts.language})`);
  console.log("─".repeat(50));

  // Try each candidate until one works, or show all errors
  const args = `"${audioFile}" --model ${opts.model} --language ${opts.language} --output_format txt --output_dir "${tmpDir}"`;
  const candidates = whisperCandidates();
  let ok = false;
  for (const cmd of candidates) {
    try {
      execSync(`${cmd} ${args}`, { stdio: "inherit" });
      ok = true;
      break;
    } catch {
      console.error(`  [FAIL] ${cmd} ${audioFile} ...`);
    }
  }

  if (!ok) {
    console.error("\nError: all whisper attempts failed.");
    console.error("Candidates tried:");
    for (const c of candidates) console.error(`  - ${c} ${args}`);
    console.error("\nTry setting WHISPER_CMD env var, e.g.:");
    console.error("  set WHISPER_CMD=python -m whisper");
    console.error("\nOr run this to diagnose:");
    console.error("  python -c \"import whisper\"");
    console.error(`\nAudio file preserved: ${audioFile}`);
    process.exit(1);
  }

  // Read whisper output and wrap in .md with the video URL
  const txtFile = join(tmpDir, `${baseName}.txt`);
  if (!existsSync(txtFile)) {
    console.error(`Error: transcript not found at ${txtFile}`);
    process.exit(1);
  }
  const transcript = readFileSync(txtFile, "utf-8");

  const mdContent = `---
source: ${url}
title: ${baseName}
---

${transcript}`;

  const dest = join(opts.outputDir, `${baseName}.md`);
  writeFileSync(dest, mdContent, "utf-8");
  console.log(`\nTranscript saved: ${dest}`);

  // Cleanup tmp files
  try {
    rmSync(audioFile, { force: true });
    for (const ext of [".txt", ".vtt", ".srt", ".tsv", ".json"]) {
      const f = join(tmpDir, `${baseName}${ext}`);
      if (existsSync(f)) rmSync(f, { force: true });
    }
  } catch { /* best-effort */ }

  console.log("Done.\n");
}

run();
