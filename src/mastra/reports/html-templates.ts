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
    border-radius: 8px; padding: 28px 32px; word-wrap: break-word; line-height: 1.8; }
  .report-body p { margin: 10px 0; }
  .report-body h1, .report-body h2, .report-body h3 {
    color: var(--accent); margin-top: 24px; margin-bottom: 10px; }
  .report-body h1 { font-size: 1.5rem; border-bottom: 1px solid var(--border); padding-bottom: 10px; }
  .report-body h2 { font-size: 1.3rem; }
  .report-body h3 { font-size: 1.1rem; color: var(--purple); }
  .report-body strong { color: var(--text); }
  .report-body ul, .report-body ol { padding-left: 24px; margin: 12px 0; }
  .report-body li { margin: 6px 0; line-height: 1.7; }
  .report-body code { background: rgba(110,118,129,0.2); padding: 2px 6px;
    border-radius: 4px; font-size: 0.9em; }
  .report-body blockquote { border-left: 3px solid var(--yellow); padding-left: 14px;
    color: var(--muted); margin: 14px 0; background: rgba(210,153,34,0.05);
    padding: 10px 14px; border-radius: 0 6px 6px 0; }
  .report-body table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 0.92em; }
  .report-body th { background: var(--bg); color: var(--accent); text-align: left;
    padding: 10px 12px; border-bottom: 2px solid var(--border); font-weight: 600; }
  .report-body td { padding: 8px 12px; border-bottom: 1px solid var(--border); }
  .report-body tr:hover td { background: rgba(88,166,255,0.04); }
  .report-body hr { border: none; border-top: 1px solid var(--border); margin: 20px 0; }
  .signal-badge { display: inline-block; padding: 2px 10px; border-radius: 10px;
    font-size: 0.8em; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
  .signal-buy { background: rgba(63,185,80,0.15); color: var(--green); }
  .signal-sell { background: rgba(248,81,73,0.15); color: var(--red); }
  .signal-hold { background: rgba(210,153,34,0.15); color: var(--yellow); }
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
  // ── Pre-process pipe tables before HTML escaping ──
  const tablePlaceholders: string[] = [];
  let processed = text.replaceAll(
    /(?:^|\n)((?:\|.+\|[ \t]*\n){2,})/g,
    (_match, tableBlock: string) => {
      const rows = tableBlock.trim().split('\n').filter((r: string) => r.trim());
      if (rows.length < 2) return tableBlock;

      // Check if row 2 is a separator (e.g., |---|---|)
      const isSep = /^\|[\s\-:|]+\|$/.test(rows[1].trim());
      const dataRows = isSep ? [rows[0], ...rows.slice(2)] : rows;
      const headerRow = dataRows[0];
      const bodyRows = dataRows.slice(1);

      const parseCells = (row: string) =>
        row.split('|').slice(1, -1).map((c: string) => c.trim());

      let tableHtml = '<table><thead><tr>';
      for (const cell of parseCells(headerRow)) {
        tableHtml += `<th>${cell}</th>`;
      }
      tableHtml += '</tr></thead><tbody>';
      for (const row of bodyRows) {
        tableHtml += '<tr>';
        for (const cell of parseCells(row)) {
          tableHtml += `<td>${cell}</td>`;
        }
        tableHtml += '</tr>';
      }
      tableHtml += '</tbody></table>';

      const idx = tablePlaceholders.length;
      tablePlaceholders.push(tableHtml);
      return `\n%%TABLE_${idx}%%\n`;
    },
  );

  let html = processed
    // Escape HTML entities
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    // Headers
    .replaceAll(/^### (.+)$/gm, '<h3>$1</h3>')
    .replaceAll(/^## (.+)$/gm, '<h2>$1</h2>')
    .replaceAll(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold & italic
    .replaceAll(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replaceAll(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replaceAll(/`(.+?)`/g, '<code>$1</code>')
    // Blockquotes
    .replaceAll(/^&gt; (.+)$/gm, '<blockquote>$1</blockquote>')
    // List items
    .replaceAll(/^[•\-*] (.+)$/gm, '<li>$1</li>')
    .replaceAll(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Horizontal rules
    .replaceAll(/^---$/gm, '<hr>')
    // Paragraphs & line breaks
    .replaceAll('\n\n', '</p><p>')
    .replaceAll('\n', '<br>');

  // Wrap consecutive <li> in <ul>
  html = html.replaceAll(/((<li>.*?<\/li>(<br>)?)+)/g, '<ul>$1</ul>');
  html = html.replaceAll(/<ul>(\s*<br>)*/g, '<ul>');
  html = html.replaceAll(/(<br>)*\s*<\/ul>/g, '</ul>');

  // ── Signal word highlighting ──
  html = html.replaceAll(/\b(STRONG_BUY|STRONG BUY)\b/g,
    '<span class="signal-badge signal-buy">STRONG BUY</span>');
  html = html.replaceAll(/\b(STRONG_SELL|STRONG SELL)\b/g,
    '<span class="signal-badge signal-sell">STRONG SELL</span>');
  html = html.replaceAll(/\bBUY\b(?![^<]*<\/span>)/g,
    '<span class="signal-badge signal-buy">BUY</span>');
  html = html.replaceAll(/\bSELL\b(?![^<]*<\/span>)/g,
    '<span class="signal-badge signal-sell">SELL</span>');
  html = html.replaceAll(/\bHOLD\b/g,
    '<span class="signal-badge signal-hold">HOLD</span>');
  html = html.replaceAll(/\b(BULLISH)\b/g,
    '<span style="color: var(--green); font-weight: 600;">BULLISH</span>');
  html = html.replaceAll(/\b(BEARISH)\b/g,
    '<span style="color: var(--red); font-weight: 600;">BEARISH</span>');
  html = html.replaceAll(/\b(OVERSOLD)\b/g,
    '<span style="color: var(--green); font-weight: 600;">OVERSOLD</span>');
  html = html.replaceAll(/\b(OVERBOUGHT)\b/g,
    '<span style="color: var(--red); font-weight: 600;">OVERBOUGHT</span>');

  // ── Restore table placeholders ──
  for (let i = 0; i < tablePlaceholders.length; i++) {
    html = html.replace(`%%TABLE_${i}%%`, tablePlaceholders[i]);
  }

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
  modelLabel?: string;
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
    (function() {
      // Check if model is configured from localStorage only (no server sync)
      let configured = false;
      try {
        const local = localStorage.getItem('crypto-signals-model-config');
        if (local) {
          const cfg = JSON.parse(local);
          configured = !!(cfg.provider && cfg.modelName && cfg.apiKey);
        }
      } catch {}
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
              const modelTag = r.modelLabel
                ? `<span style="font-size:0.75rem;color:var(--muted);background:rgba(110,118,129,0.15);padding:2px 8px;border-radius:10px;">${escapeHtml(r.modelLabel)}</span>`
                : '';
              return `<li class="report-item">
                <a href="/reports/${r.id}">${escapeHtml(r.title)}</a>
                <div class="report-meta">
                  ${modelTag}
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
  <script>
    (function() {
      let configured = false;
      try {
        const local = localStorage.getItem('crypto-signals-model-config');
        if (local) {
          const cfg = JSON.parse(local);
          configured = !!(cfg.provider && cfg.modelName && cfg.apiKey);
        }
      } catch {}
      if (!configured) {
        document.getElementById('config-banner').style.display = 'block';
      }
    })();
  </script>
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
