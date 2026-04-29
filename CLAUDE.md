# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an LLM-powered personal knowledge base (wiki) system. It ingests source documents, compiles them into a structured .md wiki, and provides CLI/search tools for Q&A and visualization. The wiki is designed to be maintained primarily by LLMs, not humans.

Key concepts from the design doc (`llm-wiki.md`):
- **Ingest**: Index source documents (articles, papers, repos, images) into `raw/`
- **Compile**: LLM incrementally compiles a wiki (.md files) with summaries, backlinks, concepts, and articles
- **Q&A**: LLM agent answers complex queries by browsing the wiki
- **Output**: Renders results as markdown, slides (Marp format), or matplotlib images, viewable in Obsidian
- **Linting**: LLM "health checks" find inconsistencies, impute missing data, suggest new connections
- **Search**: Custom search engine with Web UI, also exposed as CLI tool for LLM agents

## Commands

```bash
npm run build        # Compile TypeScript → dist/
npm run dev          # Watch mode
npm start            # Run compiled output
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm test             # Run vitests
npm run test:watch   # Watch mode tests
npm run typecheck    # TypeScript type check only
```

## Project Structure (envisioned)

```
src/
  cli/           # CLI entry points for Q&A, linting, search, etc.
  compile/       # Wiki compilation logic (LLM-driven)
  ingest/        # Document ingestion and indexing
  search/        # Search engine (vibecoded)
  output/        # Output formatters (markdown, marp, matplotlib bridge)
  utils/         # Shared utilities
raw/             # Source documents (articles, papers, etc.)
wiki/            # Compiled wiki output (.md files)
```

## Architecture Notes

- All wiki data is plain markdown — no database. LLM reads/writes markdown directly.
- The LLM is the primary "user" of the CLI tools; human interaction is via Obsidian for viewing.
- Search engine runs as both a Web UI and a CLI tool callable by an LLM agent.
- Outputs are filed back into the wiki to accumulate knowledge over time.
