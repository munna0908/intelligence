/**
 * Domain models for the Participant Intelligence Service
 */

import type {
  Category,
  SessionStatus,
  WriteAction,
  TransactionStatus,
  ValidationFailureReason,
} from './types.js';
import type { InteractionObject, InteractionRequest } from 'js-moi-sdk';

// Re-export SDK interaction types for use throughout the service
export type { InteractionObject, InteractionRequest };

// Re-export for convenience
export type { TransactionStatus } from './types.js';

// Category reference stored on-chain
export interface CategoryRef {
  ref: string;
  schemaVersion: string;
  updatedAt: number;
  updatedBy: string;
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

// Prepare write request
export interface PrepareWriteRequest {
  requestId: string;
  participantId: string;
  action: WriteAction;
  params: Record<string, unknown>;
}

// Prepare write response — client receives ixObject and signs it
export interface PrepareWriteResponse {
  requestId: string;
  status: 'ready_to_sign';
  action: WriteAction;
  summary: string;
  method: string;
  ixObject: InteractionObject;
  expiresAt: number;
}

// Submit write request — client sends back signed interaction
export interface SubmitWriteRequest {
  requestId: string;
  participantId: string;
  action: WriteAction;
  signedIx: InteractionRequest;
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
  create_and_approve_session: {
    contract: 'ParticipantIntelligenceEngine',
    method: 'CreateSessionRequest+ApproveSession',
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
