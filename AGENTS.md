# AGENTS.md

This document provides guidance for AI coding agents working in this repository.

## CRITICAL: Mastra Skill Required

**BEFORE doing ANYTHING with Mastra code or answering Mastra questions, load the Mastra skill FIRST.**

See [Mastra Skills section](#mastra-skills) for loading instructions.

## Project Overview

This is a **Mastra** project written in TypeScript. Mastra is a framework for building AI-powered applications and agents with a modern TypeScript stack.

The project implements a **crypto trading signals platform** that:
- Fetches real-time market data from CoinGecko (markets, OHLC, global) and Fear & Greed Index
- Computes 20+ technical indicators via pure-function shared libraries
- Generates quantitative composite signals (weighted scoring across 16 indicators)
- Uses an AI agent to produce detailed trading analysis reports
- Serves an HTML dashboard with reports, raw data panels, and workflow execution UI
- Supports multi-user architecture with per-request API key isolation

## Commands

Use these commands to interact with the project.

### Installation

```bash
npm install
```

### Development

Start the Mastra Studio at localhost:4111 by running the `dev` script:

```bash
npm run dev
```

### Build

In order to build a production-ready server, run the `build` script:

```bash
npm run build
```

### Type Check

```bash
npx tsc --noEmit
```

## Project Structure

Folders organize your agent's resources, like agents, tools, and workflows.

| Folder                 | Description                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/mastra`           | Entry point for all Mastra-related code and configuration.                                                                               |
| `src/mastra/agents`    | Define and configure your agents - their behavior, goals, and tools.                                                                     |
| `src/mastra/workflows` | Define multi-step workflows that orchestrate agents and tools together.                                                                  |
| `src/mastra/tools`     | Create reusable tools that your agents can call.                                                                                         |
| `src/mastra/lib`       | Shared pure-function libraries (indicators, scoring) consumed by both tools and workflows. No code duplication.                          |
| `src/mastra/reports`   | HTML report generation, storage (LibSQL), model config, settings UI, and HTTP routes.                                                    |
| `src/mastra/scorers`   | Define scorers for evaluating agent performance over time.                                                                               |
| `src/mastra/public`    | Contents are copied into the `.build/output` directory during the build process, making them available for serving at runtime.            |

### Key Library Files

| File                    | Description                                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/mastra/lib/indicators.ts` | All pure TA calculation functions: SMA, EMA, RSI, MACD, Bollinger, Stochastic, CCI, OBV, Fibonacci, ADX, ATR, Ichimoku, VWAP. Shared between tool and workflow. |
| `src/mastra/lib/scoring.ts`    | Scoring functions that convert indicator values into weighted directional signals (BULLISH/BEARISH/NEUTRAL). Computes composite signal. |

### External APIs Used

| API | Endpoint | Purpose |
| --- | -------- | ------- |
| CoinGecko | `/coins/markets` | Current price, market cap, volume, ATH |
| CoinGecko | `/coins/{id}/market_chart?days=200` | 200-day historical prices and volumes |
| CoinGecko | `/coins/{id}/ohlc?days=90` | 90-day OHLC candles for ADX, ATR, Ichimoku, VWAP |
| CoinGecko | `/global` | BTC Dominance, total market cap, 24h market change |
| Alternative.me | `/fng` | Fear & Greed Index |

### Technical Indicators (16 scored + 5 contextual)

**Scored (contribute to composite signal):**
RSI, SMA(20), SMA(50), SMA(200), MACD, Bollinger Bands, Stochastic, CCI, OBV, ADX, Ichimoku Cloud, VWAP, Fear & Greed, Momentum(24h), SMA Cross(50/200), Volume Profile

**Contextual (used by AI agent, not scored):**
ATR, Fibonacci Retracements, BTC Dominance, Total Market Cap, Market Cap Change 24h

### Top-level files

Top-level files define how your Mastra project is configured, built, and connected to its environment.

| File                  | Description                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/mastra/index.ts` | Central entry point where you configure and initialize Mastra.                                                    |
| `.env.example`        | Template for environment variables - copy and rename to `.env` to add your secret model provider keys.            |
| `package.json`        | Defines project metadata, dependencies, and available npm scripts.                                                |
| `tsconfig.json`       | Configures TypeScript options such as path aliases, compiler settings, and build output.                          |
| `INDICATORS-ROADMAP.md` | Technical indicators implementation roadmap (3 phases, all completed).                                          |
| `API-GUIDE.md`        | Complete API usage guide with curl examples.                                                                      |
| `DEPLOY-AWS.md`       | Step-by-step AWS EC2 deployment guide.                                                                            |

## Mastra Skills

Skills are modular capabilities that extend agent functionalities. They provide pre-built tools, integrations, and workflows that agents can leverage to accomplish tasks more effectively.

This project has skills installed for the following agents:

- Gemini Cli

### Loading Skills

1. **Load the Mastra skill FIRST** - Use `/mastra` command or Skill tool
2. **Never rely on cached knowledge** - Mastra APIs change frequently between versions
3. **Always verify against current docs** - The skill provides up-to-date documentation

**Why this matters:** Your training data about Mastra is likely outdated. Constructor signatures, APIs, and patterns change rapidly. Loading the skill ensures you use current, correct APIs.

Skills are automatically available to agents in your project once installed. Agents can access and use these skills without additional configuration.

## Resources

- [Mastra Documentation](https://mastra.ai/llms.txt)
- [Mastra .well-known skills discovery](https://mastra.ai/.well-known/skills/index.json)
