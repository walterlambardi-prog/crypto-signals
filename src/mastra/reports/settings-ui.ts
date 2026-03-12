// ─── Settings UI Page ─────────────────────────────────────────────────
// Interactive page for configuring the LLM model and API key.
// Settings are saved to both localStorage (browser) and server (JSON file).

import { AVAILABLE_MODELS } from './model-config';

export function generateSettingsPageHtml(): string {
  // Serialize the available models for client-side use
  const modelsJson = JSON.stringify(AVAILABLE_MODELS);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Settings — Crypto Signals</title>
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

    /* ── Card ── */
    .card { background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; padding: 24px; margin-bottom: 20px; }
    .card h2 { font-size: 1.1rem; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }

    /* ── Form ── */
    .form-group { margin-bottom: 16px; }
    .form-group label { display: block; font-size: 0.85rem; color: var(--muted); margin-bottom: 6px;
      font-weight: 500; }
    .form-group select, .form-group input {
      width: 100%; padding: 10px 14px; border-radius: 6px;
      border: 1px solid var(--border); background: var(--bg); color: var(--text);
      font-size: 0.92rem; outline: none; transition: border-color 0.2s; }
    .form-group select:focus, .form-group input:focus { border-color: var(--accent); }
    .form-group .hint { font-size: 0.78rem; color: var(--muted); margin-top: 4px; }

    .api-key-wrapper { position: relative; }
    .api-key-wrapper input { padding-right: 40px; }
    .toggle-vis { position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
      background: none; border: none; color: var(--muted); cursor: pointer; font-size: 1.1rem; }
    .toggle-vis:hover { color: var(--text); }

    /* ── Buttons ── */
    .btn-row { display: flex; gap: 10px; margin-top: 20px; }
    .btn { padding: 10px 20px; border-radius: 6px; border: none; cursor: pointer;
      font-size: 0.9rem; font-weight: 600; transition: all 0.2s; display: inline-flex;
      align-items: center; gap: 6px; }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary:hover { background: #79b8ff; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: transparent; border: 1px solid var(--border); color: var(--text); }
    .btn-secondary:hover { border-color: var(--accent); color: var(--accent); }
    .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-danger { background: transparent; border: 1px solid var(--red); color: var(--red); }
    .btn-danger:hover { background: rgba(248,81,73,0.1); }

    /* ── Status ── */
    .status-msg { margin-top: 16px; padding: 12px 16px; border-radius: 6px; font-size: 0.85rem;
      display: none; }
    .status-msg.visible { display: block; }
    .status-msg.success { background: rgba(63,185,80,0.1); border: 1px solid rgba(63,185,80,0.3);
      color: var(--green); }
    .status-msg.error { background: rgba(248,81,73,0.1); border: 1px solid rgba(248,81,73,0.3);
      color: var(--red); }
    .status-msg.info { background: rgba(88,166,255,0.1); border: 1px solid rgba(88,166,255,0.3);
      color: var(--accent); }

    /* ── Current Config Badge ── */
    .current-config { display: flex; align-items: center; gap: 10px; padding: 12px 16px;
      background: rgba(88,166,255,0.06); border: 1px solid rgba(88,166,255,0.2);
      border-radius: 8px; margin-bottom: 20px; }
    .current-config .badge { display: inline-block; padding: 3px 10px; border-radius: 12px;
      font-size: 0.75rem; font-weight: 600; background: rgba(88,166,255,0.15); color: var(--accent); }
    .current-config .model-name { font-weight: 600; font-size: 0.92rem; }
    .current-config .key-hint { color: var(--muted); font-size: 0.82rem; }

    .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--border);
      border-top-color: var(--accent); border-radius: 50%;
      animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1><span>⚙️</span> Settings</h1>
        <div class="nav-links">
          <a href="/reports">← Reports</a>
          <a href="/workflows">Workflows</a>
        </div>
      </div>
      <span class="meta">Model Configuration</span>
    </header>

    <!-- ── Current Config ── -->
    <div class="current-config" id="current-config">
      <span>Status:</span>
      <span class="badge" id="cc-status" style="background:rgba(248,81,73,0.15);color:var(--red);">Not Configured</span>
      <span class="badge" id="cc-provider" style="display:none;">—</span>
      <span class="model-name" id="cc-model">—</span>
      <span class="key-hint" id="cc-key">—</span>
    </div>

    <!-- ── Config Form ── -->
    <div class="card">
      <h2>🤖 LLM Model</h2>

      <div class="form-group">
        <label for="provider">Provider</label>
        <select id="provider" onchange="onProviderChange()">
          <option value="google">Google Gemini</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
      </div>

      <div class="form-group">
        <label for="modelName">Model</label>
        <select id="modelName"></select>
      </div>

      <div class="form-group">
        <label for="apiKey">API Key</label>
        <div class="api-key-wrapper">
          <input type="password" id="apiKey" placeholder="Enter your API key" autocomplete="off" />
          <button class="toggle-vis" onclick="toggleKeyVis()" title="Toggle visibility">👁</button>
        </div>
        <div class="hint" id="envHint">Google: GOOGLE_GENERATIVE_AI_API_KEY</div>
      </div>

      <div class="btn-row">
        <button class="btn btn-primary" id="btn-save" onclick="saveConfig()">💾 Save</button>
        <button class="btn btn-secondary" id="btn-test" onclick="testConnection()">🔌 Test Connection</button>
        <button class="btn btn-danger" id="btn-reset" onclick="resetConfig()">↺ Clear Configuration</button>
      </div>

      <div class="status-msg" id="status-msg"></div>
    </div>

    <!-- ── Info ── -->
    <div class="card">
      <h2>ℹ️ How it works</h2>
      <ul style="color:var(--muted);font-size:0.85rem;padding-left:20px;line-height:1.8;">
        <li><strong>You must configure your own API key</strong> before workflows can run. There is no default key.</li>
        <li>Your API key is stored <strong>only in your browser</strong> (localStorage). It is <strong>never saved to disk</strong> on the server.</li>
        <li>On each page load, your browser syncs the config to <strong>server memory</strong> so workflows can use it.</li>
        <li>If the server restarts, the config is automatically re-synced from your browser on your next visit.</li>
        <li>Use <strong>Test Connection</strong> to verify your API key works before saving.</li>
        <li>The <strong>Clear Configuration</strong> button removes the key from both browser and server memory. Workflows will stop working until you configure a new key.</li>
      </ul>
    </div>

    <footer>
      Crypto Signals — Powered by Mastra AI · This is not financial advice.
    </footer>
  </div>

  <script>
    const BASE = window.location.origin;
    const MODELS = ${modelsJson};

    const ENV_HINTS = {
      google: 'Google: GOOGLE_GENERATIVE_AI_API_KEY',
      openai: 'OpenAI: OPENAI_API_KEY',
      anthropic: 'Anthropic: ANTHROPIC_API_KEY',
    };

    // ── Populate models dropdown ──
    function onProviderChange() {
      const provider = document.getElementById('provider').value;
      const modelSelect = document.getElementById('modelName');
      const models = MODELS[provider]?.models || [];
      modelSelect.innerHTML = models.map(m =>
        '<option value="' + m.id + '">' + m.label + '</option>'
      ).join('');
      document.getElementById('envHint').textContent = ENV_HINTS[provider] || '';
    }

    // ── Toggle API key visibility ──
    function toggleKeyVis() {
      const input = document.getElementById('apiKey');
      input.type = input.type === 'password' ? 'text' : 'password';
    }

    // ── Show status message ──
    function showStatus(msg, type) {
      const el = document.getElementById('status-msg');
      el.textContent = msg;
      el.className = 'status-msg visible ' + type;
      if (type === 'success') setTimeout(() => { el.className = 'status-msg'; }, 5000);
    }

    // ── Load current config ──
    // localStorage is the source of truth. On load, re-sync to server (in-memory).
    async function loadConfig() {
      const local = localStorage.getItem('crypto-signals-model-config');
      if (local) {
        try {
          const cfg = JSON.parse(local);
          applyConfigToForm(cfg);

          // Re-sync to server memory (key never saved to disk)
          await fetch(BASE + '/model-config', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: local,
          });

          // Update current config display
          const key = cfg.apiKey || '';
          const hint = key.length > 8 ? key.slice(0, 4) + '••••' + key.slice(-4) : '••••••••';
          document.getElementById('cc-provider').textContent = MODELS[cfg.provider]?.label || cfg.provider;
          document.getElementById('cc-model').textContent = cfg.modelName;
          document.getElementById('cc-key').textContent = 'Key: ' + hint;
          return;
        } catch {}
      }

      // No localStorage — show server defaults (env-based)
      try {
        const res = await fetch(BASE + '/model-config');
        const data = await res.json();
        document.getElementById('cc-provider').textContent = MODELS[data.provider]?.label || data.provider;
        document.getElementById('cc-model').textContent = data.modelName;
        document.getElementById('cc-key').textContent = 'Key: ' + data.apiKeyHint;
        applyConfigToForm({ provider: data.provider, modelName: data.modelName, apiKey: '' });
      } catch (err) {
        console.error('Failed to load server config:', err);
      }
    }

    function applyConfigToForm(cfg) {
      document.getElementById('provider').value = cfg.provider || 'google';
      onProviderChange();
      if (cfg.modelName) {
        document.getElementById('modelName').value = cfg.modelName;
      }
      if (cfg.apiKey) {
        document.getElementById('apiKey').value = cfg.apiKey;
      }
    }

    // ── Save config ──
    // Save to localStorage (persistent) + server memory (ephemeral)
    async function saveConfig() {
      const config = getFormConfig();
      if (!config.apiKey) {
        showStatus('API key is required.', 'error');
        return;
      }

      const btn = document.getElementById('btn-save');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Saving...';

      try {
        // 1. Save to localStorage (source of truth)
        localStorage.setItem('crypto-signals-model-config', JSON.stringify(config));

        // 2. Sync to server memory
        const res = await fetch(BASE + '/model-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        const data = await res.json();

        if (data.success) {
          showStatus('Configuration saved! (stored in browser, synced to server memory)', 'success');
          loadConfig();
        } else {
          showStatus('Saved to browser, but server sync failed: ' + (data.error || 'Unknown error'), 'error');
        }
      } catch (err) {
        // localStorage save succeeded even if server fails
        showStatus('Saved to browser. Server sync error: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '💾 Save';
      }
    }

    // ── Test connection ──
    async function testConnection() {
      const config = getFormConfig();
      if (!config.apiKey) {
        showStatus('API key is required to test the connection.', 'error');
        return;
      }
      const label = config.provider + '/' + config.modelName;

      const btn = document.getElementById('btn-test');
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Testing...';
      showStatus('Testing connection to ' + label + '...', 'info');

      try {
        const res = await fetch(BASE + '/model-config/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(config),
        });
        const data = await res.json();

        if (data.ok) {
          showStatus('✓ ' + data.message, 'success');
        } else {
          showStatus('✗ ' + data.message, 'error');
        }
      } catch (err) {
        showStatus('Error: ' + err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.innerHTML = '🔌 Test Connection';
      }
    }

    // ── Reset to default ──
    async function resetConfig() {
      if (!confirm('Clear configuration? Workflows will stop working until you set a new API key.')) return;

      // Clear localStorage
      localStorage.removeItem('crypto-signals-model-config');
      document.getElementById('apiKey').value = '';

      // Clear server memory
      try {
        await fetch(BASE + '/model-config/reset', { method: 'POST' });
      } catch {}

      showStatus('Configuration cleared. Please configure a new API key to use workflows.', 'info');
      setNotConfiguredUI();
    }

    // ── Get form values ──
    function getFormConfig() {
      return {
        provider: document.getElementById('provider').value,
        modelName: document.getElementById('modelName').value,
        apiKey: document.getElementById('apiKey').value.trim(),
      };
    }

    // ── Init ──
    onProviderChange();
    loadConfig();
  </script>
</body>
</html>`;
}
