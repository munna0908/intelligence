/**
 * Writes MOI Interface
 *
 * Handles MOI network interactions for write operations.
 * The server NEVER signs transactions - it only:
 * 1. Prepares payload data for user signing
 * 2. Relays user-signed interactions to the network
 *
 * Flow:
 * 1. Client calls /writes/prepare with action + params + participantId
 * 2. Server returns payload data (contract, method, args, sender info)
 * 3. OpenClaw creates a wallet deep link from the payload
 * 4. User's wallet builds ixArgs, signs, and returns ixArgs + signature
 * 5. Client calls /writes/submit with ixArgs + signature + sender
 * 6. Server relays the signed interaction to the MOI network
 */

import { getLogicDriver, getProvider } from '../config/provider.config.js';
import type { WritePayload, TransactionStatus } from '../../domain/models.js';
import { ACTION_METHOD_MAP } from '../../domain/models.js';
import type { WriteAction } from '../../domain/types.js';
import { generateNonce, computeSigningDigest } from '../../utils/crypto.utils.js';
import { getCurrentTimestamp } from '../../utils/index.js';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../../logging/index.js';

/**
 * Result of preparing a contract write
 *
 * OpenClaw uses this payload to create a wallet deep link.
 * The wallet handles building, encoding, signing, and submitting.
 */
export interface PreparedWrite {
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
  /** Sender info */
  sender: {
    id: string;
    keyId: number;
    sequence: number;
  };
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
 * Prepare a contract write for user signing
 *
 * Returns the payload data for OpenClaw to create a wallet deep link.
 * The wallet handles building, encoding, signing, and submitting.
 *
 * @param action - The write action to perform
 * @param params - Action-specific parameters
 * @param participantId - The user's participant ID (will be the sender)
 * @param keyId - The key ID the user will use for signing (default: 0)
 */
export async function prepareContractWrite(
  action: WriteAction,
  params: Record<string, unknown>,
  participantId: string,
  keyId: number = 0
): Promise<PreparedWrite> {
  const logger = getLogger().child({ interface: 'writes' });
  const config = getConfig();

  logger.debug({ action, participantId, keyId }, 'prepareContractWrite');

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

  // Verify the method exists in the contract
  const driver = await getLogicDriver();
  const routineFn = driver.routines[payload.method];
  if (!routineFn) {
    throw new Error(`Unknown method: ${payload.method}`);
  }

  // Get the current sequence (nonce) for the user's account
  const provider = await getProvider();
  const sequence = await provider.getPendingInteractionCount(participantId, keyId);

  // Compute a human-readable digest for display
  const signingDigest = computeSigningDigest(payload);
  const expiresAt = now + config.writeRequest.ttlSeconds;

  logger.info({
    method: payload.method,
    participantId,
    keyId,
    sequence: Number(sequence),
    expiresAt,
  }, 'Prepared write request');

  return {
    contract: config.moi.intelligenceLogicId,
    method: mapping.method,
    args: params,
    payload,
    signingDigest,
    expiresAt,
    sender: {
      id: participantId,
      keyId,
      sequence: Number(sequence),
    },
  };
}

/**
 * Submit a user-signed write to the MOI network
 *
 * The server does NOT sign anything - it only relays the wallet's signed interaction.
 *
 * @param ixArgs - The POLO-serialized interaction object as hex (from wallet)
 * @param signature - The wallet's signature of ixArgs
 * @param sender - Sender info for signature construction
 */
export async function submitSignedWrite(
  ixArgs: string,
  signature: string,
  sender: { id: string; keyId: number }
): Promise<SubmitWriteResult> {
  const logger = getLogger().child({ interface: 'writes' });

  logger.info(
    { sender: sender.id, signaturePrefix: signature.slice(0, 20) + '...' },
    'Relaying wallet-signed write to network'
  );

  try {
    const provider = await getProvider();

    // The wallet provides the fully serialized ixArgs and signature
    // We just need to build the InteractionRequest and relay
    const ixRequest = {
      ix_args: ixArgs,
      signatures: signature,
    };

    logger.debug({
      ixArgsLen: ixArgs.length,
      signatureLen: signature.length
    }, 'Sending interaction to network');

    // Submit to the network
    const response = await provider.sendInteraction(ixRequest);

    logger.info({ txHash: response.hash }, 'Transaction submitted, waiting for confirmation');
    await response.wait();

    return {
      success: true,
      txHash: response.hash,
    };
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : error },
      'Failed to relay wallet-signed write'
    );

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
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

    // In MOI, status 0 means success, non-zero means failure
    // Handle both number and string formats
    const status = receipt.status;
    const statusNum = typeof status === 'string' ? parseInt(status, 16) : Number(status);

    if (statusNum === 0) {
      return 'confirmed';
    }

    if (statusNum > 0) {
      return 'failed';
    }

    return 'pending';
  } catch (error) {
    logger.error({ txHash, error }, 'Failed to get transaction status');
    return 'pending';
  }
}
