// ─── Custom API Routes for HTML Reports ──────────────────────────────
// Registers HTTP endpoints on the Mastra server for serving reports.
//
//   GET /reports            → Dashboard with all reports (HTML)
//   GET /reports/:id        → Individual report page (HTML)
//   GET /reports/latest/:coinId → Redirect to latest report for a coin
//   DELETE /reports/:id     → Delete a report (JSON)

import { registerApiRoute } from '@mastra/core/server';
import { generateReportHtml, generateDashboardHtml } from './html-templates';
import { listReports, getReport, getLatestReportForCoin, deleteReport } from './storage';

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
];
