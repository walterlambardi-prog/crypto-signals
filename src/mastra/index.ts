
import { Mastra } from '@mastra/core/mastra';
import { PinoLogger } from '@mastra/loggers';
import { LibSQLStore } from '@mastra/libsql';
import { Observability, DefaultExporter, CloudExporter, SensitiveDataFilter } from '@mastra/observability';
import { cryptoAnalysisWorkflow } from './workflows/crypto-analysis';
import { marketScanWorkflow } from './workflows/market-scan';
import { cryptoSignalsAgent } from './agents/crypto-agent';
import { signalQualityScorer } from './scorers/crypto-scorer';
import { reportRoutes } from './reports';

export const mastra = new Mastra({
  workflows: { cryptoAnalysisWorkflow, marketScanWorkflow },
  agents: { cryptoSignalsAgent },
  scorers: { signalQualityScorer },
  storage: new LibSQLStore({
    id: "mastra-storage",
    url: "file:./mastra.db",
  }),
  server: {
    apiRoutes: reportRoutes,
  },
  logger: new PinoLogger({
    name: 'CryptoSignals',
    level: 'info',
  }),
  observability: new Observability({
    configs: {
      default: {
        serviceName: 'crypto-signals',
        exporters: [
          new DefaultExporter(),
          new CloudExporter(),
        ],
        spanOutputProcessors: [
          new SensitiveDataFilter(),
        ],
      },
    },
  }),
});
