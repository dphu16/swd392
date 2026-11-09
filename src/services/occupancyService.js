import { AppError, assert } from '../errors.js';
import { requireRole } from '../auth.js';
import {
  MINUTE,
  parseDateRange,
  overlapMs,
  eachUtcDay,
  atUtcMinutes,
  toMinutes,
  percent,
} from '../utils.js';

const PEAK_START_MINUTES = 17 * 60; // 17:00 (BR27)
const PEAK_END_MINUTES = 22 * 60;   // 22:00 (BR27)

/**
 * UC49: View Court Occupancy
 * Primary Actor: Facility Manager (also accessible by Court Owner)
 * Business Rules: BR27, BR100, BR216
 */
export function getCourtOccupancy(actor, query, store) {
  requireRole(actor, 'FACILITY_MANAGER', 'OWNER');

  let facilityId = query.facilityId;
  if (actor.role === 'FACILITY_MANAGER') {
    // BR100: Strictly scoped to manager's assigned branch
    facilityId = actor.facilityId;
  } else if (!facilityId) {
    facilityId = store.facilities[0]?.id;
  }

  assert(facilityId, 400, 'FACILITY_REQUIRED', 'Facility ID is required.');
  const facility = store.facilities.find((f) => f.id === facilityId);
  assert(facility, 404, 'FACILITY_NOT_FOUND', `Facility ${facilityId} not found.`);

  // Parse and validate date range (EX-1)
  const defaultRange = {
    from: '2026-11-02T00:00:00.000Z',
    to: '2026-11-09T00:00:00.000Z',
  };
  const { start, end } = parseDateRange(query.from, query.to, defaultRange);

  const selectedSport = query.sport ? String(query.sport).toUpperCase() : null;
  const selectedCourtId = query.courtId || null;
  const timePeriod = (query.timePeriod || 'ALL').toUpperCase(); // ALL, PEAK, OFF_PEAK

  // Filter courts for branch
  let courts = store.courts.filter((c) => c.facilityId === facilityId && c.status === 'ACTIVE');
  if (selectedSport) {
    courts = courts.filter((c) => c.sport === selectedSport);
  }
  if (selectedCourtId) {
    courts = courts.filter((c) => c.id === selectedCourtId);
  }

  const facilityOpenMinutes = toMinutes(facility.openTime || '06:00');
  const facilityCloseMinutes = toMinutes(facility.closeTime || '23:00');

  const days = eachUtcDay(start, end);

  // Statuses considered as actually using the court
  const activeStatuses = new Set(['COMPLETED', 'IN_USE', 'CHECKED_IN']);

  const courtMetrics = courts.map((court) => {
    let availableMinutes = 0;
    let usedMinutes = 0;
    let peakAvailableMinutes = 0;
    let peakUsedMinutes = 0;
    let offPeakAvailableMinutes = 0;
    let offPeakUsedMinutes = 0;

    const courtMaintenance = (store.maintenance || []).filter((m) => m.courtId === court.id);
    const courtSessions = (store.bookingSessions || []).filter(
      (s) => s.courtId === court.id && activeStatuses.has(s.status)
    );

    for (const day of days) {
      const opStart = atUtcMinutes(day, facilityOpenMinutes).getTime();
      const opEnd = atUtcMinutes(day, facilityCloseMinutes).getTime();

      const peakStart = atUtcMinutes(day, PEAK_START_MINUTES).getTime();
      const peakEnd = atUtcMinutes(day, PEAK_END_MINUTES).getTime();

      // Peak operating window
      const effectivePeakStart = Math.max(opStart, peakStart);
      const effectivePeakEnd = Math.min(opEnd, peakEnd);
      const dayPeakNominal = Math.max(0, (effectivePeakEnd - effectivePeakStart) / MINUTE);

      // Off-peak operating windows: morning [opStart, peakStart) and night [peakEnd, opEnd)
      const morningOffPeak = Math.max(0, (Math.min(opEnd, peakStart) - opStart) / MINUTE);
      const nightOffPeak = Math.max(0, (opEnd - Math.max(opStart, peakEnd)) / MINUTE);
      const dayOffPeakNominal = morningOffPeak + nightOffPeak;

      // Deduct maintenance windows (BR216)
      let dayPeakMaint = 0;
      let dayOffPeakMaint = 0;

      for (const m of courtMaintenance) {
        const mStart = new Date(m.start).getTime();
        const mEnd = new Date(m.end).getTime();

        if (dayPeakNominal > 0) {
          dayPeakMaint += overlapMs(effectivePeakStart, effectivePeakEnd, mStart, mEnd) / MINUTE;
        }
        if (morningOffPeak > 0) {
          dayOffPeakMaint += overlapMs(opStart, Math.min(opEnd, peakStart), mStart, mEnd) / MINUTE;
        }
        if (nightOffPeak > 0) {
          dayOffPeakMaint += overlapMs(Math.max(opStart, peakEnd), opEnd, mStart, mEnd) / MINUTE;
        }
      }

      const dayPeakAvailable = Math.max(0, dayPeakNominal - dayPeakMaint);
      const dayOffPeakAvailable = Math.max(0, dayOffPeakNominal - dayOffPeakMaint);

      peakAvailableMinutes += dayPeakAvailable;
      offPeakAvailableMinutes += dayOffPeakAvailable;
      availableMinutes += dayPeakAvailable + dayOffPeakAvailable;

      // Calculate session used minutes
      for (const s of courtSessions) {
        const sStart = new Date(s.actualStart || s.scheduledStart).getTime();
        const sEnd = new Date(s.actualEnd || s.scheduledEnd).getTime();

        // Used in peak
        if (dayPeakNominal > 0) {
          const usedPeak = overlapMs(effectivePeakStart, effectivePeakEnd, sStart, sEnd) / MINUTE;
          peakUsedMinutes += usedPeak;
        }

        // Used in off-peak
        let usedOffPeak = 0;
        if (morningOffPeak > 0) {
          usedOffPeak += overlapMs(opStart, Math.min(opEnd, peakStart), sStart, sEnd) / MINUTE;
        }
        if (nightOffPeak > 0) {
          usedOffPeak += overlapMs(Math.max(opStart, peakEnd), opEnd, sStart, sEnd) / MINUTE;
        }
        offPeakUsedMinutes += usedOffPeak;
      }
    }

    usedMinutes = peakUsedMinutes + offPeakUsedMinutes;

    // Filter by requested time period if needed
    let displayedAvailable = availableMinutes;
    let displayedUsed = usedMinutes;
    if (timePeriod === 'PEAK') {
      displayedAvailable = peakAvailableMinutes;
      displayedUsed = peakUsedMinutes;
    } else if (timePeriod === 'OFF_PEAK') {
      displayedAvailable = offPeakAvailableMinutes;
      displayedUsed = offPeakUsedMinutes;
    }

    return {
      courtId: court.id,
      courtName: court.name,
      sport: court.sport,
      availableMinutes: Math.round(displayedAvailable),
      usedMinutes: Math.round(displayedUsed),
      utilizationRate: percent(displayedUsed, displayedAvailable),
      peakMetrics: {
        availableMinutes: Math.round(peakAvailableMinutes),
        usedMinutes: Math.round(peakUsedMinutes),
        utilizationRate: percent(peakUsedMinutes, peakAvailableMinutes),
      },
      offPeakMetrics: {
        availableMinutes: Math.round(offPeakAvailableMinutes),
        usedMinutes: Math.round(offPeakUsedMinutes),
        utilizationRate: percent(offPeakUsedMinutes, offPeakAvailableMinutes),
      },
    };
  });

  // Aggregate totals
  const totalAvailableMinutes = courtMetrics.reduce((sum, c) => sum + c.availableMinutes, 0);
  const totalUsedMinutes = courtMetrics.reduce((sum, c) => sum + c.usedMinutes, 0);

  const totalPeakAvailable = courtMetrics.reduce((sum, c) => sum + c.peakMetrics.availableMinutes, 0);
  const totalPeakUsed = courtMetrics.reduce((sum, c) => sum + c.peakMetrics.usedMinutes, 0);

  const totalOffPeakAvailable = courtMetrics.reduce((sum, c) => sum + c.offPeakMetrics.availableMinutes, 0);
  const totalOffPeakUsed = courtMetrics.reduce((sum, c) => sum + c.offPeakMetrics.usedMinutes, 0);

  // Group by sport
  const sportMap = {};
  for (const c of courtMetrics) {
    if (!sportMap[c.sport]) {
      sportMap[c.sport] = { sport: c.sport, courtCount: 0, availableMinutes: 0, usedMinutes: 0 };
    }
    sportMap[c.sport].courtCount += 1;
    sportMap[c.sport].availableMinutes += c.availableMinutes;
    sportMap[c.sport].usedMinutes += c.usedMinutes;
  }
  const bySport = Object.values(sportMap).map((item) => ({
    ...item,
    utilizationRate: percent(item.usedMinutes, item.availableMinutes),
  }));

  // Daily timeline breakdown
  const dailyTimeline = days.map((day) => {
    const dayDate = day.toISOString().split('T')[0];
    const opStart = atUtcMinutes(day, facilityOpenMinutes).getTime();
    const opEnd = atUtcMinutes(day, facilityCloseMinutes).getTime();

    let dayAvail = 0;
    let dayUsed = 0;

    for (const court of courts) {
      let nominal = (opEnd - opStart) / MINUTE;
      const courtMaint = (store.maintenance || []).filter((m) => m.courtId === court.id);
      for (const m of courtMaint) {
        nominal -= overlapMs(opStart, opEnd, new Date(m.start).getTime(), new Date(m.end).getTime()) / MINUTE;
      }
      dayAvail += Math.max(0, nominal);

      const courtSessions = (store.bookingSessions || []).filter(
        (s) => s.courtId === court.id && activeStatuses.has(s.status)
      );
      for (const s of courtSessions) {
        const sStart = new Date(s.actualStart || s.scheduledStart).getTime();
        const sEnd = new Date(s.actualEnd || s.scheduledEnd).getTime();
        dayUsed += overlapMs(opStart, opEnd, sStart, sEnd) / MINUTE;
      }
    }

    return {
      date: dayDate,
      availableMinutes: Math.round(dayAvail),
      usedMinutes: Math.round(dayUsed),
      utilizationRate: percent(dayUsed, dayAvail),
    };
  });

  return {
    success: true,
    data: {
      facility: {
        id: facility.id,
        name: facility.name,
        openTime: facility.openTime,
        closeTime: facility.closeTime,
      },
      filter: {
        from: start.toISOString(),
        to: end.toISOString(),
        sport: selectedSport,
        courtId: selectedCourtId,
        timePeriod,
      },
      kpis: {
        totalAvailableMinutes,
        totalAvailableHours: Number((totalAvailableMinutes / 60).toFixed(1)),
        totalUsedMinutes,
        totalUsedHours: Number((totalUsedMinutes / 60).toFixed(1)),
        utilizationRate: percent(totalUsedMinutes, totalAvailableMinutes),
        peakUtilizationRate: percent(totalPeakUsed, totalPeakAvailable),
        offPeakUtilizationRate: percent(totalOffPeakUsed, totalOffPeakAvailable),
        activeCourtCount: courts.length,
      },
      courts: courtMetrics,
      bySport,
      dailyTimeline,
    },
  };
}
