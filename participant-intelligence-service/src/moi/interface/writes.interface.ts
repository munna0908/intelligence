/**
 * Writes MOI Interface
 *
 * Handles MOI network interactions for write operations.
 */

import { getLogicDriver, getProvider } from '../config/provider.config.js';
import type { TransactionStatus } from '../../domain/models.js';
import { ACTION_METHOD_MAP } from '../../domain/models.js';
import type { WriteAction } from '../../domain/types.js';
import type { InteractionObject, InteractionRequest } from 'js-moi-sdk';
import { OpType, hexToBytes, bytesToHex } from 'js-moi-sdk';
import { documentEncode } from 'js-polo';
import { getCurrentTimestamp } from '../../utils/crypto.utils.js';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../../logging/index.js';

const TRANSFER_SCHEMA = {
  kind: 'struct',
  fields: {
    beneficiary: { kind: 'bytes' },
    amount: { kind: 'integer' },
  },
} as const;

/**
 * Result of preparing a contract write — contains the ixObject for client signing
 */
export interface PreparedWrite {
  method: string;
  ixObject: InteractionObject;
  expiresAt: number;
}

/**
 * Result of submitting a signed interaction
 */
export interface SubmitWriteResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Prepare a contract write by calling ixData() on the routine.
 * Returns an InteractionObject the client signs with their own wallet.
 *
 * For 'create_and_approve_session': prepares both CreateSessionRequest and
 * ApproveSession routines, then merges their ix_operations into one ixObject
 * so the wallet signs a single interaction.
 */
export async function prepareContractWrite(
  action: WriteAction,
  params: Record<string, unknown>,
  participantId: string
): Promise<PreparedWrite> {
  const logger = getLogger().child({ interface: 'writes' });
  const config = getConfig();

  logger.debug({ action, participantId }, 'prepareContractWrite');

  if (action === 'create_and_approve_session') {
    return prepareCreateAndApproveSession(params, participantId, config, logger);
  }

  const mapping = ACTION_METHOD_MAP[action];
  const driver = await getLogicDriver();

  const routineFn = driver.routines[mapping.method];
  if (!routineFn) {
    throw new Error(`Routine not found: ${mapping.method}`);
  }

  const args = buildArgsArray(mapping.method, params);
  logger.debug({ method: mapping.method, args: JSON.stringify(args, (_, v) => typeof v === 'bigint' ? v.toString() : v) }, 'buildArgsArray result');
  const ctx = routineFn(...args);

  const ixObject = await ctx.ixData({ fuel_limit: 5000 });

  return {
    method: mapping.method,
    ixObject,
    expiresAt: getCurrentTimestamp() + config.writeRequest.ttlSeconds,
  };
}

/**
 * Prepare CreateSessionRequest and ApproveSession as a single merged interaction.
 * Both routines' ix_operations are combined so the wallet signs once.
 */
async function prepareCreateAndApproveSession(
  params: Record<string, unknown>,
  participantId: string,
  config: ReturnType<typeof getConfig>,
  logger: ReturnType<typeof getLogger>
): Promise<PreparedWrite> {
  const driver = await getLogicDriver();

  const createRoutine = driver.routines['CreateSessionRequest'];
  const approveRoutine = driver.routines['ApproveSession'];

  if (!createRoutine) throw new Error('Routine not found: CreateSessionRequest');
  if (!approveRoutine) throw new Error('Routine not found: ApproveSession');

  // Build CreateSessionRequest ixObject
  const createArgs = buildArgsArray('CreateSessionRequest', params);
  logger.debug({ method: 'CreateSessionRequest', args: JSON.stringify(createArgs, (_, v) => typeof v === 'bigint' ? v.toString() : v) }, 'buildArgsArray result');
  const createCtx = createRoutine(...createArgs);
  const createIxObject = await createCtx.ixData({ fuel_limit: 5000 });

  // Build ApproveSession ixObject
  const approveArgs = buildArgsArray('ApproveSession', params);
  logger.debug({ method: 'ApproveSession', args: JSON.stringify(approveArgs, (_, v) => typeof v === 'bigint' ? v.toString() : v) }, 'buildArgsArray result');
  const approveCtx = approveRoutine(...approveArgs);
  const approveIxObject = await approveCtx.ixData({ fuel_limit: 5000 });

  // Merge: use createIxObject as base, append ApproveSession's ix_operations, double fuel
  const mergedIxObject: InteractionObject = {
    ...createIxObject,
    fuel_limit: (createIxObject.fuel_limit ?? 5000) + (approveIxObject.fuel_limit ?? 5000),
    ix_operations: [
      ...(createIxObject.ix_operations ?? []),
      ...(approveIxObject.ix_operations ?? []),
    ],
  };

  logger.debug({ ops: mergedIxObject.ix_operations?.length }, 'Merged ixObject for create_and_approve_session');

  return {
    method: 'CreateSessionRequest+ApproveSession',
    ixObject: mergedIxObject,
    expiresAt: getCurrentTimestamp() + config.writeRequest.ttlSeconds,
  };
}

/**
 * Prepare an InteractionObject for an asset transfer.
 * Uses OpType.ASSET_INVOKE with POLO-encoded calldata (same pattern as SDK's AccountInherit/ParticipantCreate).
 * Also validates the sender has sufficient balance before returning.
 * Throws an error with message 'insufficient_balance' (and .balance / .required) if low.
 * Throws an error with message 'asset_not_found' (and .assetId) if the asset doesn't exist in account.
 */
export async function prepareAssetTransfer(
  assetId: string,
  beneficiary: string,
  amount: number,
  sender?: string,
): Promise<InteractionObject> {
  const logger = getLogger().child({ interface: 'writes' });
  const config = getConfig();
  logger.debug({ assetId, beneficiary, amount, sender }, 'prepareAssetTransfer');

  // Balance check — skip in mock mode (no real chain to query)
  if (!config.moi.useMockAdapter && sender) {
    try {
      const provider = await getProvider();
      const balance = await provider.getBalance(sender, assetId);
      const balanceNum = Number(balance);
      logger.debug({ sender, assetId, balance: balanceNum, required: amount }, 'USD balance check');
      if (balanceNum < amount) {
        const err: any = new Error('insufficient_balance');
        err.balance = balanceNum;
        err.required = amount;
        throw err;
      }
    } catch (balanceErr: any) {
      if (balanceErr.message === 'insufficient_balance') throw balanceErr;
      // "asset not found" or similar — asset doesn't exist in this account
      const errMsg: string = (balanceErr.message ?? '').toLowerCase();
      if (errMsg.includes('not found') || errMsg.includes('asset')) {
        const err: any = new Error('asset_not_found');
        err.assetId = assetId;
        err.required = amount;
        throw err;
      }
      logger.warn({ error: balanceErr.message }, 'Balance check failed — proceeding anyway');
    }
  }

  // POLO-encode { beneficiary, amount } as calldata — same pattern as MAS0AssetLogic.transfer()
  const rawPayload = documentEncode(
    { beneficiary: hexToBytes(beneficiary as `0x${string}`), amount: BigInt(amount) },
    TRANSFER_SCHEMA,
  );

  // Mirror the exact structure MAS0AssetLogic.transfer() builds:
  // - asset_id and calldata have NO 0x prefix (raw hex)
  // - participants use 0x-prefixed addresses
  // - no sender field — wallet injects sender from the WalletConnect "from" param
  return {
    fuel_price: 1,
    fuel_limit: 1000,
    ix_operations: [
      {
        type: OpType.ASSET_INVOKE,
        payload: {
          asset_id: assetId.replace(/^0x/i, ''),
          callsite: 'Transfer',
          calldata: bytesToHex(rawPayload.bytes()),
        } as any,
      },
    ],
    participants: [
      { id: beneficiary, lock_type: 0 },   // MUTATE_LOCK — beneficiary account is credited
      { id: assetId, lock_type: 2 },        // NO_LOCK — asset state is read
    ],
  } as any;
}

/**
 * Submit a signed interaction to the MOI network.
 * The client signs the InteractionObject and sends back an InteractionRequest.
 */
export async function submitSignedWrite(
  signedIx: InteractionRequest
): Promise<SubmitWriteResult> {
  const logger = getLogger().child({ interface: 'writes' });
  logger.debug('submitSignedWrite');

  try {
    const provider = await getProvider();
    const response = await provider.sendInteraction(signedIx);
    const receipt = await response.wait();

    // receipt.status === 0 means success in MOI protocol
    if (receipt.status !== 0) {
      logger.error({ txHash: response.hash, status: receipt.status }, 'Transaction reverted on-chain');
      return {
        success: false,
        txHash: response.hash,
        error: `Transaction reverted on-chain (status: ${receipt.status})`,
      };
    }

    return {
      success: true,
      txHash: response.hash,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to submit signed write');

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Build the positional arguments array for a contract routine from the params object
 */
function buildArgsArray(method: string, params: Record<string, unknown>): unknown[] {
  switch (method) {
    case 'SetCategoryRef':
      return [
        params['category'],
        params['ref'],
        params['schemaVersion'],
        BigInt(params['updatedAt'] as number),
        params['updatedBy'],
      ];

    case 'RemoveCategoryRef':
      return [
        params['category'],
        BigInt(params['updatedAt'] as number),
      ];

    case 'CreateSessionRequest':
      return [
        params['sessionId'],
        params['agentId'],
        params['purpose'],
        params['requiredCategories'] ?? params['approvedCategories'],
        params['requiredScopes'] ?? params['approvedScopes'],
        BigInt(params['requestedUses'] as number),
        BigInt(params['ttlSeconds'] as number),
        params['approvalRef'] ?? '',
      ];

    case 'ApproveSession':
      return [
        params['sessionId'],
        BigInt((params['issuedAt'] as number) ?? getCurrentTimestamp()),
        BigInt(params['expiresAt'] as number),
        BigInt(params['remainingUses'] as number),
        params['approvalRef'] ?? '',
      ];

    case 'DenySession':
      return [
        params['sessionId'],
        params['reason'] ?? '',
      ];

    case 'RevokeSession':
      return [
        params['sessionId'],
        params['reason'] ?? '',
      ];

    case 'ConsumeSessionUse':
      return [
        params['sessionId'],
        BigInt((params['currentTime'] as number) ?? getCurrentTimestamp()),
      ];

    default:
      return Object.keys(params).sort().map(key => params[key]);
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

    // status === 0 means SUCCESS in MOI protocol
    if (receipt.status === 0) {
      return 'confirmed';
    }

    return 'failed';
  } catch (error) {
    logger.error({ txHash, error }, 'Failed to get transaction status');
    return 'pending';
  }
}
