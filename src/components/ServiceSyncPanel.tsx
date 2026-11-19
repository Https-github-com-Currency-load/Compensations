import React, { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw,
  Mail,
  CheckCircle2,
  Database,
  ShieldCheck,
  DollarSign,
  ArrowUpRight,
  Globe,
  Wallet,
  FileSpreadsheet,
  AlertCircle,
} from 'lucide-react';
import { WorkCommissionItem, CompensationPayment, GmailEmailRecord } from '../types/index.ts';
import {
  fetchServiceStatus,
  syncLedgerToService,
  fetchWithdrawalVerification,
  fetchGmailMailboxStats,
  ServiceStatusResponse,
  WithdrawalVerificationResponse,
  GmailMailboxStats,
} from '../lib/serviceClient.ts';
import { searchGmailMessages } from '../lib/gmailService.ts';

interface ServiceSyncPanelProps {
  workItems: WorkCommissionItem[];
  payments: CompensationPayment[];
  hasToken: boolean;
  userEmail?: string | null;
  onLogin: () => void;
  onOpenScanner: () => void;
  onOpenReport: () => void;
  onSelectPaymentFromEmail: (
    email: GmailEmailRecord,
    matchedWorkItem?: WorkCommissionItem,
    amount?: number
  ) => void;
}

export const ServiceSyncPanel: React.FC<ServiceSyncPanelProps> = ({
  workItems,
  payments,
  hasToken,
  userEmail,
  onLogin,
  onOpenScanner,
  onOpenReport,
  onSelectPaymentFromEmail,
}) => {
  const [isFetching, setIsFetching] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<ServiceStatusResponse | null>(null);
  const [withdrawalData, setWithdrawalData] = useState<WithdrawalVerificationResponse | null>(null);
  const [mailboxStats, setMailboxStats] = useState<GmailMailboxStats | null>(null);
  const [recentRemittances, setRecentRemittances] = useState<GmailEmailRecord[]>([]);
  const [lastFetchedTime, setLastFetchedTime] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const findMatchingWorkItem = useCallback(
    (email: GmailEmailRecord): WorkCommissionItem | undefined => {
      const textToMatch = `${email.from} ${email.subject} ${email.snippet}`.toLowerCase();
      return workItems.find((item) => {
        const clientMatch = item.clientName && textToMatch.includes(item.clientName.toLowerCase());
        const emailMatch = item.clientEmail && textToMatch.includes(item.clientEmail.toLowerCase());
        const invMatch = item.invoiceRef && textToMatch.includes(item.invoiceRef.toLowerCase());
        return clientMatch || emailMatch || invMatch;
      });
    },
    [workItems]
  );

  const handleFetchAllServices = useCallback(async () => {
    setIsFetching(true);
    setFetchError(null);
    try {
      // 1. Sync current workItems and payments to Accounting Service
      await syncLedgerToService(workItems, payments);

      // 2. Fetch Service Status & Withdrawal Verification in parallel
      const [statusRes, withdrawRes] = await Promise.all([
        fetchServiceStatus(),
        fetchWithdrawalVerification(),
      ]);
      setServiceStatus(statusRes);
      setWithdrawalData(withdrawRes);

      // 3. If authenticated with Google, fetch live Gmail profile & recent remittance emails
      if (hasToken) {
        const [stats, emails] = await Promise.all([
          fetchGmailMailboxStats().catch(() => null),
          searchGmailMessages(
            'commission OR payout OR remittance OR "payment advice" OR "direct deposit" OR invoice',
            4
          ).catch(() => []),
        ]);
        if (stats) setMailboxStats(stats);
        setRecentRemittances(emails);
      }

      setLastFetchedTime(
        new Date().toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        })
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to fetch data from services';
      setFetchError(msg);
    } finally {
      setIsFetching(false);
    }
  }, [workItems, payments, hasToken]);

  useEffect(() => {
    handleFetchAllServices();
  }, [handleFetchAllServices]);

  const settlement = serviceStatus?.services.settlementEngine;
  const ledger = serviceStatus?.services.accountingLedger;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs">
      {/* Top Bar */}
      <div className="flex flex-col gap-3 border-b border-neutral-100 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-neutral-900">
                Connected Services &amp; Live Data Sync
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {lastFetchedTime ? `Synced ${lastFetchedTime}` : 'Ready'}
              </span>
            </div>
            <p className="text-xs text-neutral-500">
              Synchronize work commissions, Gmail remittance feed, accounting ledger, and payout verification
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenReport}
            className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-neutral-500" />
            Export Accounting CSV
          </button>
          <button
            type="button"
            onClick={handleFetchAllServices}
            disabled={isFetching}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 disabled:opacity-60 transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Fetching Service Data...' : 'Fetch & Sync Services'}
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{fetchError}</span>
        </div>
      )}

      {/* 3-Column Service Grid */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Service 1: Gmail Workspace Remittance Service */}
        <div className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-bold text-neutral-900">
                  Gmail Remittance Service
                </span>
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  hasToken
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {hasToken ? 'Connected' : 'Auth Required'}
              </span>
            </div>

            {hasToken ? (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-neutral-500">Mailbox:</span>
                  <span className="font-semibold text-neutral-800 truncate max-w-[180px]">
                    {mailboxStats?.emailAddress || userEmail || 'Active'}
                  </span>
                </div>
                {mailboxStats && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500">Indexed Messages / Threads:</span>
                    <span className="font-mono font-semibold text-neutral-800">
                      {mailboxStats.messagesTotal.toLocaleString()} / {mailboxStats.threadsTotal.toLocaleString()}
                    </span>
                  </div>
                )}

                {/* Recent Fetched Remittances */}
                <div className="mt-2 border-t border-neutral-200/80 pt-2">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-600 mb-1.5">
                    <span>Latest Fetched Payout Emails ({recentRemittances.length})</span>
                    <button
                      type="button"
                      onClick={onOpenScanner}
                      className="text-emerald-700 hover:underline inline-flex items-center gap-0.5"
                    >
                      Full Scanner <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>

                  {recentRemittances.length === 0 ? (
                    <p className="text-[11px] text-neutral-400 py-1">
                      No recent commission emails matched in quick fetch. Use Full Scanner for custom queries.
                    </p>
                  ) : (
                    <div className="space-y-1.5">
                      {recentRemittances.slice(0, 2).map((email) => {
                        const matched = findMatchingWorkItem(email);
                        const amt = email.detectedAmounts[0];
                        return (
                          <div
                            key={email.id}
                            className="flex items-center justify-between gap-2 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-[11px]"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-semibold text-neutral-800">
                                {email.subject}
                              </p>
                              <p className="truncate text-[10px] text-neutral-500">
                                {email.date} {amt ? `• Detected $${amt.toLocaleString()}` : ''}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => onSelectPaymentFromEmail(email, matched, amt)}
                              className="shrink-0 rounded bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 hover:bg-emerald-100"
                            >
                              Reconcile
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-xs text-neutral-600 leading-relaxed">
                  Sign in with Google to automatically fetch remittance advice, wire confirmations, and commission statements from Gmail.
                </p>
                <button
                  type="button"
                  onClick={onLogin}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  <Mail className="h-3.5 w-3.5" />
                  Connect Gmail Service
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Service 2: Accounting Reconciliation & Ledger Sync Service */}
        <div className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-blue-600" />
                <span className="text-xs font-bold text-neutral-900">
                  Accounting &amp; Ledger Service
                </span>
              </div>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-800">
                Synchronized
              </span>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Synced Work Contracts:</span>
                <span className="font-semibold text-neutral-900">
                  {ledger?.workItemsCount ?? workItems.length} records
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Synced Payment Entries:</span>
                <span className="font-semibold text-neutral-900">
                  {ledger?.paymentsCount ?? payments.length} remittances
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Total Earned Commission:</span>
                <span className="font-bold text-neutral-900">
                  ${(ledger?.totalEarned ?? 0).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Settled Compensation:</span>
                <span className="font-bold text-emerald-700">
                  ${(ledger?.totalReceived ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 border-t border-neutral-200/80 pt-2.5 flex items-center justify-between text-[11px]">
            <span className="text-neutral-500">
              Pending Claim Balance:{' '}
              <strong className="text-red-600">
                ${(ledger?.totalPendingWithdrawal ?? 0).toLocaleString()}
              </strong>
            </span>
            <button
              type="button"
              onClick={onOpenReport}
              className="font-semibold text-blue-700 hover:underline inline-flex items-center gap-0.5"
            >
              Audit Statement <ArrowUpRight className="h-3 w-3" />
            </button>
          </div>
        </div>

        {/* Service 3: Payout & Withdrawal Verification Service */}
        <div className="flex flex-col justify-between rounded-xl border border-neutral-200 bg-neutral-50/60 p-4">
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                <span className="text-xs font-bold text-neutral-900">
                  Payout &amp; Withdrawal Service
                </span>
              </div>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                {settlement?.dryRun ? 'Dry-Run Mode' : 'Live Execution'}
              </span>
            </div>

            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500 flex items-center gap-1">
                  <Wallet className="h-3.5 w-3.5 text-neutral-400" /> Destination Wallet:
                </span>
                <span className="font-mono text-[11px] font-semibold text-neutral-800">
                  {withdrawalData?.policy.destinationWallet || settlement?.destinationWallet || 'Configured'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500 flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5 text-neutral-400" /> On-Chain Execution:
                </span>
                <span className="font-semibold text-neutral-800">
                  {settlement?.executeOnchain ? 'Enabled' : 'Off-Chain / ACH'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">Approval Policy:</span>
                <span className="font-semibold text-neutral-800">
                  {settlement?.requireApproval ? 'Sign-off Required' : 'Auto-Disburse'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-neutral-500 flex items-center gap-1">
                  <Globe className="h-3.5 w-3.5 text-neutral-400" /> Allowed Regions:
                </span>
                <span className="font-semibold text-neutral-800">
                  {(settlement?.allowedRegions || ['US', 'EU', 'UK', 'ZA']).join(', ')}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-3 border-t border-neutral-200/80 pt-2.5 flex items-center justify-between text-[11px]">
            <span className="text-neutral-500">
              Disbursement Status:{' '}
              <strong className="text-emerald-700">
                {withdrawalData?.withdrawalSummary.readyForDisbursement
                  ? 'Verified & Active'
                  : 'Awaiting Funds'}
              </strong>
            </span>
            <span className="font-mono text-[10px] text-neutral-400">
              /api/services/withdrawals
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
