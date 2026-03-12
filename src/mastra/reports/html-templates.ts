// ─── HTML Report Templates ───────────────────────────────────────────
// Generates styled HTML pages from workflow report data.

const CSS = `
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
  .badge { display: inline-block; padding: 2px 10px; border-radius: 12px;
    font-size: 0.75rem; font-weight: 600; text-transform: uppercase; }
  .badge-analysis { background: rgba(88,166,255,0.15); color: var(--accent); }
  .badge-scan { background: rgba(188,140,255,0.15); color: var(--purple); }
  .meta { color: var(--muted); font-size: 0.85rem; }
  .report-body { background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 24px; white-space: pre-wrap; word-wrap: break-word; }
  .report-body h1, .report-body h2, .report-body h3 {
    color: var(--accent); margin-top: 20px; margin-bottom: 8px; }
  .report-body h1 { font-size: 1.4rem; border-bottom: 1px solid var(--border); padding-bottom: 8px; }
  .report-body h2 { font-size: 1.2rem; }
  .report-body h3 { font-size: 1.05rem; color: var(--purple); }
  .report-body strong { color: var(--text); }
  .report-body ul, .report-body ol { padding-left: 20px; margin: 8px 0; }
  .report-body li { margin: 4px 0; }
  .report-body code { background: rgba(110,118,129,0.2); padding: 2px 6px;
    border-radius: 4px; font-size: 0.9em; }
  .report-body blockquote { border-left: 3px solid var(--yellow); padding-left: 12px;
    color: var(--muted); margin: 12px 0; }
  .back-link { display: inline-block; margin-bottom: 16px; color: var(--accent);
    text-decoration: none; font-size: 0.9rem; }
  .back-link:hover { text-decoration: underline; }
  footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid var(--border);
    color: var(--muted); font-size: 0.8rem; text-align: center; }
`;

const DASHBOARD_CSS = `
  ${CSS}
  .stats { display: grid; grid-template-columns: repeat(5, 1fr);
    gap: 8px; margin-bottom: 24px; }
  .stat-card { background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 12px 8px; text-align: center; }
  .stat-card .number { font-size: 1.4rem; font-weight: 700; color: var(--accent); }
  .stat-card .label { font-size: 0.75rem; color: var(--muted); margin-top: 2px; }
  .report-list { list-style: none; }
  .report-item { background: var(--surface); border: 1px solid var(--border);
    border-radius: 8px; padding: 16px; margin-bottom: 8px;
    display: flex; justify-content: space-between; align-items: center;
    transition: border-color 0.2s; }
  .report-item:hover { border-color: var(--accent); }
  .report-item a { color: var(--text); text-decoration: none; font-weight: 500; flex: 1; }
  .report-item a:hover { color: var(--accent); }
  .report-item .report-meta { display: flex; gap: 12px; align-items: center; }
  .empty { text-align: center; color: var(--muted); padding: 48px 0; }
  .empty p { margin-top: 8px; }
  .tabs { display: flex; gap: 8px; margin-bottom: 20px; }
  .tab { padding: 6px 16px; border-radius: 6px; border: 1px solid var(--border);
    background: transparent; color: var(--muted); cursor: pointer; font-size: 0.85rem;
    text-decoration: none; }
  .tab.active, .tab:hover { background: var(--surface); color: var(--text); border-color: var(--accent); }
`;

// ─── Markdown-like to HTML conversion ────────────────────────────────

function markdownToHtml(text: string): string {
  let html = text
    // Escape HTML entities first
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    // Headers (### before ## before #)
    .replaceAll(/^### (.+)$/gm, '<h3>$1</h3>')
    .replaceAll(/^## (.+)$/gm, '<h2>$1</h2>')
    .replaceAll(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replaceAll(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replaceAll(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replaceAll(/`(.+?)`/g, '<code>$1</code>')
    // Blockquotes
    .replaceAll(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    // Unordered list items
    .replaceAll(/^[•\-*] (.+)$/gm, '<li>$1</li>')
    // Numbered list items
    .replaceAll(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Horizontal rules
    .replaceAll(/^---$/gm, '<hr style="border: none; border-top: 1px solid var(--border); margin: 16px 0;">')
    // Line breaks
    .replaceAll('\n\n', '</p><p>')
    .replaceAll('\n', '<br>');

  // Wrap consecutive <li> in <ul>
  html = html.replaceAll(/((<li>.*?<\/li>(<br>)?)+)/g, '<ul>$1</ul>');
  html = html.replaceAll(/<ul>(\s*<br>)*/g, '<ul>');
  html = html.replaceAll(/(<br>)*\s*<\/ul>/g, '</ul>');

  return `<p>${html}</p>`;
}

// ─── Report Page ─────────────────────────────────────────────────────

export interface ReportData {
  id: string;
  type: 'analysis' | 'scan';
  title: string;
  report: string;
  createdAt: string;
  coinId?: string;
}

export function generateReportHtml(data: ReportData): string {
  const badgeClass = data.type === 'analysis' ? 'badge-analysis' : 'badge-scan';
  const badgeLabel = data.type === 'analysis' ? 'Coin Analysis' : 'Market Scan';
  const dateStr = new Date(data.createdAt).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(data.title)} — Crypto Signals</title>
  <style>${CSS}</style>
</head>
<body>
  <div class="container">
    <a href="/reports" class="back-link">← All Reports</a>
    <header>
      <div>
        <h1><span>📊</span> ${escapeHtml(data.title)}</h1>
        <p class="meta">${dateStr}</p>
      </div>
      <span class="badge ${badgeClass}">${badgeLabel}</span>
    </header>
    <div class="report-body">
      ${markdownToHtml(data.report)}
    </div>
    <footer>
      Crypto Signals — Powered by Mastra AI · This is not financial advice.
    </footer>
  </div>  <script>
    (async function() {
      // Check if model is configured — show banner if not
      const local = localStorage.getItem('crypto-signals-model-config');
      let configured = false;
      if (local) {
        try {
          const cfg = JSON.parse(local);
          if (cfg.provider && cfg.modelName && cfg.apiKey) {
            configured = true;
            // Sync to server
            await fetch(window.location.origin + '/model-config', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: local,
            });
          }
        } catch {}
      }
      if (!configured) {
        try {
          const r = await fetch(window.location.origin + '/model-config/status');
          const d = await r.json();
          configured = d.configured;
        } catch {}
      }
      if (!configured) {
        document.getElementById('config-banner').style.display = 'block';
      }
    })();
  </script></body>
</html>`;
}

// ─── Dashboard Page ──────────────────────────────────────────────────

export function generateDashboardHtml(
  reports: ReportData[],
  filter: 'all' | 'analysis' | 'scan' = 'all',
): string {
  const currentFilter = filter;
  const filtered =
    currentFilter === 'all'
      ? reports
      : reports.filter((r) => r.type === currentFilter);

  const analysisCount = reports.filter((r) => r.type === 'analysis').length;
  const scanCount = reports.filter((r) => r.type === 'scan').length;

  const reportListHtml =
    filtered.length === 0
      ? `<div class="empty">
          <p style="font-size: 2rem;">📭</p>
          <p>No reports yet. Run a workflow to generate your first report.</p>
        </div>`
      : `<ul class="report-list">
          ${filtered
            .map((r) => {
              const badge = r.type === 'analysis' ? 'badge-analysis' : 'badge-scan';
              const label = r.type === 'analysis' ? 'Analysis' : 'Scan';
              const date = new Date(r.createdAt).toLocaleString('en-US', {
                dateStyle: 'short',
                timeStyle: 'short',
              });
              return `<li class="report-item">
                <a href="/reports/${r.id}">${escapeHtml(r.title)}</a>
                <div class="report-meta">
                  <span class="badge ${badge}">${label}</span>
                  <span class="meta">${date}</span>
                </div>
              </li>`;
            })
            .join('\n')}
        </ul>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reports Dashboard — Crypto Signals</title>
  <style>${DASHBOARD_CSS}</style>
</head>
<body>
  <div class="container">
    <header>
      <h1><span>⚡</span> Crypto Signals Reports</h1>
      <span class="meta">Powered by Mastra AI</span>
    </header>

    <!-- Config Warning Banner (shown via JS if not configured) -->
    <div id="config-banner" style="display:none;background:rgba(248,81,73,0.08);border:1px solid rgba(248,81,73,0.3);border-radius:8px;padding:14px 20px;margin-bottom:20px;">
      <span style="color:#f85149;font-weight:600;">⚠️ API Key Not Configured</span>
      <span style="color:#8b949e;font-size:0.85rem;margin-left:8px;">Configure your API key in <a href="/settings" style="color:#58a6ff;">Settings</a> before running workflows.</span>
    </div>

    <div class="stats">
      <div class="stat-card">
        <div class="number">${reports.length}</div>
        <div class="label">Total Reports</div>
      </div>
      <div class="stat-card">
        <div class="number">${analysisCount}</div>
        <div class="label">Coin Analyses</div>
      </div>
      <div class="stat-card">
        <div class="number">${scanCount}</div>
        <div class="label">Market Scans</div>
      </div>
      <a href="/workflows" class="stat-card" style="text-decoration:none;cursor:pointer;border-color:var(--accent);">
        <div class="number" style="font-size:1.5rem;">🔄</div>
        <div class="label" style="color:var(--accent);font-weight:600;">Run Workflows</div>
      </a>
      <a href="/settings" class="stat-card" style="text-decoration:none;cursor:pointer;border-color:var(--purple);">
        <div class="number" style="font-size:1.5rem;">⚙️</div>
        <div class="label" style="color:var(--purple);font-weight:600;">Settings</div>
      </a>
    </div>

    <div class="tabs">
      <a href="/reports" class="tab ${currentFilter === 'all' ? 'active' : ''}">All</a>
      <a href="/reports?filter=analysis" class="tab ${currentFilter === 'analysis' ? 'active' : ''}">Analyses</a>
      <a href="/reports?filter=scan" class="tab ${currentFilter === 'scan' ? 'active' : ''}">Market Scans</a>
    </div>

    ${reportListHtml}

    <footer>
      Crypto Signals — Powered by Mastra AI · This is not financial advice.
    </footer>
  </div>
</body>
</html>`;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
