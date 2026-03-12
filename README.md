# Crypto Signals — AI-Powered Cryptocurrency Analysis Platform

> Built with [Mastra AI](https://mastra.ai/) framework • TypeScript • 9 LLM providers • 58+ models

**Live**: [https://tu-dominio.duckdns.org](https://tu-dominio.duckdns.org)

---

## What It Does

Crypto Signals is a Mastra-based platform that provides AI-powered cryptocurrency analysis with a 10-indicator scoring engine, volume analysis, and market scanning. It uses real-time data from CoinGecko (prices, volumes, ATH) and the Fear & Greed Index, combined with aggressive LLM-generated reports that include specific entry/exit zones, stop-loss levels, and risk/reward ratios.

### Features

- **Crypto Analysis Workflow** — 10-indicator scoring system (RSI, SMA 20/50/200, EMA 12/26, MACD, Bollinger, Fear & Greed, Momentum, SMA Crossover, Volume Profile) with AI-generated reports including entry/exit zones, stop-loss, and risk/reward
- **Market Scan Workflow** — Scans top N coins with aggressive opportunity identification: BUY/SELL targets with entry/target/SL, sector analysis, and immediate action plans
- **Interactive Agent** — Chat-based crypto assistant with memory (remembers conversations)
- **HTML Reports Dashboard** — Dark-themed reports with table rendering, signal badges (BUY/SELL/HOLD highlighted), keyword coloring (BULLISH/BEARISH/OVERSOLD/OVERBOUGHT), and responsive filters
- **Workflows UI** — Web interface to execute workflows without curl
- **Settings UI** — Configure LLM provider, model, and API key from the browser
- **9 LLM Providers** — Google, OpenAI, Anthropic, Groq, xAI, Mistral, DeepSeek, Perplexity, Cohere
- **58+ Models** — From Gemini 2.5 Pro to Claude Opus 4.6 to GPT-4.1 and more
- **HTTPS** — SSL via Let's Encrypt + DuckDNS

### Security

- API keys are stored **only in browser localStorage** — never written to disk or memory on the server
- **Multi-user safe** — each workflow request sends config per-request via `AsyncLocalStorage` (no global state)
- Each user configures their own provider, model, and API key independently
- No `.env` fallback — users must configure their own API key via Settings
- HTTPS enforced with HTTP→HTTPS redirect

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (Mastra Studio at localhost:4111)
npm run dev
```

### First Steps

1. Open [http://localhost:4111/settings](http://localhost:4111/settings)
2. Select a provider and model (e.g. Google → Gemini 2.5 Flash)
3. Enter your API key and click **Save & Apply**
4. Go to [http://localhost:4111/workflows](http://localhost:4111/workflows) to run analyses
5. View reports at [http://localhost:4111/reports](http://localhost:4111/reports)

---

## Project Structure

```
src/mastra/
├── index.ts                     # Mastra entrypoint — agents, workflows, storage, routes
├── agents/
│   └── crypto-agent.ts          # AI agent with 4 tools + memory
├── tools/
│   ├── index.ts                 # Barrel exports
│   ├── crypto-price.ts          # CoinGecko price/market data
│   ├── crypto-market.ts         # Top N coins + global metrics
│   ├── technical-analysis.ts    # RSI, SMA, EMA, MACD, Bollinger Bands
│   └── crypto-sentiment.ts      # Fear & Greed Index + trending coins
├── workflows/
│   ├── crypto-analysis.ts       # 3-step: fetch+TA → AI report → save HTML
│   └── market-scan.ts           # 3-step: market snapshot → AI opportunities → save HTML
├── scorers/
│   └── crypto-scorer.ts         # LLM-judged signal quality evaluator
└── reports/
    ├── index.ts                 # Barrel exports
    ├── model-config.ts          # Dynamic LLM config (AsyncLocalStorage per-request, 9 providers, 58+ models)
    ├── html-templates.ts        # Dashboard + report HTML generators
    ├── settings-ui.ts           # Settings page HTML (provider/model/key selection)
    ├── workflows-ui.ts          # Workflows execution page HTML
    ├── storage.ts               # LibSQL persistence for reports
    └── routes.ts                # HTTP routes (reports, settings, workflow execution)
```

---

## Supported LLM Providers & Models

| Provider | Models | API Key Env Var |
|----------|--------|-----------------|
| **Google Gemini** | Gemini 2.5 Pro/Flash/Flash Lite, 2.0 Flash/Lite, 1.5 Pro/Flash/Flash 8B | `GOOGLE_GENERATIVE_AI_API_KEY` |
| **OpenAI** | o3 Pro/o3/o3 Mini, o4 Mini, o1/o1 Mini/o1 Pro, GPT-4.1/Mini/Nano, GPT-4.5 Preview, GPT-4o/Mini, GPT-4 Turbo | `OPENAI_API_KEY` |
| **Anthropic** | Claude Opus 4.6/4.5/4, Sonnet 4.5/4, Haiku 3.5, Claude 3.5 Sonnet v2, 3.5 Haiku, 3 Opus/Sonnet/Haiku | `ANTHROPIC_API_KEY` |
| **Groq** | Llama 3.3 70B, 3.1 8B, 3.2 (90B/11B/3B/1B), DeepSeek R1 Distill, Qwen QwQ, Mixtral, Gemma 2 | `GROQ_API_KEY` |
| **xAI (Grok)** | Grok 3/Fast/Mini/Mini Fast, Grok 2/Vision | `XAI_API_KEY` |
| **Mistral** | Large, Small, Saba, Codestral, Pixtral Large, Nemo, Ministral 8B/3B | `MISTRAL_API_KEY` |
| **DeepSeek** | Chat (V3), Reasoner (R1) | `DEEPSEEK_API_KEY` |
| **Perplexity** | Sonar Pro/Sonar, Reasoning Pro/Reasoning, Deep Research | `PERPLEXITY_API_KEY` |
| **Cohere** | Command A, R+, R, R 7B, Aya Expanse 32B/8B | `COHERE_API_KEY` |

---

## Web Pages

| URL | Description |
|-----|-------------|
| `/reports` | Dashboard with all generated reports (filterable) |
| `/reports/:id` | Individual report view |
| `/workflows` | Interactive workflow execution page |
| `/settings` | LLM provider/model/API key configuration |

---

## API Endpoints

See [API-GUIDE.md](API-GUIDE.md) for complete `curl` examples.

### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/agents/crypto-signals-agent/generate` | Chat with the AI agent |
| `POST` | `/workflows/execute/analysis` | Run crypto analysis (per-request config) |
| `POST` | `/workflows/execute/scan` | Run market scan (per-request config) |
| `POST` | `/model-config/test` | Test model connection |

---

## Deployment

Deployed on AWS EC2 with HTTPS. See [DEPLOY-AWS.md](DEPLOY-AWS.md) for the full guide.

```bash
# Build for production
npm run build

# Deploy to AWS (rsync + PM2 restart)
rsync -avz --delete --exclude='node_modules' --exclude='.env' --exclude='*.db*' \
  .mastra/output/ -e "ssh -i ~/.ssh/crypto-signals-key.pem" \
  ec2-user@TU_IP_PUBLICA:~/crypto-signals/.mastra/output/

ssh -i ~/.ssh/crypto-signals-key.pem ec2-user@TU_IP_PUBLICA \
  "cd ~/crypto-signals/.mastra/output && npm install && pm2 restart crypto-signals"
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Mastra AI (`@mastra/core@1.11.0`) |
| Language | TypeScript (ES2022, strict) |
| AI SDK | Vercel AI SDK v5 (9 provider packages) |
| Database | LibSQL (reports + agent memory) |
| Server | Hono (via Mastra) |
| Hosting | AWS EC2 (t3.micro) |
| `HTTPS` | Caddy + Let's Encrypt + DuckDNS |
| Process Manager | PM2 |

---

## Documentation

| File | Description |
|------|-------------|
| [API-GUIDE.md](API-GUIDE.md) | Complete API reference with curl examples |
| [DEPLOY-AWS.md](DEPLOY-AWS.md) | Step-by-step AWS deployment guide |
| [REVIEW.md](REVIEW.md) | Architecture review and known issues |
| [AGENTS.md](AGENTS.md) | AI agent configuration for this repo |
