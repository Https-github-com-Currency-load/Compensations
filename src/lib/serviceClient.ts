import { getAccessToken } from './firebase.ts';
import { WorkCommissionItem, CompensationPayment } from '../types/index.ts';

export interface ServiceStatusResponse {
  status: string;
  timestamp: string;
  services: {
    gmailWorkspace: {
      name: string;
      endpoint: string;
      scopes: string[];
      mode: string;
    };
    settlementEngine: {
      name: string;
      dryRun: boolean;
      executeOnchain: boolean;
      requireApproval: boolean;
      rpcConfigured: boolean;
      rpcPreview: string;
      destinationWallet: string;
      allowedRegions: string[];
    };
    accountingLedger: {
      name: string;
      lastSyncedAt: string | null;
      workItemsCount: number;
      paymentsCount: number;
      totalEarned: number;
      totalReceived: number;
      totalPendingWithdrawal: number;
    };
  };
}

export interface WithdrawalVerificationResponse {
  checkedAt: string;
  policy: {
    dryRun: boolean;
    executeOnchain: boolean;
    requireApproval: boolean;
    destinationWallet: string;
    allowedRegions: string[];
  };
  withdrawalSummary: {
    clearedCompensation: number;
    pendingSettlements: number;
    readyForDisbursement: boolean;
    approvalState: string;
  };
}

export interface GmailMailboxStats {
  connected: boolean;
  emailAddress: string;
  messagesTotal: number;
  threadsTotal: number;
  historyId?: string;
}

export async function fetchServiceStatus(): Promise<ServiceStatusResponse> {
  const res = await fetch('/api/services/status');
  if (!res.ok) {
    throw new Error(`Service status request failed (${res.status})`);
  }
  return res.json();
}

export async function syncLedgerToService(
  workItems: WorkCommissionItem[],
  payments: CompensationPayment[]
): Promise<{
  ok: boolean;
  syncedAt: string;
  summary: {
    workItemsCount: number;
    paymentsCount: number;
    totalEarned: number;
    totalReceived: number;
    totalPendingWithdrawal: number;
  };
}> {
  const res = await fetch('/api/services/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workItems, payments }),
  });
  if (!res.ok) {
    throw new Error(`Failed to sync ledger to service (${res.status})`);
  }
  return res.json();
}

export async function fetchWithdrawalVerification(): Promise<WithdrawalVerificationResponse> {
  const res = await fetch('/api/services/withdrawals');
  if (!res.ok) {
    throw new Error(`Failed to fetch withdrawal verification (${res.status})`);
  }
  return res.json();
}

export async function fetchGmailMailboxStats(): Promise<GmailMailboxStats | null> {
  const token = await getAccessToken();
  if (!token) return null;

  const res = await fetch('/api/services/gmail-verify', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    // Fallback to direct client-side call if needed
    const directRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!directRes.ok) return null;
    const profile = await directRes.json();
    return {
      connected: true,
      emailAddress: profile.emailAddress,
      messagesTotal: profile.messagesTotal,
      threadsTotal: profile.threadsTotal,
      historyId: profile.historyId,
    };
  }

  return res.json();
}
