import type { CallContext } from '../../domain/context.js';
import {
  buildDashboard,
  feesSkippedWarning,
  RECENT_PAYMENTS_LIMIT,
  warningFor,
  type Dashboard,
  type DashboardWarning,
  type Fees,
} from '../../domain/dashboard.js';
import type { AuthenticatedMerchant } from '../../domain/merchant.js';
import type { AggregatedDataPorts } from './ports.js';

// Summary and recent payments are fetched in parallel. Fees come after the summary, because the
// Function receives the summary's byMethod totals. A failed part becomes null plus a warning;
// the panel is still answered (only the merchant authentication, done before, can stop it).
export async function getAggregatedData(
  merchant: AuthenticatedMerchant,
  ports: AggregatedDataPorts,
  context: CallContext,
): Promise<Dashboard> {
  const [summary, recent] = await Promise.allSettled([
    ports.payments.summary(merchant.id, context),
    ports.payments.recent(merchant.id, RECENT_PAYMENTS_LIMIT, context),
  ]);

  const warnings: DashboardWarning[] = [];
  if (summary.status === 'rejected') {
    warnings.push(warningFor('summary', summary.reason));
  }
  if (recent.status === 'rejected') {
    warnings.push(warningFor('recentPayments', recent.reason));
  }

  let fees: Fees | null = null;
  if (summary.status === 'fulfilled') {
    try {
      fees = await ports.fees.calculate(summary.value.byMethod, summary.value.currency, context);
    } catch (failure) {
      warnings.push(warningFor('fees', failure));
    }
  } else {
    warnings.push(feesSkippedWarning());
  }

  return buildDashboard({
    merchant,
    summary: summary.status === 'fulfilled' ? summary.value : null,
    recentPayments: recent.status === 'fulfilled' ? recent.value : null,
    fees,
    warnings,
    generatedAt: ports.now(),
  });
}
