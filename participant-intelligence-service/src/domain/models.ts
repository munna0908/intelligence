/**
 * Domain models for the Participant Intelligence Service
 */

import type {
  Category,
  SessionStatus,
  WriteAction,
  TransactionStatus,
  ValidationFailureReason,
  EnsureSessionStatus,
} from './types.js';

// Re-export for convenience
export type { TransactionStatus } from './types.js';

// Category reference stored on-chain
export interface CategoryRef {
  ref: string;
  schemaVersion: string;
  updatedAt: number;
}

// Session representing agent access grant
export interface Session {
  sessionId: string;
  agentId: string;
  status: SessionStatus;
  purpose: string;
  approvedCategories: Category[];
  approvedScopes: string[];
  expiresAt: number;
  remainingUses: number;
  createdAt?: number;
}

// Full participant intelligence object summary
export interface IntelligenceObjectSummary {
  participantId: string;
  version: string;
  categoryRefs: Partial<Record<Category, CategoryRef>>;
  sessions: Session[];
  metadata: {
    updatedAt: number;
  };
}

// Category refs response
export interface CategoryRefsResponse {
  participantId: string;
  categoryRefs: Partial<Record<Category, CategoryRef>>;
}

// Session validation request
export interface ValidateSessionRequest {
  participantId: string;
  agentId: string;
  sessionId: string;
  requiredCategories: Category[];
  requiredScopes: string[];
  currentTime: number;
}

// Session validation response
export interface ValidateSessionResponse {
  valid: boolean;
  reason: ValidationFailureReason | null;
}

// Ensure session request
export interface EnsureSessionRequest {
  participantId: string;
  agentId: string;
  purpose: string;
  requiredCategories: Category[];
  requiredScopes: string[];
  requestedUses: number;
  ttlSeconds: number;
}

// Write request payload structure
export interface WritePayload {
  contract: string;
  method: string;
  args: Record<string, unknown>;
  participantId: string;
  nonce: string;
}

// Write request structure (for pending signature response)
export interface WriteRequest {
  action: WriteAction;
  summary: string;
  payload: WritePayload;
  signingDigest: string;
}

// Ensure session response - approved
export interface EnsureSessionApproved {
  status: 'approved';
  sessionId: string;
}

// Ensure session response - pending signature
export interface EnsureSessionPendingSignature {
  status: 'pending_signature';
  sessionId: string;
  message: string;
  writeRequest: WriteRequest;
}

// Ensure session response - denied
export interface EnsureSessionDenied {
  status: 'denied';
  message: string;
}

export type EnsureSessionResponse =
  | EnsureSessionApproved
  | EnsureSessionPendingSignature
  | EnsureSessionDenied;

// Prepare write request
export interface PrepareWriteRequest {
  requestId: string;
  participantId: string;
  /** The key ID the user will use for signing (default: 0) */
  keyId?: number;
  action: WriteAction;
  params: Record<string, unknown>;
}

// Prepare write response
// Note: The wallet builds ixArgs from this payload data - the server does NOT build ixArgs
export interface PrepareWriteResponse {
  requestId: string;
  status: 'ready_to_sign';
  action: WriteAction;
  summary: string;
  /** Logic contract ID */
  contract: string;
  /** Method name to call */
  method: string;
  /** Method arguments */
  args: Record<string, unknown>;
  /** Full payload for reference */
  payload: WritePayload;
  /** Human-readable digest for display */
  signingDigest: string;
  /** When this prepared write expires */
  expiresAt: number;
  /** Sender info - wallet uses this to build the interaction */
  sender: {
    id: string;
    keyId: number;
    sequence: number;
  };
}

// Submit write request
// Note: The wallet builds ixArgs and signs it - the server only relays to network
export interface SubmitWriteRequest {
  requestId: string;
  participantId: string;
  action: WriteAction;
  payload: WritePayload;
  /** The wallet's signature of ixArgs */
  signature: string;
  /** The POLO-serialized interaction object as hex (built by wallet) */
  ixArgs: string;
  /** Sender info (from wallet) */
  sender: {
    id: string;
    keyId: number;
  };
}

// Submit write response
export interface SubmitWriteResponse {
  requestId: string;
  status: 'submitted' | 'failed';
  txHash?: string;
  message: string;
}

// Transaction status response
export interface TransactionStatusResponse {
  txHash: string;
  status: TransactionStatus;
}

// Action to contract method mapping
export const ACTION_METHOD_MAP: Record<WriteAction, { contract: string; method: string }> = {
  update_category_ref: {
    contract: 'ParticipantIntelligenceEngine',
    method: 'SetCategoryRef',
  },
  create_session_request: {
    contract: 'ParticipantIntelligenceEngine',
    method: 'CreateSessionRequest',
  },
  approve_session: {
    contract: 'ParticipantIntelligenceEngine',
    method: 'ApproveSession',
  },
  deny_session: {
    contract: 'ParticipantIntelligenceEngine',
    method: 'DenySession',
  },
  revoke_session: {
    contract: 'ParticipantIntelligenceEngine',
    method: 'RevokeSession',
  },
};
