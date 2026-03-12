// ─── Custom API Routes for HTML Reports & Settings ──────────────────
// Registers HTTP endpoints on the Mastra server.
//
//   GET /reports            → Dashboard with all reports (HTML)
//   GET /reports/:id        → Individual report page (HTML)
//   GET /reports/latest/:coinId → Redirect to latest report for a coin
//   DELETE /reports/:id     → Delete a report (JSON)
//   GET /workflows          → Interactive workflows page (HTML)
//   GET /settings           → Model configuration page (HTML)
//   GET /model-config       → Get current model config (JSON)
//   POST /model-config      → Save model config (JSON)
//   POST /model-config/test → Test model connection (JSON)
//   POST /model-config/reset → Reset to defaults (JSON)

import { registerApiRoute } from '@mastra/core/server';
import { generateReportHtml, generateDashboardHtml } from './html-templates';
import { listReports, getReport, getLatestReportForCoin, deleteReport } from './storage';
import { generateWorkflowsPageHtml } from './workflows-ui';
import { generateSettingsPageHtml } from './settings-ui';
import { getMaskedConfig, setModelConfig, testModelConnection, resetModelConfig, getModelConfig } from './model-config';

export const reportRoutes = [
  // ── Dashboard ──────────────────────────────────────────────────────
  registerApiRoute('/reports', {
    method: 'GET',
    handler: async (c) => {
      const filterParam = new URL(c.req.url).searchParams.get('filter');
      const filter =
        filterParam === 'analysis' || filterParam === 'scan' ? filterParam : undefined;

      const reports = await listReports();
      const html = generateDashboardHtml(reports, filter || 'all');

      return c.html(html);
    },
  }),

  // ── Latest report for a specific coin ──────────────────────────────
  registerApiRoute('/reports/latest/:coinId', {
    method: 'GET',
    handler: async (c) => {
      const coinId = c.req.param('coinId');
      const report = await getLatestReportForCoin(coinId);

      if (!report) {
        return c.html(
          `<html><body style="background:#0d1117;color:#e6edf3;font-family:sans-serif;padding:40px;text-align:center">
            <h2>No reports found for "${coinId}"</h2>
            <p><a href="/reports" style="color:#58a6ff">← Back to dashboard</a></p>
          </body></html>`,
          404,
        );
      }

      return c.redirect(`/reports/${report.id}`);
    },
  }),

  // ── Individual report page ─────────────────────────────────────────
  registerApiRoute('/reports/:id', {
    method: 'GET',
    handler: async (c) => {
      const id = c.req.param('id');
      const report = await getReport(id);

      if (!report) {
        return c.html(
          `<html><body style="background:#0d1117;color:#e6edf3;font-family:sans-serif;padding:40px;text-align:center">
            <h2>Report not found</h2>
            <p><a href="/reports" style="color:#58a6ff">← Back to dashboard</a></p>
          </body></html>`,
          404,
        );
      }

      const html = generateReportHtml(report);
      return c.html(html);
    },
  }),

  // ── Delete a report ────────────────────────────────────────────────
  registerApiRoute('/reports/:id', {
    method: 'DELETE',
    handler: async (c) => {
      const id = c.req.param('id');
      const deleted = await deleteReport(id);

      if (!deleted) {
        return c.json({ error: 'Report not found' }, 404);
      }

      return c.json({ success: true, deletedId: id });
    },
  }),

  // ── Workflows interactive page ─────────────────────────────────────
  registerApiRoute('/workflows', {
    method: 'GET',
    handler: async (c) => {
      const html = generateWorkflowsPageHtml();
      return c.html(html);
    },
  }),

  // ── Settings page ──────────────────────────────────────────────────
  registerApiRoute('/settings', {
    method: 'GET',
    handler: async (c) => {
      const html = generateSettingsPageHtml();
      return c.html(html);
    },
  }),

  // ── Get current model config (masked API key) ─────────────────────
  registerApiRoute('/model-config', {
    method: 'GET',
    handler: async (c: any) => {
      return c.json(getMaskedConfig());
    },
  }),

  // ── Save model config ─────────────────────────────────────────────
  registerApiRoute('/model-config', {
    method: 'POST',
    handler: async (c: any) => {
      try {
        const body = await c.req.json();
        const { provider, modelName, apiKey } = body;
        if (!provider || !modelName || !apiKey) {
          return c.json({ success: false, error: 'provider, modelName, and apiKey are required' }, 400);
        }
        setModelConfig({ provider, modelName, apiKey });
        return c.json({ success: true });
      } catch (err: any) {
        return c.json({ success: false, error: err.message }, 500);
      }
    },
  }),

  // ── Test model connection ─────────────────────────────────────────
  // If apiKey is empty, uses the current server config (env var default)
  registerApiRoute('/model-config/test', {
    method: 'POST',
    handler: async (c: any) => {
      try {
        const body = await c.req.json();
        const { provider, modelName, apiKey } = body;

        // If no apiKey provided, fall back to current server config
        const currentConfig = getModelConfig();
        const testConfig = {
          provider: provider || currentConfig.provider,
          modelName: modelName || currentConfig.modelName,
          apiKey: apiKey || currentConfig.apiKey,
        };

        if (!testConfig.apiKey) {
          return c.json({ ok: false, message: 'No API key available. Configure one or set a server environment variable.' }, 400);
        }

        const result = await testModelConnection(testConfig);
        return c.json(result);
      } catch (err: any) {
        return c.json({ ok: false, message: err.message }, 500);
      }
    },
  }),

  // ── Reset model config to defaults (clear in-memory) ───────────────
  registerApiRoute('/model-config/reset', {
    method: 'POST',
    handler: async (c: any) => {
      resetModelConfig();
      return c.json({ success: true });
    },
  }),
];
