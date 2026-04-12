/**
 * Structured audit logger for security-sensitive operations.
 * Logs to stdout in JSON format for easy ingestion by log aggregators.
 * 
 * Events logged: balance changes, password changes, account deletion,
 * login success/failure, token revocation, email changes, admin actions.
 */

const AUDIT_EVENTS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  LOGOUT: 'LOGOUT',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  PASSWORD_RESET: 'PASSWORD_RESET',
  BALANCE_SET: 'BALANCE_SET',
  BALANCE_ADJUSTED: 'BALANCE_ADJUSTED',
  ACCOUNT_DELETED: 'ACCOUNT_DELETED',
  EMAIL_CHANGE_REQUESTED: 'EMAIL_CHANGE_REQUESTED',
  EMAIL_CHANGE_CONFIRMED: 'EMAIL_CHANGE_CONFIRMED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  ADMIN_USER_UPDATED: 'ADMIN_USER_UPDATED',
  ADMIN_USER_DELETED: 'ADMIN_USER_DELETED',
  ADMIN_ROLE_CHANGED: 'ADMIN_ROLE_CHANGED',
};

/**
 * @param {string} event - One of AUDIT_EVENTS
 * @param {object} details - Event-specific details
 * @param {object} [req] - Express request object (optional, for IP/user-agent)
 */
function auditLog(event, details = {}, req = null) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: 'AUDIT',
    event,
    ...details,
  };

  if (req) {
    entry.ip = req.ip || req.connection?.remoteAddress;
    entry.userAgent = req.headers?.['user-agent'] || 'unknown';
    entry.requestId = req.id || undefined;
  }

  // Output as structured JSON for log aggregators
  console.log(JSON.stringify(entry));
}

module.exports = { auditLog, AUDIT_EVENTS };
