/**
 * Zod validation schemas for all API requests
 */

import { z } from 'zod';
import { CATEGORIES, WRITE_ACTIONS } from '../domain/types.js';

// Reusable schemas
const participantIdSchema = z.string().min(1, 'participantId is required');
const sessionIdSchema = z.string().min(1, 'sessionId is required');
const agentIdSchema = z.string().min(1, 'agentId is required');
const categorySchema = z.enum(CATEGORIES);
const categoriesArraySchema = z.array(categorySchema).min(1, 'At least one category is required');
const scopeSchema = z.string().min(1);
const scopesArraySchema = z.array(scopeSchema).min(1, 'At least one scope is required');

// GET /v1/intelligence/:participantId
export const getIntelligenceParamsSchema = z.object({
  participantId: participantIdSchema,
});

// POST /v1/categories/get
export const getCategoriesBodySchema = z.object({
  participantId: participantIdSchema,
  categories: categoriesArraySchema,
});

// GET /v1/sessions/:participantId/:sessionId
export const getSessionParamsSchema = z.object({
  participantId: participantIdSchema,
  sessionId: sessionIdSchema,
});

// POST /v1/sessions/ensure
export const ensureSessionBodySchema = z.object({
  participantId: participantIdSchema,
  agentId: agentIdSchema,
  purpose: z.string().min(1, 'purpose is required'),
  requiredCategories: categoriesArraySchema,
  requiredScopes: scopesArraySchema,
  requestedUses: z.number().int().positive('requestedUses must be a positive integer'),
  ttlSeconds: z.number().int().positive('ttlSeconds must be a positive integer'),
});

// POST /v1/sessions/validate
export const validateSessionBodySchema = z.object({
  participantId: participantIdSchema,
  agentId: agentIdSchema,
  sessionId: sessionIdSchema,
  requiredCategories: categoriesArraySchema,
  requiredScopes: scopesArraySchema,
  currentTime: z.number().int().positive('currentTime must be a positive integer'),
});

// POST /v1/writes/prepare - base schema
export const prepareWriteBodyBaseSchema = z.object({
  requestId: z.string().min(1, 'requestId is required'),
  participantId: participantIdSchema,
  keyId: z.number().int().nonnegative('keyId must be a non-negative integer').optional().default(0),
  action: z.enum(WRITE_ACTIONS),
  params: z.record(z.unknown()),
});

// Action-specific param schemas
export const updateCategoryRefParamsSchema = z.object({
  category: categorySchema,
  ref: z.string().min(1, 'ref is required'),
  schemaVersion: z.string().min(1, 'schemaVersion is required'),
  updatedAt: z.number().int().positive(),
});

export const createSessionRequestParamsSchema = z.object({
  agentId: agentIdSchema,
  purpose: z.string().min(1),
  requiredCategories: categoriesArraySchema,
  requiredScopes: scopesArraySchema,
  requestedUses: z.number().int().positive(),
  ttlSeconds: z.number().int().positive(),
});

export const approveSessionParamsSchema = z.object({
  sessionId: sessionIdSchema,
});

export const denySessionParamsSchema = z.object({
  sessionId: sessionIdSchema,
  reason: z.string().optional(),
});

export const revokeSessionParamsSchema = z.object({
  sessionId: sessionIdSchema,
  reason: z.string().optional(),
});

// Payload schema for submit
const writePayloadSchema = z.object({
  contract: z.string().min(1),
  method: z.string().min(1),
  args: z.record(z.unknown()),
  participantId: participantIdSchema,
  nonce: z.string().min(1),
});

// POST /v1/writes/submit
export const submitWriteBodySchema = z.object({
  requestId: z.string().min(1, 'requestId is required'),
  participantId: participantIdSchema,
  action: z.enum(WRITE_ACTIONS),
  payload: writePayloadSchema,
  signature: z.string().min(1, 'signature is required'),
  ixArgs: z.string().regex(/^0x[a-fA-F0-9]+$/, 'ixArgs must be a valid hex string'),
  sender: z.object({
    id: z.string().min(1, 'sender.id is required'),
    keyId: z.number().int().nonnegative('sender.keyId must be a non-negative integer'),
  }),
});

// GET /v1/writes/status/:txHash
export const getWriteStatusParamsSchema = z.object({
  txHash: z.string().regex(/^0x[a-fA-F0-9]+$/, 'txHash must be a valid hex string'),
});

// Type exports for use in handlers
export type GetIntelligenceParams = z.infer<typeof getIntelligenceParamsSchema>;
export type GetCategoriesBody = z.infer<typeof getCategoriesBodySchema>;
export type GetSessionParams = z.infer<typeof getSessionParamsSchema>;
export type EnsureSessionBody = z.infer<typeof ensureSessionBodySchema>;
export type ValidateSessionBody = z.infer<typeof validateSessionBodySchema>;
export type PrepareWriteBody = z.infer<typeof prepareWriteBodyBaseSchema>;
export type SubmitWriteBody = z.infer<typeof submitWriteBodySchema>;
export type GetWriteStatusParams = z.infer<typeof getWriteStatusParamsSchema>;
