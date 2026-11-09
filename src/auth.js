import { AppError, assert } from './errors.js';

export function authenticate(request, repositories) {
  const userId = request.headers['x-user-id'];
  if (!userId) throw new AppError(401, 'AUTH_REQUIRED', 'Provide the x-user-id header.');
  const user = repositories.users.findById(userId);
  assert(user && user.status === 'ACTIVE', 401, 'INVALID_SESSION', 'The user session is invalid or inactive.');
  return user;
}

export function requireRole(user, ...roles) {
  assert(roles.includes(user.role), 403, 'FORBIDDEN', `Required role: ${roles.join(' or ')}.`);
}
