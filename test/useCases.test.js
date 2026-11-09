import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { createSeedStore, createRepositories } from '../src/store.js';
import {
  deactivateStaffAccount,
  getCourtOccupancy,
  getBranchRevenue,
  getChainPerformance,
  getChainInventory,
} from '../src/services/index.js';
import { handleRequest } from '../src/router.js';

class MockResponse extends EventEmitter {
  constructor() {
    super();
    this.statusCode = 200;
    this.headers = {};
    this.chunks = [];
  }

  setHeader(key, value) {
    this.headers[key.toLowerCase()] = value;
  }

  writeHead(statusCode, headers = {}) {
    this.statusCode = statusCode;
    for (const [k, v] of Object.entries(headers)) {
      this.setHeader(k, v);
    }
  }

  write(chunk) {
    if (chunk) this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  end(chunk) {
    if (chunk) this.write(chunk);
    this.body = Buffer.concat(this.chunks).toString('utf-8');
    this.emit('finish');
  }
}

function simulateRequest(repositories, { method = 'GET', url = '/', headers = {}, body = null }) {
  return new Promise((resolve, reject) => {
    const rawBody = body ? (typeof body === 'string' ? body : JSON.stringify(body)) : '';
    const req = Readable.from(rawBody ? [Buffer.from(rawBody)] : []);
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost:3000', ...headers };

    const res = new MockResponse();
    res.on('finish', () => {
      let json = null;
      try {
        json = JSON.parse(res.body);
      } catch {
        json = res.body;
      }
      resolve({ status: res.statusCode, headers: res.headers, body: json });
    });

    handleRequest(req, res, repositories).catch(reject);
  });
}

describe('CourtChain Use Cases (UC48, UC49, UC50, UC62, UC63)', () => {
  let store;
  let owner;
  let manager1;
  let manager2;
  let staff1;
  let staff2;

  beforeEach(() => {
    store = createSeedStore();
    owner = store.users.find((u) => u.id === 'owner-1');
    manager1 = store.users.find((u) => u.id === 'manager-1');
    manager2 = store.users.find((u) => u.id === 'manager-2');
    staff1 = store.users.find((u) => u.id === 'staff-1');
    staff2 = store.users.find((u) => u.id === 'staff-2');
  });

  describe('UC48: Deactivate Staff Account', () => {
    it('should successfully deactivate active staff and enforce postconditions (POST-1, POST-2, POST-3)', () => {
      const initialTokenVersion = staff1.tokenVersion;
      const initialActiveSessions = store.sessions.filter((s) => s.userId === staff1.id && s.active).length;
      assert.ok(initialActiveSessions > 0);

      const result = deactivateStaffAccount(manager1, staff1.id, 'Employee resigned voluntarily', store);

      assert.equal(result.success, true);
      assert.equal(staff1.status, 'INACTIVE'); // POST-1 & BR209
      assert.equal(staff1.tokenVersion, initialTokenVersion + 1); // POST-2 & BR210

      // All sessions revoked
      const remainingActiveSessions = store.sessions.filter((s) => s.userId === staff1.id && s.active);
      assert.equal(remainingActiveSessions.length, 0);

      // Future scheduled shifts unassigned (POST-3)
      const scheduledShifts = store.shifts.filter((s) => s.id === 'shift-future-1');
      assert.equal(scheduledShifts[0].staffId, null);
      assert.ok(scheduledShifts[0].unassignedReason.includes('deactivated'));

      // Audit log recorded
      const log = store.auditLogs.find((l) => l.targetUserId === staff1.id);
      assert.ok(log);
      assert.equal(log.action, 'STAFF_DEACTIVATED');
      assert.equal(log.performedBy, manager1.id);
      assert.equal(log.reason, 'Employee resigned voluntarily');
    });

    it('should reject deactivation if staff has an active open shift (PRE-3, EX-1, BR193)', () => {
      // staff-2 has shift-open with status OPEN
      assert.throws(
        () => deactivateStaffAccount(manager1, staff2.id, 'Resigned', store),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'ACTIVE_SHIFT_CONFLICT');
          assert.match(err.message, /open shift is active/i);
          return true;
        }
      );
    });

    it('should reject deactivation when manager attempts to manage staff from another branch (PRE-1, EX-2, BR100)', () => {
      // staff-3 belongs to facility-2, manager-1 belongs to facility-1
      assert.throws(
        () => deactivateStaffAccount(manager1, 'staff-3', 'Transfer', store),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.code, 'BRANCH_FORBIDDEN');
          return true;
        }
      );
    });

    it('should require a mandatory deactivation reason', () => {
      assert.throws(
        () => deactivateStaffAccount(manager1, staff1.id, '   ', store),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'REASON_REQUIRED');
          return true;
        }
      );
    });

    it('should reject if actor is unauthorized role', () => {
      assert.throws(
        () => deactivateStaffAccount(staff1, staff2.id, 'Reason', store),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('should reject if target staff does not exist', () => {
      assert.throws(
        () => deactivateStaffAccount(manager1, 'non-existent-staff', 'Reason', store),
        (err) => {
          assert.equal(err.status, 404);
          assert.equal(err.code, 'STAFF_NOT_FOUND');
          return true;
        }
      );
    });

    it('should reject if target user is not a staff member', () => {
      assert.throws(
        () => deactivateStaffAccount(manager1, manager2.id, 'Reason', store),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'INVALID_ACCOUNT_TYPE');
          return true;
        }
      );
    });

    it('should reject if staff is already INACTIVE', () => {
      staff1.status = 'INACTIVE';
      assert.throws(
        () => deactivateStaffAccount(manager1, staff1.id, 'Reason', store),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'INVALID_STATUS');
          return true;
        }
      );
    });

    it('should allow Court Owner to deactivate staff at any branch', () => {
      const result = deactivateStaffAccount(owner, 'staff-3', 'Chain re-organization', store);
      assert.equal(result.success, true);
      const staff3 = store.users.find((u) => u.id === 'staff-3');
      assert.equal(staff3.status, 'INACTIVE');
    });
  });

  describe('UC49: View Court Occupancy', () => {
    it('should calculate court occupancy, deducting maintenance windows and splitting peak vs off-peak (BR27, BR100, BR216)', () => {
      const result = getCourtOccupancy(
        manager1,
        {
          from: '2026-11-02',
          to: '2026-11-09',
        },
        store
      );

      assert.equal(result.success, true);
      assert.equal(result.data.facility.id, 'facility-1');
      assert.equal(result.data.kpis.activeCourtCount, 3);

      // Facility operating hours: 06:00 to 23:00 = 17h = 1020 mins/day/court
      // Across 7 days (Nov 2 to Nov 8), 3 courts = 7 * 3 * 1020 = 21,420 mins nominal
      // Maintenance-1 is on court-1 on 2026-11-03 10:00 to 12:00 = 2h = 120 mins
      // Total available = 21,420 - 120 = 21,300 mins
      assert.equal(result.data.kpis.totalAvailableMinutes, 21300);

      // Sessions in facility-1:
      // session-1: court-1, actual 17:05 to 18:55 = 110 mins
      // session-2: court-2, actual 08:00 to 10:00 = 120 mins
      // (session-3 is NO_SHOW, session-6 is CANCELLED -> not active court use)
      // Total used minutes = 110 + 120 = 230 mins
      assert.equal(result.data.kpis.totalUsedMinutes, 230);
      assert.ok(result.data.kpis.utilizationRate > 0);

      // Court breakdown
      const court1 = result.data.courts.find((c) => c.courtId === 'court-1');
      assert.ok(court1);
      assert.equal(court1.usedMinutes, 110);
      assert.equal(court1.availableMinutes, 7 * 1020 - 120);

      // Peak metrics (17:00-22:00 = 300 mins/day)
      assert.ok(court1.peakMetrics.availableMinutes > 0);
      assert.equal(court1.peakMetrics.usedMinutes, 110);
    });

    it('should filter by sport correctly', () => {
      const result = getCourtOccupancy(
        manager1,
        {
          from: '2026-11-02',
          to: '2026-11-09',
          sport: 'BADMINTON',
        },
        store
      );

      assert.equal(result.data.courts.length, 1);
      assert.equal(result.data.courts[0].sport, 'BADMINTON');
    });

    it('should throw error for invalid date range (EX-1)', () => {
      assert.throws(
        () =>
          getCourtOccupancy(
            manager1,
            {
              from: '2026-11-10',
              to: '2026-11-05',
            },
            store
          ),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'INVALID_DATE_RANGE');
          return true;
        }
      );
    });

    it('should calculate PEAK and OFF_PEAK periods correctly', () => {
      const peakRes = getCourtOccupancy(
        manager1,
        {
          from: '2026-11-02',
          to: '2026-11-09',
          timePeriod: 'PEAK',
        },
        store
      );
      assert.equal(peakRes.data.filter.timePeriod, 'PEAK');
      assert.equal(peakRes.data.kpis.totalUsedMinutes, 110);

      const offPeakRes = getCourtOccupancy(
        manager1,
        {
          from: '2026-11-02',
          to: '2026-11-09',
          timePeriod: 'OFF_PEAK',
        },
        store
      );
      assert.equal(offPeakRes.data.filter.timePeriod, 'OFF_PEAK');
      assert.equal(offPeakRes.data.kpis.totalUsedMinutes, 120);
    });

    it('should handle zero booking activity gracefully (EX-2)', () => {
      const emptyRes = getCourtOccupancy(
        manager1,
        {
          from: '2026-12-01',
          to: '2026-12-08',
        },
        store
      );
      assert.equal(emptyRes.data.kpis.totalUsedMinutes, 0);
      assert.equal(emptyRes.data.kpis.utilizationRate, 0);
      assert.ok(emptyRes.data.kpis.totalAvailableMinutes > 0);
    });
  });

  describe('UC50: View Branch Revenue', () => {
    it('should compute recognized revenue, separate liabilities, and calculate direct COGS & gross profit (BR50, BR100, BR163, BR217, BR218)', () => {
      const result = getBranchRevenue(
        manager1,
        {
          from: '2026-11-01',
          to: '2026-11-10',
        },
        store
      );

      assert.equal(result.success, true);
      assert.equal(result.data.facility.id, 'facility-1');

      // Recognized entries in facility-1:
      // rev-1: gross=300,000, refund=0, cogs=0 (COURT_FEES, VNPAY)
      // rev-2: gross=100,000, refund=0, cogs=20,000 (EQUIPMENT_RENTALS, CASH)
      // rev-3: gross=80,000, refund=10,000, cogs=35,000 (RETAIL, VIETQR)
      // Total Gross = 480,000 VND
      // Total Refund = 10,000 VND
      // Net Revenue = 470,000 VND
      // Direct COGS = 55,000 VND
      // Gross Operating Profit = 470,000 - 55,000 = 415,000 VND
      const kpis = result.data.kpis;
      assert.equal(kpis.grossRevenue, 480000);
      assert.equal(kpis.totalRefunds, 10000);
      assert.equal(kpis.netRevenue, 470000);
      assert.equal(kpis.directCogs, 55000);
      assert.equal(kpis.grossOperatingProfit, 415000);

      // Separate liabilities (BR217):
      // rev-4: UNSERVED_PREPAYMENT = 250,000
      // rev-5: ACTIVE_DEPOSIT = 500,000
      const liabilities = result.data.liabilities;
      assert.equal(liabilities.unservedPrepayments, 250000);
      assert.equal(liabilities.activeDeposits, 500000);
      assert.equal(liabilities.totalLiabilities, 750000);

      // Channel breakdown (BR163)
      const byChannel = result.data.breakdowns.byChannel;
      const vnpay = byChannel.find((c) => c.channel === 'VNPAY');
      assert.equal(vnpay.netRevenue, 300000);
      const cash = byChannel.find((c) => c.channel === 'CASH');
      assert.equal(cash.netRevenue, 100000);
      const vietqr = byChannel.find((c) => c.channel === 'VIETQR');
      assert.equal(vietqr.netRevenue, 70000);
    });

    it('should filter branch revenue by category', () => {
      const result = getBranchRevenue(
        manager1,
        {
          from: '2026-11-01',
          to: '2026-11-10',
          category: 'COURT_FEES',
        },
        store
      );

      assert.equal(result.data.kpis.grossRevenue, 300000);
      assert.equal(result.data.kpis.netRevenue, 300000);
    });

    it('should filter branch revenue by payment channel', () => {
      const result = getBranchRevenue(
        manager1,
        {
          from: '2026-11-01',
          to: '2026-11-10',
          channel: 'CASH',
        },
        store
      );

      assert.equal(result.data.kpis.grossRevenue, 100000);
      assert.equal(result.data.kpis.netRevenue, 100000);
    });

    it('should return empty KPIs when no revenue records exist in period (EX-1)', () => {
      const result = getBranchRevenue(
        manager1,
        {
          from: '2027-01-01',
          to: '2027-01-10',
        },
        store
      );

      assert.equal(result.data.kpis.grossRevenue, 0);
      assert.equal(result.data.kpis.netRevenue, 0);
      assert.equal(result.data.recordsCount, 0);
    });
  });

  describe('UC62: View Chain Performance', () => {
    it('should aggregate multi-branch revenue, gross profit, occupancy and no-show rates for Court Owner (BR101, BR216, BR217, BR218)', () => {
      const result = getChainPerformance(
        owner,
        {
          from: '2026-11-01',
          to: '2026-11-10',
        },
        store
      );

      assert.equal(result.success, true);
      const { chainKpis, branchComparisons, branchRankings } = result.data;

      // facility-1 net revenue: 470,000
      // facility-2 net revenue (rev-6: 420,000 + rev-7: 150,000 = 570,000)
      // Total Chain Net Revenue = 470,000 + 570,000 = 1,040,000 VND
      assert.equal(chainKpis.netRevenue, 1040000);

      // Direct COGS: 55,000 (fac-1) + 70,000 (fac-2 rev-7) = 125,000 VND
      assert.equal(chainKpis.directCogs, 125000);
      assert.equal(chainKpis.grossOperatingProfit, 1040000 - 125000);

      // Operations KPIs
      // Total sessions in period = 6, no-shows = 1 (session-3)
      assert.equal(chainKpis.operations.totalSessions, 6);
      assert.equal(chainKpis.operations.noShowSessions, 1);
      assert.ok(chainKpis.operations.noShowRate > 0);

      // Branch comparisons and rankings
      assert.equal(branchComparisons.length, 2);
      assert.equal(branchRankings.length, 2);
      // facility-2 had 570k vs facility-1 had 470k, so rank 1 is facility-2
      assert.equal(branchRankings[0].facilityId, 'facility-2');
      assert.equal(branchRankings[0].rank, 1);
    });

    it('should reject non-owner actors attempting to view chain performance', () => {
      assert.throws(
        () => getChainPerformance(manager1, {}, store),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });

    it('should filter chain performance by specific branch and booking type', () => {
      const result = getChainPerformance(
        owner,
        {
          from: '2026-11-01',
          to: '2026-11-10',
          facilityIds: 'facility-1',
          bookingType: 'SINGLE',
        },
        store
      );
      assert.equal(result.data.branchComparisons.length, 1);
      assert.equal(result.data.branchComparisons[0].facilityId, 'facility-1');
    });

    it('should throw error when no valid branches match (EX-1)', () => {
      assert.throws(
        () =>
          getChainPerformance(
            owner,
            {
              from: '2026-11-01',
              to: '2026-11-10',
              facilityIds: 'non-existent-facility',
            },
            store
          ),
        (err) => {
          assert.equal(err.status, 400);
          assert.equal(err.code, 'NO_BRANCH_SELECTED');
          return true;
        }
      );
    });
  });

  describe('UC63: View Chain Inventory', () => {
    it('should calculate available stock, moving average valuation, track in-transit transfers, and detect shortages/surpluses (BR101, BR168, BR169, BR215, BR229)', () => {
      const result = getChainInventory(owner, {}, store);

      assert.equal(result.success, true);
      const { kpis, items, crossBranchMatrix, transferSuggestions } = result.data;

      assert.equal(kpis.totalSkus, 4);

      // Product 1: WATER-01 at facility-1 (onHand: 80, held: 10, quarantined: 2, threshold: 25)
      // Available = 80 - 10 - 2 = 68 (BR168, BR169)
      const p1 = items.find((i) => i.id === 'product-1');
      assert.equal(p1.availableStock, 68);
      assert.equal(p1.status, 'IN_STOCK');
      assert.equal(p1.totalValuation, 80 * 5000); // 400,000 VND

      // Stocktake variance ratio (BR215): book=82, actual=80 -> (80-82)/82 = -2.44%
      assert.equal(p1.stocktake.varianceRatio, -2.44);

      // Product 4: PICKLE-RACKET at facility-2 (onHand: 0, held: 0, quarantined: 0) -> OUT_OF_STOCK
      const p4 = items.find((i) => i.id === 'product-4');
      assert.equal(p4.availableStock, 0);
      assert.equal(p4.status, 'OUT_OF_STOCK');

      // Product 3: WATER-01 at facility-2 (onHand: 18, held: 5, quarantined: 1) -> available: 12 <= threshold (20) -> LOW_STOCK
      // In-transit incoming from transfer-1: 20 units (BR229)
      const p3 = items.find((i) => i.id === 'product-3');
      assert.equal(p3.availableStock, 12);
      assert.equal(p3.status, 'LOW_STOCK');
      assert.equal(p3.inTransitIncoming, 20); // BR229

      // Check cross-branch matrix
      assert.ok(crossBranchMatrix.length >= 3);

      // Transfer suggestions (UC66 support):
      // For WATER-01: facility-1 has surplus, facility-2 has deficit -> transfer suggestion generated
      assert.ok(transferSuggestions.length > 0);
      const waterSuggestion = transferSuggestions.find((t) => t.sku === 'WATER-01');
      assert.ok(waterSuggestion);
      assert.equal(waterSuggestion.sourceFacilityId, 'facility-1');
      assert.equal(waterSuggestion.destinationFacilityId, 'facility-2');
    });

    it('should filter inventory by status, category, and search query', () => {
      const lowStock = getChainInventory(owner, { status: 'LOW_STOCK' }, store);
      assert.ok(lowStock.data.items.every((i) => i.status === 'LOW_STOCK'));

      const rentals = getChainInventory(owner, { category: 'RENTAL' }, store);
      assert.ok(rentals.data.items.every((i) => i.category === 'RENTAL'));

      const searchWater = getChainInventory(owner, { search: 'Mineral' }, store);
      assert.ok(searchWater.data.items.length >= 2);
      assert.ok(searchWater.data.items.every((i) => i.name.includes('Mineral')));
    });

    it('should return empty list when no items match search query (EX-1)', () => {
      const result = getChainInventory(owner, { search: 'NonExistentProduct' }, store);
      assert.equal(result.data.items.length, 0);
    });

    it('should reject non-owner actors attempting to view chain inventory', () => {
      assert.throws(
        () => getChainInventory(manager1, {}, store),
        (err) => {
          assert.equal(err.status, 403);
          assert.equal(err.code, 'FORBIDDEN');
          return true;
        }
      );
    });
  });

  describe('End-to-End HTTP API Router', () => {
    let repos;

    beforeEach(() => {
      repos = createRepositories(createSeedStore());
    });

    it('GET /api/v1/health should return OK without authentication', async () => {
      const res = await simulateRequest(repos, {
        method: 'GET',
        url: '/api/v1/health',
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'OK');
    });

    it('should serve frontend static files: index.html, styles.css, app.js', async () => {
      const htmlRes = await simulateRequest(repos, { method: 'GET', url: '/' });
      assert.equal(htmlRes.status, 200);
      assert.ok(htmlRes.headers['content-type'].includes('text/html'));
      assert.ok(typeof htmlRes.body === 'string' && htmlRes.body.includes('CourtChain Management Portal'));

      const cssRes = await simulateRequest(repos, { method: 'GET', url: '/styles.css' });
      assert.equal(cssRes.status, 200);
      assert.ok(cssRes.headers['content-type'].includes('text/css'));

      const jsRes = await simulateRequest(repos, { method: 'GET', url: '/app.js' });
      assert.equal(jsRes.status, 200);
      assert.ok(jsRes.headers['content-type'].includes('application/javascript'));
    });

    it('GET /api/v1/meta should return system metadata without authentication', async () => {
      const res = await simulateRequest(repos, { method: 'GET', url: '/api/v1/meta' });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.body.users));
      assert.ok(Array.isArray(res.body.facilities));
    });

    it('GET /api/v1/context should return context for authenticated user', async () => {
      const res = await simulateRequest(repos, {
        method: 'GET',
        url: '/api/v1/context',
        headers: { 'x-user-id': 'manager-1' },
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.currentUser.id, 'manager-1');
      assert.equal(res.body.currentUser.role, 'FACILITY_MANAGER');
    });

    it('should require authentication header x-user-id for protected routes', async () => {
      const res = await simulateRequest(repos, {
        method: 'GET',
        url: '/api/v1/analytics/occupancy',
      });
      assert.equal(res.status, 401);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'AUTH_REQUIRED');
    });

    it('POST /api/v1/staff/:id/deactivate should deactivate staff', async () => {
      const res = await simulateRequest(repos, {
        method: 'POST',
        url: '/api/v1/staff/staff-1/deactivate',
        headers: {
          'x-user-id': 'manager-1',
          'content-type': 'application/json',
        },
        body: { reason: 'Resigned' },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.staff.status, 'INACTIVE');
    });

    it('GET /api/v1/analytics/chain-performance should return performance data for Court Owner', async () => {
      const res = await simulateRequest(repos, {
        method: 'GET',
        url: '/api/v1/analytics/chain-performance',
        headers: {
          'x-user-id': 'owner-1',
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.ok(res.body.data.chainKpis.netRevenue > 0);
    });

    it('GET /api/v1/analytics/chain-inventory should return inventory matrix for Court Owner', async () => {
      const res = await simulateRequest(repos, {
        method: 'GET',
        url: '/api/v1/analytics/chain-inventory',
        headers: {
          'x-user-id': 'owner-1',
        },
      });

      assert.equal(res.status, 200);
      assert.equal(res.body.success, true);
      assert.equal(res.body.data.kpis.totalSkus, 4);
    });

    it('should return 404 for unknown route', async () => {
      const res = await simulateRequest(repos, {
        method: 'GET',
        url: '/api/v1/non-existent-endpoint',
        headers: {
          'x-user-id': 'owner-1',
        },
      });

      assert.equal(res.status, 404);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'NOT_FOUND');
    });

    it('should return 400 when JSON body is invalid', async () => {
      const res = await simulateRequest(repos, {
        method: 'POST',
        url: '/api/v1/staff/staff-1/deactivate',
        headers: {
          'x-user-id': 'manager-1',
        },
        body: 'invalid-json{{{',
      });

      assert.equal(res.status, 400);
      assert.equal(res.body.success, false);
      assert.equal(res.body.error.code, 'INVALID_JSON');
    });
  });
});
