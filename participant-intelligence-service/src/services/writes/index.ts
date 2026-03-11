/**
 * Writes Service
 *
 * Handles preparation and submission of signed writes to the MOI network.
 */

import type { IMoiSdkAdapter } from '../../adapters/moi-sdk/index.js';
import { getMoiSdkAdapter } from '../../adapters/moi-sdk/index.js';
import type {
  PrepareWriteRequest,
  PrepareWriteResponse,
  SubmitWriteRequest,
  SubmitWriteResponse,
  TransactionStatusResponse,
} from '../../domain/models.js';
import { ACTION_METHOD_MAP } from '../../domain/models.js';
import type { WriteAction } from '../../domain/types.js';
import { getLogger } from '../../logging/index.js';
import {
  updateCategoryRefParamsSchema,
  createSessionRequestParamsSchema,
  approveSessionParamsSchema,
  denySessionParamsSchema,
  revokeSessionParamsSchema,
} from '../../validation/schemas.js';
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
  private adapter: IMoiSdkAdapter;

  constructor(adapter?: IMoiSdkAdapter) {
    this.adapter = adapter ?? getMoiSdkAdapter();
  }

  /**
   * Prepare a signable write request
   *
   * Validates action and params, maps to contract method,
   * builds canonical payload, and computes signing digest.
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

      // Prepare the contract write via adapter
      const prepared = await this.adapter.prepareContractWrite(
        action,
        validatedParams,
        participantId
      );

      // Generate human-readable summary
      const summaryGenerator = ACTION_SUMMARIES[action];
      const summary = summaryGenerator(validatedParams);

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
   * Submit a signed write to the MOI network
   */
  async submitWrite(request: SubmitWriteRequest): Promise<SubmitWriteResponse> {
    const { requestId, participantId, action, payload, signature } = request;

    this.logger.info(
      {
        requestId,
        participantId,
        action,
        contract: payload.contract,
        method: payload.method,
        // Don't log full signature
        signaturePrefix: signature.slice(0, 10) + '...',
      },
      'Submitting signed write'
    );

    try {
      const result = await this.adapter.submitSignedWrite(payload, signature);

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
      const status = await this.adapter.getTransactionStatus(txHash);

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
