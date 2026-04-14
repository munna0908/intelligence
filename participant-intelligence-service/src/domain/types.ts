/**
 * Domain types for the Participant Intelligence Service
 */

// Supported categories for v1
export const CATEGORIES = ['FOOD', 'HEALTH', 'ADDRESS', 'SCHEDULE'] as const;
export type Category = (typeof CATEGORIES)[number];

// Category to scope mapping
export const CATEGORY_SCOPE_MAP: Record<Category, string> = {
  FOOD: 'preferences.food.read',
  HEALTH: 'health.read',
  ADDRESS: 'profile.address.read',
  SCHEDULE: 'schedule.read',
} as const;

export type Scope = (typeof CATEGORY_SCOPE_MAP)[Category];

// Session status
export const SESSION_STATUSES = ['ACTIVE', 'PENDING', 'EXPIRED', 'REVOKED', 'DENIED'] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

// Write actions
export const WRITE_ACTIONS = [
  'update_category_ref',
  'create_session_request',
  'approve_session',
  'create_and_approve_session',
  'deny_session',
  'revoke_session',
] as const;
export type WriteAction = (typeof WRITE_ACTIONS)[number];

// Transaction status
export const TX_STATUSES = ['pending', 'confirmed', 'failed'] as const;
export type TransactionStatus = (typeof TX_STATUSES)[number];

// Session validation failure reasons
export const VALIDATION_FAILURE_REASONS = [
  'not_found',
  'wrong_status',
  'agent_mismatch',
  'expired',
  'exhausted',
  'missing_category',
  'missing_scope',
] as const;
export type ValidationFailureReason = (typeof VALIDATION_FAILURE_REASONS)[number];

