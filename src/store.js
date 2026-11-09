export function createSeedStore() {
  return {
    users: [
      { id: 'owner-1', name: 'Court Owner', role: 'OWNER', status: 'ACTIVE' },
      { id: 'manager-1', name: 'Manager Hoa Lac', role: 'FACILITY_MANAGER', facilityId: 'facility-1', status: 'ACTIVE' },
      { id: 'manager-2', name: 'Manager Thach That', role: 'FACILITY_MANAGER', facilityId: 'facility-2', status: 'ACTIVE' },
      { id: 'staff-1', name: 'Nguyen Van A', role: 'STAFF', facilityId: 'facility-1', status: 'ACTIVE', tokenVersion: 3 },
      { id: 'staff-2', name: 'Tran Thi B', role: 'STAFF', facilityId: 'facility-1', status: 'LOCKED', tokenVersion: 1 },
      { id: 'staff-3', name: 'Le Van C', role: 'STAFF', facilityId: 'facility-2', status: 'ACTIVE', tokenVersion: 2 },
    ],
    facilities: [
      { id: 'facility-1', name: 'CourtChain Hoa Lac', status: 'ACTIVE', openTime: '06:00', closeTime: '23:00' },
      { id: 'facility-2', name: 'CourtChain Thach That', status: 'ACTIVE', openTime: '06:00', closeTime: '23:00' },
    ],
    courts: [
      { id: 'court-1', facilityId: 'facility-1', name: 'Badminton A1', sport: 'BADMINTON', status: 'ACTIVE' },
      { id: 'court-2', facilityId: 'facility-1', name: 'Pickleball P1', sport: 'PICKLEBALL', status: 'ACTIVE' },
      { id: 'court-3', facilityId: 'facility-1', name: 'Table Tennis T1', sport: 'TABLE_TENNIS', status: 'ACTIVE' },
      { id: 'court-4', facilityId: 'facility-2', name: 'Badminton B1', sport: 'BADMINTON', status: 'ACTIVE' },
      { id: 'court-5', facilityId: 'facility-2', name: 'Pickleball P2', sport: 'PICKLEBALL', status: 'ACTIVE' },
    ],
    maintenance: [
      { id: 'maintenance-1', courtId: 'court-1', start: '2026-11-03T10:00:00.000Z', end: '2026-11-03T12:00:00.000Z' },
      { id: 'maintenance-2', courtId: 'court-5', start: '2026-11-06T06:00:00.000Z', end: '2026-11-06T09:00:00.000Z' },
    ],
    bookingSessions: [
      { id: 'session-1', bookingType: 'SINGLE', courtId: 'court-1', status: 'COMPLETED', scheduledStart: '2026-11-02T17:00:00.000Z', scheduledEnd: '2026-11-02T19:00:00.000Z', actualStart: '2026-11-02T17:05:00.000Z', actualEnd: '2026-11-02T18:55:00.000Z' },
      { id: 'session-2', bookingType: 'RECURRING', courtId: 'court-2', status: 'COMPLETED', scheduledStart: '2026-11-03T08:00:00.000Z', scheduledEnd: '2026-11-03T10:00:00.000Z', actualStart: '2026-11-03T08:00:00.000Z', actualEnd: '2026-11-03T10:00:00.000Z' },
      { id: 'session-3', bookingType: 'WALK_IN', courtId: 'court-3', status: 'NO_SHOW', scheduledStart: '2026-11-04T18:00:00.000Z', scheduledEnd: '2026-11-04T19:00:00.000Z' },
      { id: 'session-4', bookingType: 'SINGLE', courtId: 'court-4', status: 'COMPLETED', scheduledStart: '2026-11-05T18:00:00.000Z', scheduledEnd: '2026-11-05T20:00:00.000Z', actualStart: '2026-11-05T18:00:00.000Z', actualEnd: '2026-11-05T20:10:00.000Z' },
      { id: 'session-5', bookingType: 'RECURRING', courtId: 'court-5', status: 'COMPLETED', scheduledStart: '2026-11-07T09:00:00.000Z', scheduledEnd: '2026-11-07T11:00:00.000Z', actualStart: '2026-11-07T09:10:00.000Z', actualEnd: '2026-11-07T11:00:00.000Z' },
      { id: 'session-6', bookingType: 'SINGLE', courtId: 'court-1', status: 'CANCELLED', scheduledStart: '2026-11-08T19:00:00.000Z', scheduledEnd: '2026-11-08T20:00:00.000Z', refundAmount: 120000 },
    ],
    revenueEntries: [
      { id: 'rev-1', facilityId: 'facility-1', deliveredAt: '2026-11-02T18:55:00.000Z', category: 'COURT_FEES', channel: 'VNPAY', grossAmount: 300000, refundAmount: 0, directCogs: 0 },
      { id: 'rev-2', facilityId: 'facility-1', deliveredAt: '2026-11-03T10:00:00.000Z', category: 'EQUIPMENT_RENTALS', channel: 'CASH', grossAmount: 100000, refundAmount: 0, directCogs: 20000 },
      { id: 'rev-3', facilityId: 'facility-1', deliveredAt: '2026-11-03T10:00:00.000Z', category: 'RETAIL', channel: 'VIETQR', grossAmount: 80000, refundAmount: 10000, directCogs: 35000 },
      { id: 'rev-4', facilityId: 'facility-1', receivedAt: '2026-11-08T08:00:00.000Z', category: 'COURT_FEES', channel: 'VNPAY', grossAmount: 250000, liabilityType: 'UNSERVED_PREPAYMENT' },
      { id: 'rev-5', facilityId: 'facility-1', receivedAt: '2026-11-08T08:00:00.000Z', category: 'EQUIPMENT_RENTALS', channel: 'CASH', grossAmount: 500000, liabilityType: 'ACTIVE_DEPOSIT' },
      { id: 'rev-6', facilityId: 'facility-2', deliveredAt: '2026-11-05T20:10:00.000Z', category: 'COURT_FEES', channel: 'CASH', grossAmount: 420000, refundAmount: 0, directCogs: 0 },
      { id: 'rev-7', facilityId: 'facility-2', deliveredAt: '2026-11-07T11:00:00.000Z', category: 'RETAIL', channel: 'VIETQR', grossAmount: 150000, refundAmount: 0, directCogs: 70000 },
    ],
    products: [
      { id: 'product-1', facilityId: 'facility-1', sku: 'WATER-01', name: 'Mineral Water', category: 'RETAIL', unit: 'BOTTLE', onHand: 80, held: 10, quarantined: 2, reorderThreshold: 25, movingAverageCost: 5000, stocktakeBook: 82, stocktakeActual: 80 },
      { id: 'product-2', facilityId: 'facility-1', sku: 'RACKET-01', name: 'Badminton Racket', category: 'RENTAL', unit: 'RACKET', onHand: 12, held: 8, quarantined: 1, reorderThreshold: 5, movingAverageCost: 350000, stocktakeBook: 12, stocktakeActual: 12 },
      { id: 'product-3', facilityId: 'facility-2', sku: 'WATER-01', name: 'Mineral Water', category: 'RETAIL', unit: 'BOTTLE', onHand: 18, held: 5, quarantined: 1, reorderThreshold: 20, movingAverageCost: 5200, stocktakeBook: 20, stocktakeActual: 18 },
      { id: 'product-4', facilityId: 'facility-2', sku: 'PICKLE-RACKET', name: 'Pickleball Paddle', category: 'RENTAL', unit: 'RACKET', onHand: 0, held: 0, quarantined: 0, reorderThreshold: 4, movingAverageCost: 600000, stocktakeBook: 2, stocktakeActual: 0 },
    ],
    transfers: [
      { id: 'transfer-1', status: 'DISPATCHED', sourceFacilityId: 'facility-1', destinationFacilityId: 'facility-2', lines: [{ sku: 'WATER-01', quantity: 20 }] },
    ],
    shifts: [
      { id: 'shift-open', staffId: 'staff-2', facilityId: 'facility-1', status: 'OPEN', startsAt: '2026-11-09T06:00:00.000Z' },
      { id: 'shift-future-1', staffId: 'staff-1', facilityId: 'facility-1', status: 'SCHEDULED', startsAt: '2026-11-12T06:00:00.000Z' },
    ],
    sessions: [
      { id: 'auth-session-1', userId: 'staff-1', active: true },
      { id: 'auth-session-2', userId: 'staff-2', active: true },
    ],
    auditLogs: [],
  };
}

export function createRepositories(store) {
  return {
    users: {
      findById: (id) => store.users.find((item) => item.id === id),
      save: (user) => user,
    },
    data: store,
  };
}
