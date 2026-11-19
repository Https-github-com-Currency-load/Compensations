import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In-memory store for synced ledger & service records
interface SyncedLedgerState {
  lastSyncedAt: string | null;
  workItemsCount: number;
  paymentsCount: number;
  totalEarned: number;
  totalReceived: number;
  totalPendingWithdrawal: number;
  workItems: unknown[];
  payments: unknown[];
}

let ledgerState: SyncedLedgerState = {
  lastSyncedAt: null,
  workItemsCount: 4,
  paymentsCount: 2,
  totalEarned: 21500,
  totalReceived: 9000,
  totalPendingWithdrawal: 12500,
  workItems: [],
  payments: [],
};

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '5mb' }));

  // 1. Service Status & Environment Configuration Endpoint
  app.get('/api/services/status', (_req, res) => {
    const dryRun = process.env.DRY_RUN !== 'false';
    const executeOnchain = process.env.EXECUTE_ONCHAIN === 'true';
    const requireApproval = process.env.REQUIRE_APPROVAL !== 'false';
    const rpcUrl = process.env.RPC_URL || 'https://eth-mainnet.g.alchemy.com/v2/demo';
    const destinationWallet = process.env.DESTINATION_WALLET || '0x71C8...89A4';
    const allowedRegions = (process.env.ALLOWED_REGIONS || 'US,EU,UK,ZA')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    res.json({
      status: 'operational',
      timestamp: new Date().toISOString(),
      services: {
        gmailWorkspace: {
          name: 'Google Workspace Gmail API',
          endpoint: 'https://gmail.googleapis.com/gmail/v1',
          scopes: ['gmail.readonly', 'gmail.send'],
          mode: 'client-oauth-bearer',
        },
        settlementEngine: {
          name: 'Commission Payout & Settlement Service',
          dryRun,
          executeOnchain,
          requireApproval,
          rpcConfigured: Boolean(process.env.RPC_URL),
          rpcPreview: rpcUrl.replace(/\/v2\/.*$/, '/v2/***'),
          destinationWallet,
          allowedRegions,
        },
        accountingLedger: {
          name: 'Accounting Reconciliation Ledger',
          lastSyncedAt: ledgerState.lastSyncedAt,
          workItemsCount: ledgerState.workItemsCount,
          paymentsCount: ledgerState.paymentsCount,
          totalEarned: ledgerState.totalEarned,
          totalReceived: ledgerState.totalReceived,
          totalPendingWithdrawal: ledgerState.totalPendingWithdrawal,
        },
      },
    });
  });

  // 2. Sync Work Items & Payments to Backend Accounting & Withdrawal Service
  app.post('/api/services/sync', (req, res) => {
    const { workItems = [], payments = [] } = req.body || {};
    const itemsArr = Array.isArray(workItems) ? workItems : [];
    const paymentsArr = Array.isArray(payments) ? payments : [];

    const totalEarned = itemsArr.reduce(
      (sum: number, item: { commissionAmount?: number }) => sum + (Number(item?.commissionAmount) || 0),
      0
    );
    const totalReceived = itemsArr.reduce(
      (sum: number, item: { compensationReceived?: number }) => sum + (Number(item?.compensationReceived) || 0),
      0
    );
    const totalPendingWithdrawal = Math.max(0, totalEarned - totalReceived);

    ledgerState = {
      lastSyncedAt: new Date().toISOString(),
      workItemsCount: itemsArr.length,
      paymentsCount: paymentsArr.length,
      totalEarned,
      totalReceived,
      totalPendingWithdrawal,
      workItems: itemsArr,
      payments: paymentsArr,
    };

    res.json({
      ok: true,
      syncedAt: ledgerState.lastSyncedAt,
      summary: {
        workItemsCount: ledgerState.workItemsCount,
        paymentsCount: ledgerState.paymentsCount,
        totalEarned: ledgerState.totalEarned,
        totalReceived: ledgerState.totalReceived,
        totalPendingWithdrawal: ledgerState.totalPendingWithdrawal,
      },
    });
  });

  // 3. Check Withdrawals & Settlement Queue Endpoint
  app.get('/api/services/withdrawals', (_req, res) => {
    const dryRun = process.env.DRY_RUN !== 'false';
    const executeOnchain = process.env.EXECUTE_ONCHAIN === 'true';
    const requireApproval = process.env.REQUIRE_APPROVAL !== 'false';
    const destinationWallet = process.env.DESTINATION_WALLET || '0x71C8...89A4';
    const allowedRegions = (process.env.ALLOWED_REGIONS || 'US,EU,UK,ZA')
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    res.json({
      checkedAt: new Date().toISOString(),
      policy: {
        dryRun,
        executeOnchain,
        requireApproval,
        destinationWallet,
        allowedRegions,
      },
      withdrawalSummary: {
        clearedCompensation: ledgerState.totalReceived,
        pendingSettlements: ledgerState.totalPendingWithdrawal,
        readyForDisbursement: ledgerState.totalReceived > 0,
        approvalState: requireApproval ? 'awaiting_signoff' : 'auto_approved',
      },
    });
  });

  // 4. Server-side Gmail proxy check (validates Bearer token with Gmail Profile endpoint)
  app.get('/api/services/gmail-verify', async (req, res) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Missing Authorization Bearer token' });
      return;
    }

    try {
      const profileRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: authHeader },
      });
      if (!profileRes.ok) {
        const errBody = await profileRes.json().catch(() => ({}));
        res.status(profileRes.status).json({
          error: errBody?.error?.message || 'Gmail API profile fetch failed',
        });
        return;
      }
      const profile = await profileRes.json();
      res.json({
        connected: true,
        emailAddress: profile.emailAddress,
        messagesTotal: profile.messagesTotal,
        threadsTotal: profile.threadsTotal,
        historyId: profile.historyId,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to verify Gmail service';
      res.status(500).json({ error: msg });
    }
  });

  // Mount Vite dev server or static production assets
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CommissionPay server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
