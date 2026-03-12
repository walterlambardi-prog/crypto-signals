// ─── Custom API Routes for HTML Reports & Settings ──────────────────
// Registers HTTP endpoints on the Mastra server.
//
//   GET /reports            → Dashboard with all reports (HTML)
//   GET /reports/:id        → Individual report page (HTML)
//   GET /reports/latest/:coinId → Redirect to latest report for a coin
//   DELETE /reports/:id     → Delete a report (JSON)
//   GET /workflows          → Interactive workflows page (HTML)
//   GET /settings           → Model configuration page (HTML)
//   POST /model-config/test → Test model connection (JSON)
//   POST /workflows/execute/analysis → Run crypto analysis (per-request config)
//   POST /workflows/execute/scan     → Run market scan (per-request config)

import { registerApiRoute } from '@mastra/core/server';
import { generateReportHtml, generateDashboardHtml } from './html-templates';
import { listReports, getReport, getLatestReportForCoin, deleteReport } from './storage';
import { generateWorkflowsPageHtml } from './workflows-ui';
import { generateSettingsPageHtml } from './settings-ui';
import { testModelConnection, withModelConfig } from './model-config';

// NOTE: We do NOT import `mastra` or workflows at the top level to avoid
// circular dependencies (index.ts → reports → routes.ts → index.ts).
// Instead, we use dynamic import() inside the route handlers, which runs
// after all modules are fully initialized.

export const reportRoutes = [
  // ── Root redirect → Dashboard ─────────────────────────────────────
  registerApiRoute('/', {
    method: 'GET',
    handler: async (c) => {
      return c.redirect('/reports');
    },
  }),

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

  // ── Test model connection ─────────────────────────────────────────
  // API key is REQUIRED — no fallback to env vars
  registerApiRoute('/model-config/test', {
    method: 'POST',
    handler: async (c: any) => {
      try {
        const body = await c.req.json();
        const { provider, modelName, apiKey } = body;

        if (!provider || !modelName) {
          return c.json({ ok: false, message: 'Provider and model are required.' }, 400);
        }

        if (!apiKey) {
          return c.json({ ok: false, message: 'API key is required. Please enter your API key.' }, 400);
        }

        const result = await testModelConnection({ provider, modelName, apiKey });
        return c.json(result);
      } catch (err: any) {
        return c.json({ ok: false, message: err.message }, 500);
      }
    },
  }),

  // ── Custom Workflow Execution (per-request config isolation) ────────
  // These endpoints wrap workflow execution inside withModelConfig() so
  // each user's API key is isolated via AsyncLocalStorage.
  // The browser sends { provider, modelName, apiKey } with every request.

  registerApiRoute('/workflows/execute/analysis', {
    method: 'POST',
    handler: async (c: any) => {
      try {
        const body = await c.req.json();
        const { coinId, provider, modelName, apiKey } = body;

        if (!coinId) {
          return c.json({ status: 'failed', error: 'coinId is required' }, 400);
        }
        if (!provider || !modelName || !apiKey) {
          return c.json({ status: 'failed', error: 'Model config (provider, modelName, apiKey) is required' }, 400);
        }

        // Dynamic import to avoid circular dependency
        const { mastra } = await import('../index');
        const workflow = mastra.getWorkflow('cryptoAnalysisWorkflow');

        const result = await withModelConfig({ provider, modelName, apiKey }, async () => {
          const run = await workflow.createRun();
          return run.start({
            inputData: { coinId, modelLabel: `${provider}/${modelName}` },
          });
        });

        return c.json({ status: 'success', result });
      } catch (err: any) {
        return c.json({ status: 'failed', error: err.message || 'Unknown error' }, 500);
      }
    },
  }),

  registerApiRoute('/workflows/execute/scan', {
    method: 'POST',
    handler: async (c: any) => {
      try {
        const body = await c.req.json();
        const { limit, provider, modelName, apiKey } = body;

        if (!provider || !modelName || !apiKey) {
          return c.json({ status: 'failed', error: 'Model config (provider, modelName, apiKey) is required' }, 400);
        }

        // Dynamic import to avoid circular dependency
        const { mastra } = await import('../index');
        const workflow = mastra.getWorkflow('marketScanWorkflow');

        const result = await withModelConfig({ provider, modelName, apiKey }, async () => {
          const run = await workflow.createRun();
          return run.start({
            inputData: { limit: limit || 10, modelLabel: `${provider}/${modelName}` },
          });
        });

        return c.json({ status: 'success', result });
      } catch (err: any) {
        return c.json({ status: 'failed', error: err.message || 'Unknown error' }, 500);
      }
    },
  }),
];
