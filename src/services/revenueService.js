import { AppError, assert } from '../errors.js';
import { requireRole } from '../auth.js';
import { parseDateRange, inRange, roundVnd, percent } from '../utils.js';

/**
 * UC50: View Branch Revenue
 * Primary Actor: Facility Manager (also accessible by Court Owner)
 * Business Rules: BR50, BR100, BR163, BR217, BR218
 */
export function getBranchRevenue(actor, query, store) {
  requireRole(actor, 'FACILITY_MANAGER', 'OWNER');

  let facilityId = query.facilityId;
  if (actor.role === 'FACILITY_MANAGER') {
    // BR100: Strictly restricted to manager's assigned branch
    facilityId = actor.facilityId;
  } else if (!facilityId) {
    facilityId = store.facilities[0]?.id;
  }

  assert(facilityId, 400, 'FACILITY_REQUIRED', 'Facility ID is required.');
  const facility = store.facilities.find((f) => f.id === facilityId);
  assert(facility, 404, 'FACILITY_NOT_FOUND', `Facility ${facilityId} not found.`);

  // Parse date range
  const defaultRange = {
    from: '2026-11-01T00:00:00.000Z',
    to: '2026-11-10T00:00:00.000Z',
  };
  const { start, end } = parseDateRange(query.from, query.to, defaultRange);

  const filterCategory = query.category ? String(query.category).toUpperCase() : null;
  const filterChannel = query.channel ? String(query.channel).toUpperCase() : null;

  const facilityEntries = (store.revenueEntries || []).filter((e) => e.facilityId === facilityId);

  // BR217: Management Revenue Recognition - Recognized strictly upon delivery of service / handover of goods
  const recognizedEntries = facilityEntries.filter((item) => {
    if (!item.deliveredAt || !inRange(item.deliveredAt, start, end)) return false;
    if (filterCategory && item.category !== filterCategory) return false;
    if (filterChannel && item.channel !== filterChannel) return false;
    return true;
  });

  // BR217: Unserved prepayments and active deposits tracked separately as liabilities
  const liabilityEntries = facilityEntries.filter((item) => {
    if (!item.liabilityType) return false;
    const refDate = item.receivedAt || item.deliveredAt;
    return refDate && inRange(refDate, start, end);
  });

  let grossRevenue = 0;
  let totalRefunds = 0;
  let directCogs = 0;

  const categoryMap = {};
  const channelMap = {
    CASH: { channel: 'CASH', grossRevenue: 0, refundAmount: 0, netRevenue: 0 },
    VNPAY: { channel: 'VNPAY', grossRevenue: 0, refundAmount: 0, netRevenue: 0 },
    VIETQR: { channel: 'VIETQR', grossRevenue: 0, refundAmount: 0, netRevenue: 0 },
  };

  for (const entry of recognizedEntries) {
    const gross = roundVnd(entry.grossAmount || 0);
    const refund = roundVnd(entry.refundAmount || 0);
    const cogs = roundVnd(entry.directCogs || 0);
    const net = gross - refund;
    const profit = net - cogs;

    grossRevenue += gross;
    totalRefunds += refund;
    directCogs += cogs;

    // Category aggregation
    const cat = entry.category || 'OTHER';
    if (!categoryMap[cat]) {
      categoryMap[cat] = {
        category: cat,
        grossRevenue: 0,
        refundAmount: 0,
        netRevenue: 0,
        directCogs: 0,
        grossOperatingProfit: 0,
      };
    }
    categoryMap[cat].grossRevenue += gross;
    categoryMap[cat].refundAmount += refund;
    categoryMap[cat].netRevenue += net;
    categoryMap[cat].directCogs += cogs;
    categoryMap[cat].grossOperatingProfit += profit;

    // Channel aggregation (BR163)
    const ch = entry.channel || 'OTHER';
    if (!channelMap[ch]) {
      channelMap[ch] = { channel: ch, grossRevenue: 0, refundAmount: 0, netRevenue: 0 };
    }
    channelMap[ch].grossRevenue += gross;
    channelMap[ch].refundAmount += refund;
    channelMap[ch].netRevenue += net;
  }

  // Liabilities calculation (BR217)
  let unservedPrepayments = 0;
  let activeDeposits = 0;
  for (const entry of liabilityEntries) {
    const amount = roundVnd(entry.grossAmount || 0);
    if (entry.liabilityType === 'UNSERVED_PREPAYMENT') {
      unservedPrepayments += amount;
    } else if (entry.liabilityType === 'ACTIVE_DEPOSIT') {
      activeDeposits += amount;
    }
  }

  // BR50, BR218: Financial rounding and gross operating profit calculation
  const netRevenue = roundVnd(grossRevenue - totalRefunds);
  const grossOperatingProfit = roundVnd(netRevenue - directCogs);
  const grossProfitMargin = percent(grossOperatingProfit, netRevenue);

  const byCategory = Object.values(categoryMap).map((cat) => ({
    ...cat,
    grossProfitMargin: percent(cat.grossOperatingProfit, cat.netRevenue),
  }));

  const byChannel = Object.values(channelMap).map((ch) => ({
    ...ch,
    sharePercent: percent(ch.netRevenue, netRevenue),
  }));

  return {
    success: true,
    data: {
      facility: {
        id: facility.id,
        name: facility.name,
      },
      filter: {
        from: start.toISOString(),
        to: end.toISOString(),
        category: filterCategory,
        channel: filterChannel,
      },
      kpis: {
        grossRevenue: roundVnd(grossRevenue),
        totalRefunds: roundVnd(totalRefunds),
        netRevenue: roundVnd(netRevenue),
        directCogs: roundVnd(directCogs),
        grossOperatingProfit: roundVnd(grossOperatingProfit), // BR218
        grossProfitMargin,
      },
      liabilities: { // BR217
        unservedPrepayments: roundVnd(unservedPrepayments),
        activeDeposits: roundVnd(activeDeposits),
        totalLiabilities: roundVnd(unservedPrepayments + activeDeposits),
      },
      breakdowns: {
        byCategory,
        byChannel, // BR163
      },
      recordsCount: recognizedEntries.length,
    },
  };
}
