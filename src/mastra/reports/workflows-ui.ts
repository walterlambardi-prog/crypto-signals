// ─── Workflows UI Page ───────────────────────────────────────────────
// Interactive web page for executing workflows via the browser.
// Matches the dark theme of the reports dashboard.

export function generateWorkflowsPageHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Workflows — Crypto Signals</title>
  <style>
    :root {
      --bg: #0d1117; --surface: #161b22; --border: #30363d;
      --text: #e6edf3; --muted: #8b949e; --accent: #58a6ff;
      --green: #3fb950; --red: #f85149; --yellow: #d29922; --purple: #bc8cff;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg); color: var(--text); line-height: 1.6; }
    .container { max-width: 960px; margin: 0 auto; padding: 24px 16px; }
    header { border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 24px;
      display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
    header h1 { font-size: 1.5rem; }
    header h1 span { color: var(--accent); }
    .meta { color: var(--muted); font-size: 0.85rem; }
    .nav-links { display: flex; gap: 12px; }
    .nav-links a { color: var(--accent); text-decoration: none; font-size: 0.9rem; }
    .nav-links a:hover { text-decoration: underline; }
    footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border);
      color: var(--muted); font-size: 0.8rem; text-align: center; }

    /* ── Workflow Cards ── */
    .workflow-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 32px; }
    @media (max-width: 700px) { .workflow-grid { grid-template-columns: 1fr; } }
    .workflow-card { background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; padding: 24px; transition: border-color 0.2s; }
    .workflow-card:hover { border-color: var(--accent); }
    .workflow-card h2 { font-size: 1.15rem; margin-bottom: 6px; display: flex; align-items: center; gap: 8px; }
    .workflow-card .desc { color: var(--muted); font-size: 0.85rem; margin-bottom: 16px; }

    .badge { display: inline-block; padding: 2px 10px; border-radius: 12px;
      font-size: 0.72rem; font-weight: 600; text-transform: uppercase; }
    .badge-analysis { background: rgba(88,166,255,0.15); color: var(--accent); }
    .badge-scan { background: rgba(188,140,255,0.15); color: var(--purple); }

    /* ── Form ── */
    .form-group { margin-bottom: 14px; }
    .form-group label { display: block; font-size: 0.82rem; color: var(--muted); margin-bottom: 4px; font-weight: 500; }
    .form-group select, .form-group input {
      width: 100%; padding: 8px 12px; border-radius: 6px;
      border: 1px solid var(--border); background: var(--bg); color: var(--text);
      font-size: 0.9rem; outline: none; transition: border-color 0.2s; }
    .form-group select:focus, .form-group input:focus { border-color: var(--accent); }

    .btn { padding: 10px 20px; border-radius: 6px; border: none; cursor: pointer;
      font-size: 0.9rem; font-weight: 600; transition: all 0.2s; display: inline-flex;
      align-items: center; gap: 6px; }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: #79b8ff; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-sm { padding: 6px 14px; font-size: 0.8rem; }

    /* ── Result Panel ── */
    .result-panel { margin-top: 20px; display: none; }
    .result-panel.visible { display: block; }
    .result-header { display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 8px; }
    .result-header h3 { font-size: 0.95rem; }
    .status-badge { padding: 3px 10px; border-radius: 12px; font-size: 0.72rem; font-weight: 600; }
    .status-running { background: rgba(210,153,34,0.2); color: var(--yellow); }
    .status-success { background: rgba(63,185,80,0.2); color: var(--green); }
    .status-failed { background: rgba(248,81,73,0.2); color: var(--red); }

    .result-content { background: var(--bg); border: 1px solid var(--border);
      border-radius: 6px; padding: 16px; font-family: 'SF Mono', Consolas, monospace;
      font-size: 0.82rem; white-space: pre-wrap; word-break: break-word;
      max-height: 400px; overflow-y: auto; line-height: 1.5; }

    .steps-timeline { margin-top: 12px; }
    .step-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px 0;
      border-bottom: 1px solid var(--border); }
    .step-item:last-child { border-bottom: none; }
    .step-icon { width: 20px; height: 20px; border-radius: 50%; display: flex;
      align-items: center; justify-content: center; font-size: 0.7rem; flex-shrink: 0; margin-top: 2px; }
    .step-icon.success { background: rgba(63,185,80,0.2); color: var(--green); }
    .step-icon.running { background: rgba(210,153,34,0.2); color: var(--yellow); }
    .step-icon.pending { background: rgba(139,148,158,0.15); color: var(--muted); }
    .step-icon.failed { background: rgba(248,81,73,0.2); color: var(--red); }
    .step-name { font-weight: 500; font-size: 0.88rem; }
    .step-detail { color: var(--muted); font-size: 0.78rem; margin-top: 2px; }

    .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--border);
      border-top-color: var(--accent); border-radius: 50%;
      animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Recent Runs ── */
    .section-title { font-size: 1.1rem; margin-bottom: 12px; margin-top: 8px; color: var(--text); }
    .runs-table { width: 100%; border-collapse: collapse; }
    .runs-table th { text-align: left; font-size: 0.78rem; color: var(--muted); font-weight: 500;
      padding: 8px 10px; border-bottom: 1px solid var(--border); }
    .runs-table td { padding: 8px 10px; font-size: 0.85rem; border-bottom: 1px solid var(--border); }
    .runs-table tr:hover td { background: rgba(88,166,255,0.04); }
    .link { color: var(--accent); text-decoration: none; cursor: pointer; }
    .link:hover { text-decoration: underline; }

    /* ── Config Required Overlay ── */
    .config-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(13,17,23,0.92); z-index: 1000; display: flex;
      align-items: center; justify-content: center; }
    .config-overlay .config-box { background: var(--surface); border: 1px solid var(--border);
      border-radius: 12px; padding: 40px; max-width: 480px; text-align: center; }
    .config-overlay h2 { font-size: 1.3rem; margin-bottom: 12px; }
    .config-overlay p { color: var(--muted); font-size: 0.9rem; margin-bottom: 24px; line-height: 1.6; }
    .config-overlay .btn-go { padding: 12px 32px; border-radius: 8px; border: none;
      background: var(--accent); color: #fff; font-size: 1rem; font-weight: 600;
      cursor: pointer; text-decoration: none; display: inline-block; }
    .config-overlay .btn-go:hover { background: #79b8ff; }
  </style>
</head>
<body>
  <div class="container">
    <!-- ── Config Required Overlay (hidden by default, shown if not configured) ── -->
    <div class="config-overlay" id="config-overlay" style="display:none;">
      <div class="config-box">
        <h2>🔐 API Key Required</h2>
        <p>You need to configure your LLM provider and API key in Settings before running workflows.<br>
        No default API key is provided for security reasons.</p>
        <a href="/settings" class="btn-go">⚙️ Go to Settings</a>
      </div>
    </div>

    <header>
      <div>
        <h1><span>🔄</span> Workflows</h1>
        <div class="nav-links">
          <a href="/reports">← Reports Dashboard</a>
          <a href="/settings">⚙️ Settings</a>
        </div>
      </div>
      <span class="meta" id="model-badge" style="cursor:pointer;" onclick="location.href='/settings'">Loading model...</span>
    </header>

    <!-- ── Workflow Cards ── -->
    <div class="workflow-grid">

      <!-- Crypto Analysis Workflow -->
      <div class="workflow-card" id="card-analysis">
        <h2>📊 Crypto Analysis <span class="badge badge-analysis">Coin</span></h2>
        <p class="desc">Fetches price data, computes technical indicators (RSI, MACD, Bollinger),
          generates an AI report, and saves it as HTML.</p>
        <div class="form-group">
          <label for="coinId">Cryptocurrency</label>
          <select id="coinId">
            <option value="bitcoin">Bitcoin (BTC)</option>
            <option value="ethereum">Ethereum (ETH)</option>
            <option value="solana">Solana (SOL)</option>
            <option value="cardano">Cardano (ADA)</option>
            <option value="ripple">XRP (XRP)</option>
            <option value="polkadot">Polkadot (DOT)</option>
            <option value="dogecoin">Dogecoin (DOGE)</option>
            <option value="avalanche-2">Avalanche (AVAX)</option>
            <option value="chainlink">Chainlink (LINK)</option>
            <option value="binancecoin">BNB (BNB)</option>
            <option value="litecoin">Litecoin (LTC)</option>
            <option value="uniswap">Uniswap (UNI)</option>
            <option value="cosmos">Cosmos (ATOM)</option>
            <option value="matic-network">Polygon (MATIC)</option>
          </select>
        </div>
        <button class="btn btn-primary" id="btn-analysis" onclick="runAnalysis()">
          ▶ Run Analysis
        </button>
        <div class="result-panel" id="result-analysis"></div>
      </div>

      <!-- Market Scan Workflow -->
      <div class="workflow-card" id="card-scan">
        <h2>🌐 Market Scan <span class="badge badge-scan">Market</span></h2>
        <p class="desc">Scans top cryptocurrencies, analyzes market conditions,
          identifies opportunities, and generates a scan report.</p>
        <div class="form-group">
          <label for="scanLimit">Number of coins to scan</label>
          <select id="scanLimit">
            <option value="5">Top 5</option>
            <option value="10" selected>Top 10</option>
            <option value="15">Top 15</option>
            <option value="20">Top 20</option>
            <option value="25">Top 25</option>
          </select>
        </div>
        <button class="btn btn-primary" id="btn-scan" onclick="runScan()">
          ▶ Run Market Scan
        </button>
        <div class="result-panel" id="result-scan"></div>
      </div>

    </div>

    <!-- ── Recent Workflow Runs ── -->
    <h2 class="section-title">📋 Recent Workflow Runs</h2>
    <div id="recent-runs" style="margin-bottom: 24px;">
      <p class="meta">Loading...</p>
    </div>

    <footer>
      Crypto Signals — Powered by Mastra AI · This is not financial advice.
    </footer>
  </div>

  <script>
    const BASE = window.location.origin;
    let isConfigured = false;

    // ── Check config status + sync from localStorage ──
    async function checkAndSyncConfig() {
      const local = localStorage.getItem('crypto-signals-model-config');
      if (local) {
        try {
          const cfg = JSON.parse(local);
          if (cfg.provider && cfg.modelName && cfg.apiKey) {
            // Sync to server memory
            await fetch(BASE + '/model-config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: local,
            });
            isConfigured = true;
            const badge = document.getElementById('model-badge');
            badge.textContent = '🤖 ' + cfg.provider + '/' + cfg.modelName;
            document.getElementById('config-overlay').style.display = 'none';
            // Enable buttons
            document.getElementById('btn-analysis').disabled = false;
            document.getElementById('btn-scan').disabled = false;
            return;
          }
        } catch {}
      }

      // Check server status as fallback
      try {
        const r = await fetch(BASE + '/model-config/status');
        const d = await r.json();
        if (d.configured) {
          isConfigured = true;
          const mr = await fetch(BASE + '/model-config');
          const md = await mr.json();
          const badge = document.getElementById('model-badge');
          badge.textContent = '🤖 ' + md.provider + '/' + md.modelName;
          document.getElementById('config-overlay').style.display = 'none';
          document.getElementById('btn-analysis').disabled = false;
          document.getElementById('btn-scan').disabled = false;
          return;
        }
      } catch {}

      // Not configured — show overlay and disable buttons
      isConfigured = false;
      document.getElementById('config-overlay').style.display = 'flex';
      document.getElementById('model-badge').textContent = '⚠️ Not Configured';
      document.getElementById('btn-analysis').disabled = true;
      document.getElementById('btn-scan').disabled = true;
    }
    checkAndSyncConfig();

    // ── Run Crypto Analysis ──
    async function runAnalysis() {
      if (!isConfigured) {
        document.getElementById('config-overlay').style.display = 'flex';
        return;
      }
      const coinId = document.getElementById('coinId').value;
      const btn = document.getElementById('btn-analysis');
      const panel = document.getElementById('result-analysis');

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Running...';
      panel.className = 'result-panel visible';
      panel.innerHTML = renderRunning('crypto-analysis-workflow',
        ['fetch-and-analyze', 'generate-analysis-report', 'save-html-report']);

      try {
        const res = await fetch(BASE + '/api/workflows/crypto-analysis-workflow/start-async', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputData: { coinId } }),
        });
        const data = await res.json();
        panel.innerHTML = renderResult(data, 'analysis');
      } catch (err) {
        panel.innerHTML = renderError(err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '▶ Run Analysis';
        loadRecentRuns();
      }
    }

    // ── Run Market Scan ──
    async function runScan() {
      if (!isConfigured) {
        document.getElementById('config-overlay').style.display = 'flex';
        return;
      }
      const limit = parseInt(document.getElementById('scanLimit').value);
      const btn = document.getElementById('btn-scan');
      const panel = document.getElementById('result-scan');

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Running...';
      panel.className = 'result-panel visible';
      panel.innerHTML = renderRunning('market-scan-workflow',
        ['fetch-market-snapshot', 'identify-opportunities', 'save-scan-html-report']);

      try {
        const res = await fetch(BASE + '/api/workflows/market-scan-workflow/start-async', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inputData: { limit } }),
        });
        const data = await res.json();
        panel.innerHTML = renderResult(data, 'scan');
      } catch (err) {
        panel.innerHTML = renderError(err.message);
      } finally {
        btn.disabled = false;
        btn.innerHTML = '▶ Run Market Scan';
        loadRecentRuns();
      }
    }

    // ── Render: Running State ──
    function renderRunning(name, steps) {
      const stepsHtml = steps.map(s =>
        '<div class="step-item">' +
          '<div class="step-icon running"><span class="spinner" style="width:12px;height:12px;border-width:1.5px;"></span></div>' +
          '<div><div class="step-name">' + s + '</div>' +
          '<div class="step-detail">Waiting...</div></div></div>'
      ).join('');
      return '<div class="result-header">' +
        '<h3>' + name + '</h3>' +
        '<span class="status-badge status-running"><span class="spinner" style="width:10px;height:10px;border-width:1.5px;"></span> Running</span>' +
        '</div><div class="steps-timeline">' + stepsHtml + '</div>';
    }

    // ── Render: Final Result ──
    function renderResult(data, type) {
      const status = data.status || 'unknown';
      const statusClass = status === 'success' ? 'status-success' : 'status-failed';
      const statusIcon = status === 'success' ? '✓' : '✗';
      const steps = data.steps || {};

      let stepsHtml = '';
      for (const [name, step] of Object.entries(steps)) {
        if (name === 'input') continue;
        const s = step;
        const icon = s.status === 'success' ? 'success' : (s.status === 'failed' ? 'failed' : 'pending');
        const iconChar = s.status === 'success' ? '✓' : (s.status === 'failed' ? '✗' : '○');
        let detail = '';
        if (s.output) {
          if (s.output.overallSignal) {
            detail = 'Signal: ' + s.output.overallSignal + ' | Score: ' + s.output.signalScore + '/100';
          } else if (s.output.reportUrl) {
            detail = '<a class="link" href="' + s.output.reportUrl + '" target="_blank">View Report →</a>';
          } else if (s.output.reportId) {
            detail = 'Report saved: ' + s.output.reportId;
          }
          if (s.output.currentPrice) {
            detail = '$' + Number(s.output.currentPrice).toLocaleString() + ' | ' + detail;
          }
        }
        if (s.status === 'failed' && s.error) {
          const errMsg = typeof s.error === 'string' ? s.error
            : (s.error.message || JSON.stringify(s.error));
          detail = '<span style="color:var(--red)">' + escHtml(errMsg) + '</span>';
        }
        const duration = (s.startedAt && s.endedAt) ? ((s.endedAt - s.startedAt) / 1000).toFixed(1) + 's' : '';
        stepsHtml += '<div class="step-item">' +
          '<div class="step-icon ' + icon + '">' + iconChar + '</div>' +
          '<div style="flex:1"><div class="step-name">' + name +
          (duration ? ' <span class="meta">(' + duration + ')</span>' : '') +
          '</div>' +
          (detail ? '<div class="step-detail">' + detail + '</div>' : '') +
          '</div></div>';
      }

      // Find report URL
      let reportLink = '';
      for (const step of Object.values(steps)) {
        if (step && step.output && step.output.reportUrl) {
          reportLink = '<a class="btn btn-sm btn-primary" href="' + step.output.reportUrl +
            '" target="_blank" style="margin-top:12px;text-decoration:none;">📄 View Report</a>';
          break;
        }
      }

      return '<div class="result-header">' +
        '<h3>Result</h3>' +
        '<span class="status-badge ' + statusClass + '">' + statusIcon + ' ' + status + '</span>' +
        '</div><div class="steps-timeline">' + stepsHtml + '</div>' + reportLink;
    }

    // ── Render: Error ──
    function renderError(msg) {
      return '<div class="result-header">' +
        '<h3>Result</h3>' +
        '<span class="status-badge status-failed">✗ Error</span>' +
        '</div><div class="result-content" style="color:var(--red)">' + escHtml(msg) + '</div>';
    }

    // ── Load Recent Runs ──
    async function loadRecentRuns() {
      const container = document.getElementById('recent-runs');
      try {
        const [analysisRes, scanRes] = await Promise.all([
          fetch(BASE + '/api/workflows/crypto-analysis-workflow/runs').then(r => r.json()),
          fetch(BASE + '/api/workflows/market-scan-workflow/runs').then(r => r.json()),
        ]);

        const allRuns = [
          ...(analysisRes.runs || []).map(r => ({ ...r, workflow: 'crypto-analysis' })),
          ...(scanRes.runs || []).map(r => ({ ...r, workflow: 'market-scan' })),
        ].sort((a, b) => {
          const tA = a.snapshot?.completedAt || a.snapshot?.createdAt || 0;
          const tB = b.snapshot?.completedAt || b.snapshot?.createdAt || 0;
          return tB - tA;
        }).slice(0, 15);

        if (allRuns.length === 0) {
          container.innerHTML = '<p class="meta" style="text-align:center;padding:20px;">No workflow runs yet. Execute a workflow above to get started.</p>';
          return;
        }

        let rows = '';
        for (const run of allRuns) {
          const snap = run.snapshot || {};
          const status = snap.status || 'unknown';
          const statusClass = status === 'success' ? 'status-success'
            : (status === 'failed' ? 'status-failed' : 'status-running');
          const statusIcon = status === 'success' ? '✓' : (status === 'failed' ? '✗' : '●');
          const badgeClass = run.workflow === 'crypto-analysis' ? 'badge-analysis' : 'badge-scan';
          const badgeLabel = run.workflow === 'crypto-analysis' ? 'Analysis' : 'Scan';

          // Extract input info
          let inputInfo = '—';
          const inputStep = snap.context?.steps?.input;
          if (inputStep) {
            if (inputStep.coinId) inputInfo = inputStep.coinId;
            else if (inputStep.limit) inputInfo = 'Top ' + inputStep.limit;
          }

          // Check for report URL
          let reportLink = '';
          if (snap.context?.steps) {
            for (const step of Object.values(snap.context.steps)) {
              if (step && typeof step === 'object' && step.output && step.output.reportUrl) {
                reportLink = '<a class="link" href="' + step.output.reportUrl + '">View</a>';
                break;
              }
            }
          }

          const ts = snap.completedAt || snap.createdAt;
          const dateStr = ts ? new Date(ts).toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' }) : '—';

          rows += '<tr>' +
            '<td><span class="badge ' + badgeClass + '">' + badgeLabel + '</span></td>' +
            '<td>' + inputInfo + '</td>' +
            '<td><span class="status-badge ' + statusClass + '">' + statusIcon + ' ' + status + '</span></td>' +
            '<td class="meta">' + dateStr + '</td>' +
            '<td>' + reportLink + '</td>' +
            '</tr>';
        }

        container.innerHTML =
          '<table class="runs-table">' +
          '<thead><tr><th>Type</th><th>Input</th><th>Status</th><th>Date</th><th>Report</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table>';

      } catch (err) {
        container.innerHTML = '<p class="meta" style="color:var(--red)">Error loading runs: ' + escHtml(err.message) + '</p>';
      }
    }

    // ── Utils ──
    function escHtml(str) {
      const d = document.createElement('div');
      d.textContent = str;
      return d.innerHTML;
    }

    // ── Init ──
    loadRecentRuns();
  </script>
</body>
</html>`;
}
