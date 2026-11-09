import { AppError, assert } from '../errors.js';
import { requireRole } from '../auth.js';
import { parseDateRange, inRange, roundVnd, percent, csvList } from '../utils.js';
import { getCourtOccupancy } from './occupancyService.js';
import { getBranchRevenue } from './revenueService.js';

/**
 * UC62: View Chain Performance
 * Primary Actor: Court Owner
 * Business Rules: BR101, BR216, BR217, BR218
 */
export function getChainPerformance(actor, query, store) {
  // BR101: Court Owner has chain-wide visibility across all facilities
  requireRole(actor, 'OWNER');

  // Parse and validate date range
  const defaultRange = {
    from: '2026-11-01T00:00:00.000Z',
    to: '2026-11-10T00:00:00.000Z',
  };
  const { start, end } = parseDateRange(query.from, query.to, defaultRange);

  // Selected branches filter
  let targetFacilities = store.facilities.filter((f) => f.status === 'ACTIVE');
  if (query.facilityIds) {
    const requestedIds = new Set(csvList(query.facilityIds));
    targetFacilities = targetFacilities.filter((f) => requestedIds.has(f.id));
  }

  // EX-1: Empty filter selection
  assert(
    targetFacilities.length > 0,
    400,
    'NO_BRANCH_SELECTED',
    'At least one active branch must be selected for chain performance analytics.'
  );

  const selectedSport = query.sport ? String(query.sport).toUpperCase() : null;
  const selectedBookingType = query.bookingType ? String(query.bookingType).toUpperCase() : null;

  const branchReports = [];

  let chainNetRevenue = 0;
  let chainDirectCogs = 0;
  let chainGrossOperatingProfit = 0;
  let chainUnservedPrepayments = 0;
  let chainActiveDeposits = 0;

  let chainAvailableMinutes = 0;
  let chainUsedMinutes = 0;
  let chainPeakAvailable = 0;
  let chainPeakUsed = 0;
  let chainOffPeakAvailable = 0;
  let chainOffPeakUsed = 0;

  let chainTotalSessions = 0;
  let chainCompletedSessions = 0;
  let chainNoShowSessions = 0;
  let chainCancelledSessions = 0;
  let chainRefundAmount = 0;

  for (const facility of targetFacilities) {
    // 1. Branch Revenue (UC50 logic)
    const revenueResult = getBranchRevenue(
      actor,
      {
        facilityId: facility.id,
        from: start.toISOString(),
        to: end.toISOString(),
      },
      store
    );
    const revKpis = revenueResult.data.kpis;
    const revLiabilities = revenueResult.data.liabilities;

    chainNetRevenue += revKpis.netRevenue;
    chainDirectCogs += revKpis.directCogs;
    chainGrossOperatingProfit += revKpis.grossOperatingProfit;
    chainUnservedPrepayments += revLiabilities.unservedPrepayments;
    chainActiveDeposits += revLiabilities.activeDeposits;

    // 2. Branch Occupancy (UC49 logic)
    const occupancyResult = getCourtOccupancy(
      actor,
      {
        facilityId: facility.id,
        from: start.toISOString(),
        to: end.toISOString(),
        sport: selectedSport,
      },
      store
    );
    const occKpis = occupancyResult.data.kpis;

    chainAvailableMinutes += occKpis.totalAvailableMinutes;
    chainUsedMinutes += occKpis.totalUsedMinutes;

    // 3. Branch Sessions & No-show analytics
    const branchCourtIds = new Set(
      store.courts.filter((c) => c.facilityId === facility.id).map((c) => c.id)
    );

    let branchSessions = (store.bookingSessions || []).filter((s) => {
      if (!branchCourtIds.has(s.courtId)) return false;
      const sessionDate = s.scheduledStart || s.actualStart;
      if (!inRange(sessionDate, start, end)) return false;
      if (selectedBookingType && s.bookingType !== selectedBookingType) return false;
      return true;
    });

    const totalSessions = branchSessions.length;
    const completedSessions = branchSessions.filter((s) => s.status === 'COMPLETED').length;
    const noShowSessions = branchSessions.filter((s) => s.status === 'NO_SHOW').length;
    const cancelledSessions = branchSessions.filter((s) => s.status === 'CANCELLED').length;
    const branchRefund = branchSessions.reduce((acc, s) => acc + (s.refundAmount || 0), 0);

    chainTotalSessions += totalSessions;
    chainCompletedSessions += completedSessions;
    chainNoShowSessions += noShowSessions;
    chainCancelledSessions += cancelledSessions;
    chainRefundAmount += branchRefund;

    const noShowRate = percent(noShowSessions, totalSessions);

    branchReports.push({
      facilityId: facility.id,
      facilityName: facility.name,
      financials: {
        grossRevenue: revKpis.grossRevenue,
        refundAmount: revKpis.totalRefunds,
        netRevenue: revKpis.netRevenue,
        directCogs: revKpis.directCogs,
        grossOperatingProfit: revKpis.grossOperatingProfit,
        grossProfitMargin: revKpis.grossProfitMargin,
        unservedPrepayments: revLiabilities.unservedPrepayments,
        activeDeposits: revLiabilities.activeDeposits,
      },
      occupancy: {
        availableMinutes: occKpis.totalAvailableMinutes,
        usedMinutes: occKpis.totalUsedMinutes,
        utilizationRate: occKpis.utilizationRate,
        peakUtilizationRate: occKpis.peakUtilizationRate,
        offPeakUtilizationRate: occKpis.offPeakUtilizationRate,
        activeCourtsCount: occKpis.activeCourtCount,
      },
      operations: {
        totalSessions,
        completedSessions,
        noShowSessions,
        cancelledSessions,
        noShowRate,
        cancellationRefundAmount: roundVnd(branchRefund),
      },
    });
  }

  // Branch rankings sorted by Net Revenue descending
  const branchRankings = [...branchReports]
    .sort((a, b) => b.financials.netRevenue - a.financials.netRevenue)
    .map((report, index) => ({
      rank: index + 1,
      facilityId: report.facilityId,
      facilityName: report.facilityName,
      netRevenue: report.financials.netRevenue,
      grossOperatingProfit: report.financials.grossOperatingProfit,
      utilizationRate: report.occupancy.utilizationRate,
      noShowRate: report.operations.noShowRate,
    }));

  return {
    success: true,
    data: {
      period: {
        from: start.toISOString(),
        to: end.toISOString(),
      },
      filters: {
        facilityCount: targetFacilities.length,
        sport: selectedSport,
        bookingType: selectedBookingType,
      },
      chainKpis: {
        netRevenue: roundVnd(chainNetRevenue),
        directCogs: roundVnd(chainDirectCogs),
        grossOperatingProfit: roundVnd(chainGrossOperatingProfit),
        grossProfitMargin: percent(chainGrossOperatingProfit, chainNetRevenue),
        liabilities: {
          unservedPrepayments: roundVnd(chainUnservedPrepayments),
          activeDeposits: roundVnd(chainActiveDeposits),
          totalLiabilities: roundVnd(chainUnservedPrepayments + chainActiveDeposits),
        },
        occupancy: {
          availableMinutes: chainAvailableMinutes,
          usedMinutes: chainUsedMinutes,
          utilizationRate: percent(chainUsedMinutes, chainAvailableMinutes),
        },
        operations: {
          totalSessions: chainTotalSessions,
          completedSessions: chainCompletedSessions,
          noShowSessions: chainNoShowSessions,
          cancelledSessions: chainCancelledSessions,
          noShowRate: percent(chainNoShowSessions, chainTotalSessions),
          totalCancellationRefunds: roundVnd(chainRefundAmount),
        },
      },
      branchComparisons: branchReports,
      branchRankings,
    },
  };
}
