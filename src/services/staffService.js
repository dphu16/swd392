import { AppError, assert } from '../errors.js';
import { requireRole } from '../auth.js';

/**
 * UC48: Deactivate Staff Account
 * Primary Actor: Facility Manager (also permissible by Court Owner)
 * Business Rules: BR100, BR193, BR207, BR209, BR210, BR250, BR254
 */
export function deactivateStaffAccount(actor, targetStaffId, reason, store) {
  requireRole(actor, 'FACILITY_MANAGER', 'OWNER');

  assert(targetStaffId, 400, 'INVALID_INPUT', 'Target staff ID is required.');
  assert(reason && reason.trim(), 400, 'REASON_REQUIRED', 'A mandatory deactivation reason must be provided.');

  const targetStaff = store.users.find((u) => u.id === targetStaffId);
  assert(targetStaff, 404, 'STAFF_NOT_FOUND', `Staff account ${targetStaffId} not found.`);
  assert(targetStaff.role === 'STAFF', 400, 'INVALID_ACCOUNT_TYPE', 'Target user is not a staff member.');

  // BR100: Facility Manager can only manage staff assigned to their branch
  if (actor.role === 'FACILITY_MANAGER') {
    assert(
      actor.facilityId === targetStaff.facilityId,
      403,
      'BRANCH_FORBIDDEN',
      'Facility Manager can only manage staff assigned to their branch.'
    );
  }

  // PRE-2: Must have status ACTIVE or LOCKED
  assert(
    ['ACTIVE', 'LOCKED'].includes(targetStaff.status),
    400,
    'INVALID_STATUS',
    `Cannot deactivate an account with status ${targetStaff.status}. Only ACTIVE or LOCKED accounts can be deactivated.`
  );

  // PRE-3 / EX-1 / BR193: Check for active open shifts
  const openShift = store.shifts.find(
    (shift) => shift.staffId === targetStaffId && shift.status === 'OPEN'
  );
  if (openShift) {
    throw new AppError(
      400,
      'ACTIVE_SHIFT_CONFLICT',
      'Cannot deactivate staff while an open shift is active. Please close and reconcile the shift first.',
      { shiftId: openShift.id }
    );
  }

  // POST-1 / BR209: Transition status to INACTIVE without physical deletion
  targetStaff.status = 'INACTIVE';

  // POST-2 / BR210: Revoke active sessions and increment tokenVersion
  targetStaff.tokenVersion = (targetStaff.tokenVersion || 0) + 1;
  const revokedSessions = [];
  for (const session of store.sessions) {
    if (session.userId === targetStaffId && session.active) {
      session.active = false;
      revokedSessions.push(session.id);
    }
  }

  // POST-3: Unassign future scheduled shifts
  const unassignedShifts = [];
  for (const shift of store.shifts) {
    if (shift.staffId === targetStaffId && shift.status === 'SCHEDULED') {
      shift.staffId = null;
      shift.unassignedReason = `Staff ${targetStaffId} account deactivated: ${reason.trim()}`;
      unassignedShifts.push(shift.id);
    }
  }

  // Record audit log
  const auditEntry = {
    id: `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    action: 'STAFF_DEACTIVATED',
    performedBy: actor.id,
    targetUserId: targetStaffId,
    facilityId: targetStaff.facilityId,
    reason: reason.trim(),
    revokedSessionsCount: revokedSessions.length,
    unassignedShiftsCount: unassignedShifts.length,
    timestamp: new Date().toISOString(),
  };
  store.auditLogs.push(auditEntry);

  return {
    success: true,
    message: 'Staff account successfully deactivated.',
    data: {
      staff: {
        id: targetStaff.id,
        name: targetStaff.name,
        role: targetStaff.role,
        facilityId: targetStaff.facilityId,
        status: targetStaff.status,
        tokenVersion: targetStaff.tokenVersion,
      },
      revokedSessions,
      unassignedShifts,
      auditLog: auditEntry,
    },
  };
}
