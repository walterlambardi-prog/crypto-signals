// ─── Reports Storage ─────────────────────────────────────────────────
// Persists report metadata and content in LibSQL so they survive restarts
// and can be queried from API routes.

import { createClient } from '@libsql/client';
import type { ReportData } from './html-templates';

let db: ReturnType<typeof createClient> | null = null;

function getDb() {
  if (!db) {
    db = createClient({ url: 'file:./mastra-reports.db' });
  }
  return db;
}

/** Create the reports table if it doesn't exist. */
export async function initReportsTable(): Promise<void> {
  const client = getDb();
  await client.execute(`
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      report TEXT NOT NULL,
      coin_id TEXT,
      created_at TEXT NOT NULL,
      model_label TEXT,
      raw_data TEXT
    )
  `);

  // Migration: add columns if the table was created before they existed
  for (const col of ['model_label TEXT', 'raw_data TEXT']) {
    try {
      await client.execute(`ALTER TABLE reports ADD COLUMN ${col}`);
    } catch {
      // Column already exists – ignore the error
    }
  }
}

/** Save a report to the database. Returns the report ID. */
export async function saveReport(data: ReportData): Promise<string> {
  await initReportsTable();
  const client = getDb();
  await client.execute({
    sql: `INSERT OR REPLACE INTO reports (id, type, title, report, coin_id, created_at, model_label, raw_data)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [data.id, data.type, data.title, data.report, data.coinId ?? null, data.createdAt, data.modelLabel ?? null, data.rawData ?? null],
  });
  return data.id;
}

/** Get all reports, ordered by creation date (newest first). */
export async function listReports(filter?: 'analysis' | 'scan'): Promise<ReportData[]> {
  await initReportsTable();
  const client = getDb();

  let sql = 'SELECT * FROM reports';
  const args: string[] = [];

  if (filter) {
    sql += ' WHERE type = ?';
    args.push(filter);
  }

  sql += ' ORDER BY created_at DESC';

  const result = await client.execute({ sql, args });

  return result.rows.map((row) => ({
    id: row['id'] as string,
    type: row['type'] as 'analysis' | 'scan',
    title: row['title'] as string,
    report: row['report'] as string,
    coinId: (row['coin_id'] as string) || undefined,
    createdAt: row['created_at'] as string,
    modelLabel: (row['model_label'] as string) || undefined,
    rawData: (row['raw_data'] as string) || undefined,
  }));
}

/** Get a single report by ID. */
export async function getReport(id: string): Promise<ReportData | null> {
  await initReportsTable();
  const client = getDb();

  const result = await client.execute({
    sql: 'SELECT * FROM reports WHERE id = ?',
    args: [id],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row['id'] as string,
    type: row['type'] as 'analysis' | 'scan',
    title: row['title'] as string,
    report: row['report'] as string,
    coinId: (row['coin_id'] as string) || undefined,
    createdAt: row['created_at'] as string,
    modelLabel: (row['model_label'] as string) || undefined,
    rawData: (row['raw_data'] as string) || undefined,
  };
}

/** Get the latest report for a specific coin. */
export async function getLatestReportForCoin(coinId: string): Promise<ReportData | null> {
  await initReportsTable();
  const client = getDb();

  const result = await client.execute({
    sql: 'SELECT * FROM reports WHERE coin_id = ? ORDER BY created_at DESC LIMIT 1',
    args: [coinId],
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    id: row['id'] as string,
    type: row['type'] as 'analysis' | 'scan',
    title: row['title'] as string,
    report: row['report'] as string,
    coinId: (row['coin_id'] as string) || undefined,
    createdAt: row['created_at'] as string,
    modelLabel: (row['model_label'] as string) || undefined,
    rawData: (row['raw_data'] as string) || undefined,
  };
}

/** Delete a report by ID. */
export async function deleteReport(id: string): Promise<boolean> {
  await initReportsTable();
  const client = getDb();

  const result = await client.execute({
    sql: 'DELETE FROM reports WHERE id = ?',
    args: [id],
  });

  return (result.rowsAffected ?? 0) > 0;
}

/** Generate a unique report ID. */
export function generateReportId(type: string, coinId?: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  const prefix = coinId ? `${type}-${coinId}` : type;
  return `${prefix}-${ts}-${rand}`;
}
