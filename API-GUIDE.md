# API Guide — Crypto Signals (Mastra Server)

Guía completa de casos de uso del servidor Mastra via `curl`.

> **Base URL**: `http://TU_IP_PUBLICA:4111` (AWS) o `http://localhost:4111` (local)

---

## Tabla de Contenidos

1. [Workflows — Ejecución con Config Per-Request](#1-workflows--ejecución-con-config-per-request)
2. [Workflows — Historial de Runs](#2-workflows--historial-de-runs)
3. [Reports — Dashboard HTML](#3-reports--dashboard-html)
4. [Discovery — Listar Recursos](#4-discovery--listar-recursos)
5. [Workflows UI — Interfaz Web](#5-workflows-ui--interfaz-web)
6. [Settings — Configuración de Modelo](#6-settings--configuración-de-modelo)
7. [Administración — Reset de Bases de Datos](#7-administración--reset-de-bases-de-datos)
8. [Referencia Rápida](#8-referencia-rápida)

> **Nota**: Los endpoints del agente (`/api/agents/.../generate`, `/api/agents/.../stream`) y los endpoints legacy de workflows (`/api/workflows/.../start-async`) no están documentados porque requieren un modelo y API key configurados en el servidor. En esta arquitectura multi-usuario, toda ejecución se hace via los endpoints custom `/workflows/execute/*` que reciben la config per-request.

---

## 1. Workflows — Ejecución con Config Per-Request

Cada ejecución de workflow requiere enviar la config completa (provider, modelName, apiKey) en el body. Esto garantiza aislamiento multi-usuario.

### Análisis de un Coin

Ejecuta el pipeline completo: fetch datos → análisis técnico → generar reporte AI → guardar HTML.

```bash
curl -s -X POST $BASE/workflows/execute/analysis \
  -H "Content-Type: application/json" \
  -d '{
    "coinId": "bitcoin",
    "provider": "google",
    "modelName": "gemini-2.5-flash",
    "apiKey": "your-api-key"
  }'
```

**Respuesta**:
```json
{
  "status": "success",
  "result": {
    "steps": {
      "fetch-and-analyze": {
        "status": "success",
        "output": {
          "coinId": "bitcoin",
          "currentPrice": 70517,
          "overallSignal": "HOLD",
          "signalScore": -9,
          "indicatorBreakdown": "RSI: NEUTRAL (+5) | SMA (20): BULLISH (+15) | ...",
          "volumeRatio": 1.23,
          "ema12": 70100,
          "ema26": 69800,
          "athChangePercentage": -3.5
        }
      },
      "save-html-report": {
        "status": "success",
        "output": {
          "reportId": "abc123",
          "reportUrl": "/reports/abc123"
        }
      }
    }
  }
}
```

**Coins soportados** (CoinGecko IDs):
| Ticker | CoinGecko ID |
|--------|-------------|
| BTC | `bitcoin` |
| ETH | `ethereum` |
| SOL | `solana` |
| ADA | `cardano` |
| XRP | `ripple` |
| DOT | `polkadot` |
| DOGE | `dogecoin` |
| AVAX | `avalanche-2` |
| LINK | `chainlink` |
| BNB | `binancecoin` |
| LTC | `litecoin` |
| UNI | `uniswap` |
| ATOM | `cosmos` |
| MATIC | `matic-network` |

### Scan del Mercado

Analiza las top coins, identifica oportunidades, y genera un reporte HTML.

```bash
curl -s -X POST $BASE/workflows/execute/scan \
  -H "Content-Type: application/json" \
  -d '{
    "limit": 10,
    "provider": "google",
    "modelName": "gemini-2.5-flash",
    "apiKey": "your-api-key"
  }'
```

### Ejecutar análisis de múltiples coins (script)

```bash
API_KEY="your-api-key"
for coin in bitcoin ethereum solana cardano; do
  echo "=== Analizando $coin ==="
  curl -s -X POST "$BASE/workflows/execute/analysis" \
    -H "Content-Type: application/json" \
    -d "{\"coinId\":\"$coin\",\"provider\":\"google\",\"modelName\":\"gemini-2.5-flash\",\"apiKey\":\"$API_KEY\"}" \
    | python3 -c "import sys,json; d=json.load(sys.stdin); r=d.get('result',{}); s=r.get('steps',{}).get('fetch-and-analyze',{}).get('output',{}); print(f\"  Signal: {s.get('overallSignal','?')} | Score: {s.get('signalScore','?')} | Price: \${s.get('currentPrice','?')}\")"
  echo ""
done
```

### Testear conexión al modelo

```bash
curl -s -X POST $BASE/model-config/test \
  -H "Content-Type: application/json" \
  -d '{"provider":"google","modelName":"gemini-2.5-flash","apiKey":"your-key"}'
```

> **Nota**: Se requiere un `apiKey` válido. No hay fallback a variables de entorno.

---

## 2. Workflows — Historial de Runs

Endpoints nativos de Mastra para consultar el historial de ejecuciones.

### Listar runs de un workflow

```bash
curl -s "http://TU_IP_PUBLICA:4111/api/workflows/crypto-analysis-workflow/runs" \
  | python3 -c "
import sys,json
d = json.load(sys.stdin)
for r in d.get('runs', []):
    snap = r.get('snapshot', {})
    print(f'runId: {r[\"runId\"][:20]}...  status: {snap.get(\"status\",\"?\")}')
"
```

### Obtener detalle de un run específico

```bash
curl -s "http://TU_IP_PUBLICA:4111/api/workflows/crypto-analysis-workflow/runs/RUN_ID_AQUI" \
  | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin),indent=2))"
```

### Eliminar un run

```bash
curl -s -X DELETE "http://TU_IP_PUBLICA:4111/api/workflows/crypto-analysis-workflow/runs/RUN_ID_AQUI"
```

### Cancelar un run en ejecución

```bash
curl -s -X POST "http://TU_IP_PUBLICA:4111/api/workflows/crypto-analysis-workflow/runs/RUN_ID_AQUI/cancel" \
  -H "Content-Type: application/json"
```

---

## 3. Reports — Dashboard HTML

Rutas custom para gestionar reportes generados por los workflows.

### Ver dashboard de reportes (navegador)

```
http://TU_IP_PUBLICA:4111/reports
```

### Dashboard filtrado

```
http://TU_IP_PUBLICA:4111/reports?filter=analysis
http://TU_IP_PUBLICA:4111/reports?filter=scan
```

### Ver último reporte de un coin

```
http://TU_IP_PUBLICA:4111/reports/latest/bitcoin
http://TU_IP_PUBLICA:4111/reports/latest/ethereum
```

> Redirige (302) al reporte más reciente de ese coin.

### Ver un reporte específico por ID

```
http://TU_IP_PUBLICA:4111/reports/REPORT_ID
```

### Eliminar un reporte

```bash
curl -s -X DELETE "http://TU_IP_PUBLICA:4111/reports/REPORT_ID"
```

**Respuesta**:
```json
{
  "success": true,
  "deletedId": "REPORT_ID"
}
```

### Obtener dashboard como HTML por curl

```bash
curl -s http://TU_IP_PUBLICA:4111/reports | head -20
```

---

## 4. Discovery — Listar Recursos

### Listar agentes disponibles

```bash
curl -s http://TU_IP_PUBLICA:4111/api/agents \
  | python3 -c "import sys,json; d=json.load(sys.stdin); [print(f'{k}: {v[\"name\"]}') for k,v in d.items()]"
```

### Ver detalle de un agente

```bash
curl -s http://TU_IP_PUBLICA:4111/api/agents/crypto-signals-agent \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Name: {d[\"name\"]}'); print(f'Tools: {list(d[\"tools\"].keys())}')"
```

### Listar workflows disponibles

```bash
curl -s http://TU_IP_PUBLICA:4111/api/workflows \
  | python3 -c "import sys,json; d=json.load(sys.stdin); [print(f'{k}: {v[\"name\"]}') for k,v in d.items()]"
```

### Ver detalle de un workflow (steps)

```bash
curl -s http://TU_IP_PUBLICA:4111/api/workflows/crypto-analysis-workflow \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Name: {d[\"name\"]}'); [print(f'  Step: {k}') for k in d['steps']]"
```

### Listar tools registrados

```bash
curl -s http://TU_IP_PUBLICA:4111/api/tools \
  | python3 -c "import sys,json; d=json.load(sys.stdin); [print(f'{k}: {v[\"id\"]} — {v[\"description\"][:60]}') for k,v in d.items()]"
```

---

## 5. Workflows UI — Interfaz Web

En lugar de utilizar `curl`, puedes ejecutar los workflows desde una interfaz web interactiva accesible directamente en el navegador.

### Acceder a la página de Workflows

```
http://TU_IP_PUBLICA:4111/workflows
```

También accesible desde el dashboard de reports haciendo click en la tarjeta **🔄 Run Workflows**.

### Funcionalidades de la UI

| Funcionalidad | Descripción |
|---------------|-------------|
| **Crypto Analysis** | Selecciona una criptomoneda del dropdown y ejecuta el análisis completo |
| **Market Scan** | Selecciona cuántas monedas escanear (Top 5, 10, 15, 20, 25) |
| **Resultados en vivo** | Los resultados se muestran con un timeline de pasos, estados, y duraciones |
| **Report links** | Si el workflow genera un reporte HTML, aparece un botón directo para verlo |
| **Historial de runs** | Tabla con los últimos 15 ejecutados, incluyendo tipo, input, estado, fecha y link al reporte |

### Coins disponibles en el selector

| ID (CoinGecko) | Nombre |
|-----------------|--------|
| `bitcoin` | Bitcoin (BTC) |
| `ethereum` | Ethereum (ETH) |
| `solana` | Solana (SOL) |
| `cardano` | Cardano (ADA) |
| `ripple` | XRP (XRP) |
| `polkadot` | Polkadot (DOT) |
| `dogecoin` | Dogecoin (DOGE) |
| `avalanche-2` | Avalanche (AVAX) |
| `chainlink` | Chainlink (LINK) |
| `binancecoin` | BNB (BNB) |
| `litecoin` | Litecoin (LTC) |
| `uniswap` | Uniswap (UNI) |
| `cosmos` | Cosmos (ATOM) |
| `matic-network` | Polygon (MATIC) |

### Navegación

- **Dashboard → Workflows**: Click en tarjeta "🔄 Run Workflows" en `/reports`
- **Workflows → Dashboard**: Click en "← Reports Dashboard" en `/workflows`

---

## 6. Settings — Configuración de Modelo

Página interactiva para seleccionar el modelo LLM y la API key sin tocar archivos del servidor.

### Página de Settings

Navegar a `/settings` en el browser.

**Proveedores soportados (9 providers, 58+ modelos):**

| Provider | Modelos | Env Var |
|----------|---------|---------|
| Google Gemini | Gemini 2.5 Pro/Flash/Flash Lite, 2.0 Flash/Lite, 1.5 Pro/Flash/Flash 8B | `GOOGLE_GENERATIVE_AI_API_KEY` |
| OpenAI | o3 Pro/o3/o3 Mini, o4 Mini, o1/o1 Mini/o1 Pro, GPT-4.1/Mini/Nano, GPT-4.5 Preview, GPT-4o/Mini, GPT-4 Turbo | `OPENAI_API_KEY` |
| Anthropic | Claude Opus 4.6/4.5/4, Sonnet 4.5/4, Haiku 3.5, 3.5 Sonnet v2, 3.5 Haiku, 3 Opus/Sonnet/Haiku | `ANTHROPIC_API_KEY` |
| Groq | Llama 3.3 70B, 3.1 8B, 3.2 (90B/11B/3B/1B), DeepSeek R1 Distill, Qwen QwQ, Mixtral, Gemma 2 | `GROQ_API_KEY` |
| xAI (Grok) | Grok 3/Fast/Mini/Mini Fast, Grok 2/Vision | `XAI_API_KEY` |
| Mistral | Large, Small, Saba, Codestral, Pixtral Large, Nemo, Ministral 8B/3B | `MISTRAL_API_KEY` |
| DeepSeek | Chat (V3), Reasoner (R1) | `DEEPSEEK_API_KEY` |
| Perplexity | Sonar Pro/Sonar, Reasoning Pro/Reasoning, Deep Research | `PERPLEXITY_API_KEY` |
| Cohere | Command A, R+, R, R 7B, Aya Expanse 32B/8B | `COHERE_API_KEY` |

### Arquitectura de seguridad (multi-usuario)

- La API key se guarda **solo en localStorage** del browser de cada usuario
- **No se guarda ningún estado global en el servidor** — cada request de workflow envía la config completa (provider, model, apiKey)
- El servidor usa `AsyncLocalStorage` para aislar la config de cada request — **multi-usuario seguro**
- Cada usuario configura su propio proveedor, modelo y API key de forma independiente
- Si dos usuarios usan el sistema simultáneamente, sus configs están completamente aisladas
- **No hay fallback a variables de entorno** — el usuario DEBE configurar su API key via Settings antes de usar workflows
- Si no hay API key configurada, la página de Workflows muestra un overlay bloqueante que redirige a Settings

### API Endpoints

#### Testear conexión

```bash
curl -s -X POST $BASE/model-config/test \
  -H "Content-Type: application/json" \
  -d '{"provider":"google","modelName":"gemini-2.5-flash","apiKey":"your-key"}'
```

> **Nota**: Se requiere un `apiKey` válido. No hay fallback a variables de entorno.

#### Ejecutar workflow de análisis (per-request config)

```bash
curl -s -X POST $BASE/workflows/execute/analysis \
  -H "Content-Type: application/json" \
  -d '{"coinId":"bitcoin","provider":"google","modelName":"gemini-2.5-flash","apiKey":"your-key"}'
```

#### Ejecutar workflow de market scan (per-request config)

```bash
curl -s -X POST $BASE/workflows/execute/scan \
  -H "Content-Type: application/json" \
  -d '{"limit":10,"provider":"google","modelName":"gemini-2.5-flash","apiKey":"your-key"}'
```

> **Nota**: Estos endpoints reemplazan los endpoints legacy de Mastra (`/api/workflows/*/start-async`). La config se envía en cada request para aislamiento multi-usuario.

---

## 7. Administración — Reset de Bases de Datos

El servidor utiliza dos bases de datos LibSQL:

| Base de Datos | Ubicación | Contenido |
|---------------|-----------|----------|
| `mastra.db` | `~/crypto-signals/.mastra/output/` | Memoria del agente (threads, mensajes, working memory, workflow runs) |
| `mastra-reports.db` | `~/crypto-signals/` | Reportes HTML generados por los workflows |

> **Nota**: `mastra.db` está dentro de `.mastra/output/` pero `mastra-reports.db` está en la raíz del proyecto (CWD del proceso PM2).

### Resetear todo (ambas bases de datos)

```bash
ssh -i ~/.ssh/crypto-signals-key.pem ec2-user@TU_IP_PUBLICA \
  'rm -f ~/crypto-signals/.mastra/output/mastra.db* ~/crypto-signals/mastra-reports.db && pm2 restart crypto-signals'
```

### Resetear solo reportes

```bash
ssh -i ~/.ssh/crypto-signals-key.pem ec2-user@TU_IP_PUBLICA \
  'rm -f ~/crypto-signals/mastra-reports.db && pm2 restart crypto-signals'
```

### Resetear solo memoria del agente

Elimina threads, mensajes y working memory. Los reportes HTML se mantienen.

```bash
ssh -i ~/.ssh/crypto-signals-key.pem ec2-user@TU_IP_PUBLICA \
  'rm -f ~/crypto-signals/.mastra/output/mastra.db* && pm2 restart crypto-signals'
```

### Resetear base de datos local

```bash
cd /ruta/a/tu/proyecto
rm -f .mastra/output/mastra.db* mastra-reports.db
# Reiniciar el servidor de desarrollo
```

> **Nota**: Las bases de datos se recrean automáticamente vacías al reiniciar el servidor (PM2 o dev).

### Borrar Workflow Runs (historial de ejecuciones)

Los workflow runs se eliminan individualmente via la API REST, sin necesidad de borrar bases de datos.

**Borrar todos los runs de ambos workflows:**

```bash
# Borrar runs de crypto-analysis
curl -s http://TU_IP_PUBLICA:4111/api/workflows/crypto-analysis-workflow/runs \
  | python3 -c "import sys,json; [print(r['runId']) for r in json.load(sys.stdin).get('runs',[])]" \
  | xargs -I{} curl -s -X DELETE http://TU_IP_PUBLICA:4111/api/workflows/crypto-analysis-workflow/runs/{}

# Borrar runs de market-scan
curl -s http://TU_IP_PUBLICA:4111/api/workflows/market-scan-workflow/runs \
  | python3 -c "import sys,json; [print(r['runId']) for r in json.load(sys.stdin).get('runs',[])]" \
  | xargs -I{} curl -s -X DELETE http://TU_IP_PUBLICA:4111/api/workflows/market-scan-workflow/runs/{}
```

**Borrar un run específico:**

```bash
curl -s -X DELETE http://TU_IP_PUBLICA:4111/api/workflows/crypto-analysis-workflow/runs/RUN_ID_AQUI
```

**Listar runIds para revisión:**

```bash
curl -s http://TU_IP_PUBLICA:4111/api/workflows/crypto-analysis-workflow/runs \
  | python3 -c "import sys,json; [print(r['runId']) for r in json.load(sys.stdin).get('runs',[])]"
```

> **Nota**: Esto limpia la tabla "Recent Workflow Runs" en la UI de `/workflows` sin afectar reportes ni memoria del agente.

### Verificar que el reset fue exitoso

```bash
# Verificar reportes (debería devolver lista vacía)
curl -s http://TU_IP_PUBLICA:4111/reports | grep -c "report-card"

# Verificar threads (debería devolver total: 0)
curl -s "http://TU_IP_PUBLICA:4111/api/memory/threads?agentId=crypto-signals-agent" \
  | python3 -c "import sys,json; print('Threads:', json.load(sys.stdin).get('total', 0))"

# Verificar workflow runs (debería devolver lista vacía)
curl -s http://TU_IP_PUBLICA:4111/api/workflows/crypto-analysis-workflow/runs \
  | python3 -c "import sys,json; print('Analysis runs:', len(json.load(sys.stdin).get('runs',[])))"
```

---

## 8. Referencia Rápida

### Endpoints de Workflows (Per-Request)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `POST` | `/workflows/execute/analysis` | **Ejecutar análisis** (config per-request) |
| `POST` | `/workflows/execute/scan` | **Ejecutar market scan** (config per-request) |
| `POST` | `/model-config/test` | Testear conexión al modelo |

### Endpoints de Workflows (API nativa Mastra)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/workflows` | Listar workflows |
| `GET` | `/api/workflows/:name` | Detalle de workflow |
| `GET` | `/api/workflows/:name/runs` | Listar runs del workflow |
| `GET` | `/api/workflows/:name/runs/:runId` | Detalle de un run |
| `DELETE` | `/api/workflows/:name/runs/:runId` | Eliminar un run |
| `POST` | `/api/workflows/:name/runs/:runId/cancel` | Cancelar run en ejecución |

### Endpoints de Reports & UI (Custom)

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/reports` | Dashboard HTML de todos los reportes |
| `GET` | `/reports?filter=analysis` | Dashboard filtrado (analysis/scan) |
| `GET` | `/reports/latest/:coinId` | Redirect al último reporte de un coin |
| `GET` | `/reports/:id` | Ver reporte individual (HTML) |
| `DELETE` | `/reports/:id` | Eliminar un reporte |
| `GET` | `/workflows` | Interfaz web interactiva para ejecutar workflows |
| `GET` | `/settings` | Página de configuración de modelo LLM |

### Endpoints de Discovery

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/api/agents` | Listar agentes |
| `GET` | `/api/workflows` | Listar workflows |
| `GET` | `/api/tools` | Listar tools |

---

## Workflow Names

Los workflows se identifican por su **name** (no por la key de código):

| Key en código | Name en API | Input |
|--------------|-------------|-------|
| `cryptoAnalysisWorkflow` | `crypto-analysis-workflow` | `{ "coinId": "bitcoin" }` |
| `marketScanWorkflow` | `market-scan-workflow` | `{ "limit": 10 }` |

---

## Notas Importantes

1. **Config Per-Request**: Cada ejecución requiere `provider`, `modelName` y `apiKey` en el body. No hay configuración global en el servidor.

2. **Rate limits**: Los modelos tienen límites según el proveedor/plan. Si recibes errores de cuota, espera unos minutos.

3. **CoinGecko IDs**: Los workflows y tools usan IDs de CoinGecko (ej: `bitcoin`, no `BTC`).

4. **Reports son persistentes**: Los reportes generados se guardan en LibSQL y sobreviven reinicios del servidor.

5. **Timeout**: Los workflows pueden tardar 30-60 segundos. Usa `-m 120` en curl para un timeout de 2 minutos.

6. **Model Label**: Cada reporte registra el modelo utilizado (`provider/modelName`) para trazabilidad.
