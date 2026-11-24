# Personal Finance Agent

> Upload a bank statement or transaction CSV, categorize your spending, and ask natural language questions about your finances. Built with high-performance Rust and React.

## Overview

Personal Finance Agent is a full-stack personal finance copilot. The backend is written in Rust using Axum and embedded SQLite (`rusqlite`), executing financial summaries and read-only SQL queries through a native tool-calling LLM agent loop. The frontend is built with React, TypeScript, Tailwind CSS, and Recharts, and is compiled directly into the standalone Rust binary via `rust-embed`.

## Demo

![Demo](assets/demo.gif)

## Features

- **Blazing Fast**: Native Rust engine with zero Python interpreter overhead.
- **Single Executable**: The React SPA is embedded directly into the Rust binary.
- **Flexible Ingestion**: Ingest CSV files with varied column names (date, description, amount, debit/credit) and PDF statements.
- **Automatic Categorization**: Keyword classification into Food, Transport, Entertainment, Utilities, Shopping, Health, and Other.
- **Embedded SQLite**: Fast local persistence in `finance.db` with safe read-only SQL tool execution.
- **Natural Language Q&A**: LLM agent equipped with tool-calling capabilities (OpenAI-compatible endpoints, Orq.ai, Ollama).
- **Weekly Budget Planning**: Suggests realistic weekly budget caps with a 10% trim on discretionary expenses.
- **Interactive Visualizations**: Real-time category spending metrics and interactive charts.

## Tech Stack

- **Backend**: Rust 1.75+, Axum, Tokio, Rusqlite, Serde, Reqwest
- **Database**: SQLite (embedded)
- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Recharts, Lucide Icons
- **LLM Integration**: OpenAI Chat Completions Tool-Calling API (compatible with Orq.ai, OpenAI, Groq, Ollama)

## Prerequisites

- [Rust](https://rustup.rs/) (1.75+)
- [Node.js](https://nodejs.org/) (18+)
- API key for Orq.ai (`ORQ_API_KEY`) or OpenAI (`OPENAI_API_KEY`)

## Quick Start

### 1. Build Frontend Assets

```bash
cd frontend
npm install
npm run build
cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and set your API key:

```env
ORQ_API_KEY=your-orq-api-key-here
```

### 3. Run Application

```bash
cargo run
```

Open [http://localhost:8501](http://localhost:8501) in your browser.

## Running Tests

```bash
cargo test
```
