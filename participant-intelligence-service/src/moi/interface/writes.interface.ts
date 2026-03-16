/**
 * Writes MOI Interface
 *
 * Handles MOI network interactions for write operations.
 */

import { getLogicDriver, getProvider } from '../config/provider.config.js';
import type { WritePayload, TransactionStatus } from '../../domain/models.js';
import { ACTION_METHOD_MAP } from '../../domain/models.js';
import type { WriteAction } from '../../domain/types.js';
import { generateNonce, computeSigningDigest, getCurrentTimestamp } from '../../utils/crypto.utils.js';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../../logging/index.js';

/**
 * Result of preparing a contract write
 */
export interface PreparedWrite {
  contract: string;
  method: string;
  args: Record<string, unknown>;
  payload: WritePayload;
  signingDigest: string;
  expiresAt: number;
}

/**
 * Result of submitting a signed write
 */
export interface SubmitWriteResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Prepare a contract write for signing
 */
export async function prepareContractWrite(
  action: WriteAction,
  params: Record<string, unknown>,
  participantId: string
): Promise<PreparedWrite> {
  const logger = getLogger().child({ interface: 'writes' });
  const config = getConfig();

  logger.debug({ action, participantId }, 'prepareContractWrite');

  const mapping = ACTION_METHOD_MAP[action];
  const nonce = generateNonce();
  const now = getCurrentTimestamp();

  const payload: WritePayload = {
    contract: mapping.contract,
    method: mapping.method,
    args: params,
    participantId,
    nonce,
  };

  const signingDigest = computeSigningDigest(payload);
  const expiresAt = now + config.writeRequest.ttlSeconds;

  return {
    contract: mapping.contract,
    method: mapping.method,
    args: params,
    payload,
    signingDigest,
    expiresAt,
  };
}

/**
 * Submit a signed write to the MOI network
 */
export async function submitSignedWrite(
  payload: WritePayload,
  _signature: string
): Promise<SubmitWriteResult> {
  const logger = getLogger().child({ interface: 'writes' });

  logger.debug(
    { contract: payload.contract, method: payload.method, nonce: payload.nonce },
    'submitSignedWrite'
  );

  try {
    const driver = await getLogicDriver();

    const routineFn = driver.routines[payload.method];
    if (!routineFn) {
      return {
        success: false,
        error: `Unknown method: ${payload.method}`,
      };
    }

    const args = buildArgsArray(payload.method, payload.args);
    const response = await routineFn(...args).send();
    await response.wait();

    return {
      success: true,
      txHash: response.hash,
    };
  } catch (error) {
    logger.error(
      { method: payload.method, error },
      'Failed to submit signed write'
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Build arguments array from args object based on method signature
 */
function buildArgsArray(method: string, args: Record<string, unknown>): unknown[] {
  switch (method) {
    case 'SetCategoryRef':
      return [
        args['category'],
        args['ref'],
        args['schemaVersion'],
        BigInt(args['updatedAt'] as number),
      ];

    case 'RemoveCategoryRef':
      return [
        args['category'],
        BigInt(args['updatedAt'] as number),
      ];

    case 'CreateSessionRequest':
      return [
        args['sessionId'],
        args['agentId'],
        args['purpose'],
        args['approvedCategories'] ?? args['requiredCategories'],
        args['approvedScopes'] ?? args['requiredScopes'],
        BigInt(args['requestedUses'] as number),
        BigInt(args['ttlSeconds'] as number),
        args['approvalRef'] ?? '',
      ];

    case 'ApproveSession':
      return [
        args['sessionId'],
        BigInt((args['issuedAt'] as number) ?? getCurrentTimestamp()),
        BigInt(args['expiresAt'] as number),
        BigInt(args['remainingUses'] as number),
        args['approvalRef'] ?? '',
      ];

    case 'DenySession':
      return [
        args['sessionId'],
        args['reason'] ?? '',
      ];

    case 'RevokeSession':
      return [
        args['sessionId'],
        args['reason'] ?? '',
      ];

    case 'ConsumeSessionUse':
      return [
        args['sessionId'],
        BigInt((args['currentTime'] as number) ?? getCurrentTimestamp()),
      ];

    default:
      return Object.keys(args).sort().map(key => args[key]);
  }
}

/**
 * Get the status of a submitted transaction
 */
export async function getTransactionStatus(txHash: string): Promise<TransactionStatus> {
  const logger = getLogger().child({ interface: 'writes' });
  logger.debug({ txHash }, 'getTransactionStatus');

  try {
    const provider = await getProvider();
    const receipt = await provider.getInteractionReceipt(txHash);

    if (!receipt) {
      return 'pending';
    }

    const status = receipt.status;
    if (status === 1 || status === '0x1' || status === true) {
      return 'confirmed';
    }

    if (status === 0 || status === '0x0' || status === false) {
      return 'failed';
    }

    return 'pending';
  } catch (error) {
    logger.error({ txHash, error }, 'Failed to get transaction status');
    return 'pending';
  }
}
