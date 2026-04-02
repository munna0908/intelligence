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
  createAndApproveSessionParamsSchema,
  denySessionParamsSchema,
  revokeSessionParamsSchema,
} from '../validation/schemas.js';
import type { z } from 'zod';

// Action-specific parameter schemas
const ACTION_PARAMS_SCHEMAS: Record<WriteAction, z.ZodSchema> = {
  update_category_ref: updateCategoryRefParamsSchema,
  create_session_request: createSessionRequestParamsSchema,
  approve_session: approveSessionParamsSchema,
  create_and_approve_session: createAndApproveSessionParamsSchema,
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
  create_and_approve_session: (params) => {
    const categories = params['requiredCategories'] as string[];
    return `Create and approve session for ${categories?.join(', ') ?? 'categories'}`;
  },
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
   * Prepare a signable write request.
   *
   * Validates action and params, calls ixData() on the routine to build
   * the InteractionObject, and returns it to the client for signing.
   */
  async prepareWrite(request: PrepareWriteRequest): Promise<PrepareWriteResponse> {
    const { requestId, participantId, action, params } = request;

    this.logger.info(
      { requestId, participantId, action },
      'Preparing write request'
    );

    try {
      // Validate params against action-specific schema
      const paramsSchema = ACTION_PARAMS_SCHEMAS[action];
      const validatedParams = paramsSchema.parse(params);

      // Prepare the contract write via interface
      const prepared = this.useMock
        ? await mockInterface.mockPrepareContractWrite(action, validatedParams, participantId)
        : await moiInterface.prepareContractWrite(action, validatedParams, participantId);

      const summary = ACTION_SUMMARIES[action](validatedParams);

      const response: PrepareWriteResponse = {
        requestId,
        status: 'ready_to_sign',
        action,
        summary,
        method: prepared.method,
        ixObject: prepared.ixObject,
        expiresAt: prepared.expiresAt,
      };

      this.logger.info(
        { requestId, participantId, action, method: prepared.method, expiresAt: prepared.expiresAt },
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
   * Submit a signed interaction to the MOI network.
   *
   * The client receives the InteractionObject from prepareWrite, signs it
   * with their own wallet, and sends back the InteractionRequest here.
   */
  async submitWrite(request: SubmitWriteRequest): Promise<SubmitWriteResponse> {
    const { requestId, participantId, action, signedIx } = request;

    this.logger.info(
      { requestId, participantId, action },
      'Submitting signed write'
    );

    try {
      const result = this.useMock
        ? await mockInterface.mockSubmitSignedWrite(signedIx)
        : await moiInterface.submitSignedWrite(signedIx);

      if (!result.success) {
        this.logger.error(
          { requestId, participantId, action, error: result.error, txHash: result.txHash },
          'Write submission failed — MOI network rejected the transaction'
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
