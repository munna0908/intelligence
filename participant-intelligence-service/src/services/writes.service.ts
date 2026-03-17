/**
 * Writes Service
 *
 * Handles preparation and submission of signed writes to the MOI network.
 */

import * as moiInterface from '../moi/interface/writes.interface.js';
import * as mockInterface from '../moi/interface/mock.interface.js';
import type {
  PrepareWriteRequest,
  PrepareWriteResponse,
  SubmitWriteRequest,
  SubmitWriteResponse,
  TransactionStatusResponse,
} from '../domain/models.js';
import type { WriteAction } from '../domain/types.js';
import { getConfig } from '../config/index.js';
import { getLogger } from '../logging/index.js';
import {
  updateCategoryRefParamsSchema,
  createSessionRequestParamsSchema,
  approveSessionParamsSchema,
  denySessionParamsSchema,
  revokeSessionParamsSchema,
} from '../validation/schemas.js';
import type { z } from 'zod';

// Action-specific parameter schemas
const ACTION_PARAMS_SCHEMAS: Record<WriteAction, z.ZodSchema> = {
  update_category_ref: updateCategoryRefParamsSchema,
  create_session_request: createSessionRequestParamsSchema,
  approve_session: approveSessionParamsSchema,
  deny_session: denySessionParamsSchema,
  revoke_session: revokeSessionParamsSchema,
};

// Action-specific summary generators
const ACTION_SUMMARIES: Record<WriteAction, (params: Record<string, unknown>) => string> = {
  update_category_ref: (params) => `Approve update of ${params['category']} category reference`,
  create_session_request: (params) => {
    const categories = params['requiredCategories'] as string[];
    return `Create session request for ${categories?.join(', ') ?? 'categories'}`;
  },
  approve_session: (params) => `Approve session ${params['sessionId']}`,
  deny_session: (params) => `Deny session ${params['sessionId']}`,
  revoke_session: (params) => `Revoke session ${params['sessionId']}`,
};

export interface IWritesService {
  prepareWrite(request: PrepareWriteRequest): Promise<PrepareWriteResponse>;
  submitWrite(request: SubmitWriteRequest): Promise<SubmitWriteResponse>;
  getTransactionStatus(txHash: string): Promise<TransactionStatusResponse>;
}

export class WritesService implements IWritesService {
  private logger = getLogger().child({ service: 'writes' });
  private useMock: boolean;

  constructor() {
    this.useMock = getConfig().moi.useMockAdapter;
  }

  /**
   * Prepare a signable write request
   *
   * Validates action and params, maps to contract method,
   * builds canonical payload, and computes signing digest.
   */
  async prepareWrite(request: PrepareWriteRequest): Promise<PrepareWriteResponse> {
    const { requestId, participantId, keyId = 0, action, params } = request;

    this.logger.info(
      { requestId, participantId, keyId, action },
      'Preparing write request'
    );

    try {
      // Validate params against action-specific schema
      const paramsSchema = ACTION_PARAMS_SCHEMAS[action];
      const validatedParams = paramsSchema.parse(params);

      // Prepare the contract write via interface
      // keyId is provided by the user (which key they'll sign with)
      const prepared = this.useMock
        ? await mockInterface.mockPrepareContractWrite(action, validatedParams, participantId, keyId)
        : await moiInterface.prepareContractWrite(action, validatedParams, participantId, keyId);

      // Generate human-readable summary
      const summaryGenerator = ACTION_SUMMARIES[action];
      const summary = summaryGenerator(validatedParams);

      // Note: The wallet builds ixArgs from this payload data
      // The server does NOT return ixArgs - the wallet generates it
      const response: PrepareWriteResponse = {
        requestId,
        status: 'ready_to_sign',
        action,
        summary,
        contract: prepared.contract,
        method: prepared.method,
        args: prepared.args,
        payload: prepared.payload,
        signingDigest: prepared.signingDigest,
        expiresAt: prepared.expiresAt,
        sender: prepared.sender,
      };

      this.logger.info(
        {
          requestId,
          participantId,
          action,
          method: prepared.method,
          expiresAt: prepared.expiresAt,
        },
        'Write request prepared'
      );

      return response;
    } catch (error) {
      this.logger.error(
        { requestId, participantId, action, error },
        'Failed to prepare write request'
      );
      throw error;
    }
  }

  /**
   * Submit a user-signed write to the MOI network
   *
   * The server NEVER signs transactions - it only relays user-signed interactions.
   */
  async submitWrite(request: SubmitWriteRequest): Promise<SubmitWriteResponse> {
    const { requestId, participantId, action, payload, signature, ixArgs, sender } = request;

    this.logger.info(
      {
        requestId,
        participantId,
        action,
        contract: payload.contract,
        method: payload.method,
        signaturePrefix: signature.slice(0, 10) + '...',
      },
      'Relaying user-signed write'
    );

    try {
      const result = this.useMock
        ? await mockInterface.mockSubmitSignedWrite(payload, signature)
        : await moiInterface.submitSignedWrite(ixArgs, signature, sender);

      if (!result.success) {
        this.logger.warn(
          { requestId, participantId, action, error: result.error },
          'Write submission failed'
        );

        return {
          requestId,
          status: 'failed',
          message: result.error ?? 'Transaction submission failed',
        };
      }

      this.logger.info(
        { requestId, participantId, action, txHash: result.txHash },
        'Write submitted successfully'
      );

      return {
        requestId,
        status: 'submitted',
        txHash: result.txHash,
        message: 'Transaction submitted successfully',
      };
    } catch (error) {
      this.logger.error(
        { requestId, participantId, action, error },
        'Failed to submit write'
      );
      throw error;
    }
  }

  /**
   * Get the status of a submitted transaction
   */
  async getTransactionStatus(txHash: string): Promise<TransactionStatusResponse> {
    this.logger.info({ txHash }, 'Fetching transaction status');

    try {
      const status = this.useMock
        ? await mockInterface.mockGetTransactionStatus(txHash)
        : await moiInterface.getTransactionStatus(txHash);

      this.logger.info({ txHash, status }, 'Transaction status retrieved');

      return { txHash, status };
    } catch (error) {
      this.logger.error({ txHash, error }, 'Failed to fetch transaction status');
      throw error;
    }
  }
}

// Singleton service instance
let serviceInstance: WritesService | null = null;

export function getWritesService(): WritesService {
  if (!serviceInstance) {
    serviceInstance = new WritesService();
  }
  return serviceInstance;
}

export function resetWritesService(): void {
  serviceInstance = null;
}
