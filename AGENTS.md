# AGENTS.md — Personal Finance Agent Developer & Agent Guidelines

> This document defines architectural patterns, conventions, workflows, and rules for human developers and autonomous AI agents working in this repository.

---

## 1. Project Overview

**Personal Finance Agent** is a full-stack, local-first financial copilot designed for fast transaction ingestion, automated categorization, and conversational spending analytics.

- **Backend**: Rust 1.75+ using [Axum](https://github.com/tokio-rs/axum) and embedded [SQLite](https://github.com/rusqlite/rusqlite).
- **Frontend**: Single-page application built with React 18, TypeScript, Tailwind CSS, Recharts, and Lucide icons.
- **Packaging**: The compiled frontend (`frontend/dist/`) is embedded directly into the Rust binary via `rust-embed`. Running `cargo run` serves the complete application on port `8501`.
- **LLM Agent**: Native OpenAI-compatible tool-calling loop that executes SQL queries and statistical calculations locally against SQLite.

---

## 2. Directory Structure

```text
personal_finance_agent/
├── Cargo.toml                  # Rust workspace configuration and crate dependencies
├── build.rs                    # Cargo build script ensuring frontend/dist exists
├── src/
│   ├── main.rs                 # Axum web server, API routes, and static asset fallback
│   ├── models.rs               # Serde data transfer objects (Transaction, ImportSummary, etc.)
│   ├── db.rs                   # SQLite schema, transaction CRUD, and read-only SQL engine
│   ├── categories.rs           # Keyword categorization dictionary and matching rules
│   ├── ingest.rs               # CSV column normalization and PDF extraction pipelines
│   └── agent.rs                # OpenAI-compatible tool-calling loop and finance tools
├── frontend/                   # React + TypeScript + Vite frontend
│   ├── package.json            # Node.js dependencies
│   ├── vite.config.ts          # Vite build config with /api proxy to port 8501
│   ├── tailwind.config.js      # Tailwind CSS theme configuration
│   └── src/
│       ├── main.tsx            # React application entrypoint
│       ├── App.tsx             # Main dashboard UI (Sidebar, Metrics, Preview, Chat)
│       └── index.css           # Global Tailwind and custom scrollbar styles
├── tests/
│   └── integration_tests.rs    # Rust unit and integration tests
├── transactions.csv            # Sample transaction data for demo and testing
└── .env.example                # Environment variable template (ORQ_API_KEY, OPENAI_API_KEY)
```

---

## 3. Core Architectural Principles

1. **Local-First & Private**:
   - Transaction data lives in the local SQLite database (`finance.db`).
   - The database file is ignored by Git and never committed to source control.

2. **Zero Python Runtime Overhead**:
   - The original Python/Streamlit prototype was migrated to Rust for instant sub-second startups and low memory footprint.
   - Do not reintroduce Python runtime dependencies to production code.

3. **Safe Tool Calling**:
   - Any SQL tool executed by the LLM (`query_transactions_sql`) MUST be strictly read-only (`SELECT`).
   - Mutating statements (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `ATTACH`) are blocked before execution.

4. **UI Stability Rule**:
   - Never add, remove, or reposition visible UI elements without explicit user approval.
   - All improvements to the frontend must preserve existing layout positions unless authorized.

---

## 4. Development & Build Commands

### Frontend Build
```bash
cd frontend
npm install
npm run build
cd ..
```

### Running Tests
```bash
cargo test
```

### Running the Application
```bash
cargo run
```
Application will be available at `http://localhost:8501`.

---

## 5. Git & Conventional Commits Policy

All Git commits in this repository MUST follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

- `feat:` A new feature or capability
- `fix:` A bug fix or error correction
- `docs:` Documentation additions or updates
- `style:` Formatting, UI styles, or visual refinements (no business logic changes)
- `refactor:` Code refactoring that neither fixes a bug nor adds a feature
- `test:` Adding or updating unit/integration tests
- `chore:` Dependency bumps, tooling changes, or repository maintenance

**Example commit message:**
```bash
git commit -m "feat(agent): add support for custom date filtering in spending summary tool"
```
