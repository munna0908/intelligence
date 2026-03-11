/**
 * Real MOI SDK Adapter
 *
 * This adapter integrates with the actual MOI JS SDK for production use.
 * It uses the MOI protocol's JsonRpcProvider and LogicDriver for contract interactions.
 */

import type {
  IMoiSdkAdapter,
  PreparedWrite,
  SubmitWriteResult,
  SessionValidationResult,
} from './interface.js';
import type {
  IntelligenceObjectSummary,
  CategoryRef,
  Session,
  WritePayload,
} from '../../domain/models.js';
import { ACTION_METHOD_MAP } from '../../domain/models.js';
import type { Category, WriteAction, TransactionStatus, SessionStatus } from '../../domain/types.js';
import { generateNonce, computeSigningDigest, getCurrentTimestamp, isSubset } from '../../utils/index.js';
import { getConfig } from '../../config/index.js';
import { getLogger } from '../../logging/index.js';

// MOI SDK imports
// These types are approximations based on the SDK documentation
// Adjust as needed based on actual SDK exports
type JsonRpcProvider = {
  getInteractionReceipt(hash: string): Promise<InteractionReceipt | null>;
};

type InteractionReceipt = {
  hash: string;
  status: number | string | boolean;
  ix_operations?: Array<{ data?: Record<string, unknown> }>;
};

type LogicDriver = {
  routines: Record<string, (...args: unknown[]) => RoutineBuilder>;
  persistentState: {
    get(key: string, ...args: unknown[]): Promise<unknown>;
  };
};

type RoutineBuilder = {
  call(): Promise<unknown>;
  send(): Promise<{ hash: string; wait(): Promise<InteractionReceipt> }>;
};

type Signer = {
  connect(provider: JsonRpcProvider): Signer;
  // Other signer methods
};

/**
 * Contract response types matching the Coco contract structures
 */
interface ContractCategoryRef {
  Category: string;
  Ref: string;
  SchemaVersion: string;
  LastUpdated: bigint | number;
  Exists: boolean;
}

interface ContractSessionRecord {
  SessionId: string;
  AgentId: string;
  Status: string;
  Purpose: string;
  ApprovedCategories: string[];
  ApprovedScopes: string[];
  IssuedAt: bigint | number;
  ExpiresAt: bigint | number;
  RemainingUses: bigint | number;
  ApprovalRef: string;
  RevocationReason: string;
  Exists: boolean;
}

interface ContractValidationResult {
  Valid: boolean;
  Reason: string;
}

interface ContractIntelligenceObject {
  ActorId: string;
  Version: bigint | number;
  CategoryRefs: ContractCategoryRef[];
  ActiveSessions: Array<{
    SessionId: string;
    AgentId: string;
    Status: string;
    Purpose: string;
    ExpiresAt: bigint | number;
  }>;
  LastUpdatedAt: bigint | number;
}

// Dynamic imports for MOI SDK to handle missing packages gracefully
let JsonRpcProviderClass: (new (url: string) => JsonRpcProvider) | null = null;
let getLogicDriverFn: ((logicId: string, signer: Signer) => Promise<LogicDriver>) | null = null;
let WalletClass: (new () => Signer) | null = null;

async function loadMoiSdk(): Promise<void> {
  try {
    const sdk = await import('js-moi-sdk');
    JsonRpcProviderClass = sdk.JsonRpcProvider as unknown as typeof JsonRpcProviderClass;

    const logic = await import('js-moi-logic');
    getLogicDriverFn = logic.getLogicDriver as unknown as typeof getLogicDriverFn;

    const wallet = await import('js-moi-wallet');
    WalletClass = wallet.Wallet as unknown as typeof WalletClass;
  } catch {
    // SDK not available, will throw on usage
  }
}

/**
 * Real MOI SDK Adapter
 *
 * Uses the MOI JS SDK to interact with the Intelligence contract.
 */
export class RealMoiSdkAdapter implements IMoiSdkAdapter {
  private logger = getLogger().child({ adapter: 'real-moi-sdk' });
  private config = getConfig();
  private provider: JsonRpcProvider | null = null;
  private logicDriver: LogicDriver | null = null;
  private initPromise: Promise<void> | null = null;
  private sdkLoaded = false;

  constructor() {
    this.logger.info(
      { networkUrl: this.config.moi.networkUrl },
      'Initializing Real MOI SDK Adapter'
    );
  }

  /**
   * Ensure the SDK is loaded
   */
  private async ensureSdkLoaded(): Promise<void> {
    if (this.sdkLoaded) return;

    await loadMoiSdk();

    if (!JsonRpcProviderClass) {
      throw new Error(
        'MOI SDK not installed. Run: npm install js-moi-sdk js-moi-logic js-moi-wallet'
      );
    }

    this.sdkLoaded = true;
  }

  /**
   * Lazily initialize the logic driver
   */
  private async ensureLogicDriver(): Promise<LogicDriver> {
    if (this.logicDriver) {
      return this.logicDriver;
    }

    if (this.initPromise) {
      await this.initPromise;
      return this.logicDriver!;
    }

    this.initPromise = this.initializeLogicDriver();
    await this.initPromise;
    return this.logicDriver!;
  }

  private async initializeLogicDriver(): Promise<void> {
    await this.ensureSdkLoaded();

    const logicId = this.config.moi.intelligenceLogicId;

    if (!logicId) {
      throw new Error(
        'MOI_INTELLIGENCE_LOGIC_ID is not configured. Deploy the Intelligence contract first.'
      );
    }

    this.logger.info({ logicId }, 'Initializing LogicDriver');

    // Create provider
    this.provider = new JsonRpcProviderClass!(this.config.moi.networkUrl);

    // For read operations, we need a connected signer
    // Create a throwaway wallet just for reads (actual signing happens externally)
    if (!WalletClass || !getLogicDriverFn) {
      throw new Error('MOI SDK not properly loaded');
    }

    const wallet = new WalletClass();
    const connectedWallet = wallet.connect(this.provider);

    this.logicDriver = await getLogicDriverFn(logicId, connectedWallet);

    this.logger.info({ logicId }, 'LogicDriver initialized successfully');
  }

  /**
   * Convert bigint to number safely
   */
  private toNumber(value: bigint | number): number {
    if (typeof value === 'bigint') {
      return Number(value);
    }
    return value;
  }

  /**
   * Map contract CategoryRef to domain model
   */
  private mapCategoryRef(ref: ContractCategoryRef): CategoryRef {
    return {
      ref: ref.Ref,
      schemaVersion: ref.SchemaVersion,
      updatedAt: this.toNumber(ref.LastUpdated),
    };
  }

  /**
   * Map contract SessionRecord to domain model
   */
  private mapSession(record: ContractSessionRecord): Session {
    return {
      sessionId: record.SessionId,
      agentId: record.AgentId,
      status: record.Status as SessionStatus,
      purpose: record.Purpose,
      approvedCategories: record.ApprovedCategories as Category[],
      approvedScopes: record.ApprovedScopes,
      expiresAt: this.toNumber(record.ExpiresAt),
      remainingUses: this.toNumber(record.RemainingUses),
      createdAt: this.toNumber(record.IssuedAt),
    };
  }

  /**
   * Get the full intelligence object for a participant
   */
  async getIntelligenceObject(participantId: string): Promise<IntelligenceObjectSummary | null> {
    this.logger.debug({ participantId }, 'getIntelligenceObject');

    try {
      const driver = await this.ensureLogicDriver();

      // Call the GetIntelligenceObject endpoint
      const routineFn = driver.routines['GetIntelligenceObject'];
      if (!routineFn) {
        throw new Error('GetIntelligenceObject routine not found');
      }

      const result = await routineFn(participantId).call() as ContractIntelligenceObject;

      if (!result || this.toNumber(result.Version) === 0) {
        return null;
      }

      // Map category refs
      const categoryRefs: Partial<Record<Category, CategoryRef>> = {};
      for (const ref of result.CategoryRefs) {
        if (ref.Exists) {
          categoryRefs[ref.Category as Category] = this.mapCategoryRef(ref);
        }
      }

      // Get active sessions - we need to fetch full session details
      const sessions: Session[] = [];
      const getSessionFn = driver.routines['GetSession'];

      if (getSessionFn) {
        for (const summary of result.ActiveSessions) {
          const sessionRecord = await getSessionFn(participantId, summary.SessionId).call() as ContractSessionRecord;

          if (sessionRecord.Exists) {
            sessions.push(this.mapSession(sessionRecord));
          }
        }
      }

      return {
        participantId,
        version: this.toNumber(result.Version).toString(),
        categoryRefs,
        sessions,
        metadata: {
          updatedAt: this.toNumber(result.LastUpdatedAt),
        },
      };
    } catch (error) {
      this.logger.error({ participantId, error }, 'Failed to get intelligence object');
      throw error;
    }
  }

  /**
   * Get specific category references for a participant
   */
  async getCategoryRefs(
    participantId: string,
    categories: Category[]
  ): Promise<Partial<Record<Category, CategoryRef>>> {
    this.logger.debug({ participantId, categories }, 'getCategoryRefs');

    try {
      const driver = await this.ensureLogicDriver();
      const result: Partial<Record<Category, CategoryRef>> = {};

      const getCategoryRefFn = driver.routines['GetCategoryRef'];
      if (!getCategoryRefFn) {
        throw new Error('GetCategoryRef routine not found');
      }

      // Fetch each category ref individually
      for (const category of categories) {
        const ref = await getCategoryRefFn(participantId, category).call() as ContractCategoryRef;

        if (ref.Exists) {
          result[category] = this.mapCategoryRef(ref);
        }
      }

      return result;
    } catch (error) {
      this.logger.error({ participantId, categories, error }, 'Failed to get category refs');
      throw error;
    }
  }

  /**
   * Get a specific session for a participant
   */
  async getSession(participantId: string, sessionId: string): Promise<Session | null> {
    this.logger.debug({ participantId, sessionId }, 'getSession');

    try {
      const driver = await this.ensureLogicDriver();

      const getSessionFn = driver.routines['GetSession'];
      if (!getSessionFn) {
        throw new Error('GetSession routine not found');
      }

      const record = await getSessionFn(participantId, sessionId).call() as ContractSessionRecord;

      if (!record.Exists) {
        return null;
      }

      return this.mapSession(record);
    } catch (error) {
      this.logger.error({ participantId, sessionId, error }, 'Failed to get session');
      throw error;
    }
  }

  /**
   * Get all sessions for a participant
   * Note: The contract doesn't have a ListSessions endpoint, so we use GetIntelligenceObject
   */
  async getSessions(participantId: string): Promise<Session[]> {
    this.logger.debug({ participantId }, 'getSessions');

    try {
      const intelligenceObj = await this.getIntelligenceObject(participantId);
      return intelligenceObj?.sessions ?? [];
    } catch (error) {
      this.logger.error({ participantId, error }, 'Failed to get sessions');
      throw error;
    }
  }

  /**
   * Find an existing valid session that satisfies the requirements
   */
  async findValidSession(
    participantId: string,
    agentId: string,
    requiredCategories: Category[],
    requiredScopes: string[],
    currentTime: number
  ): Promise<Session | null> {
    this.logger.debug(
      { participantId, agentId, requiredCategories, requiredScopes },
      'findValidSession'
    );

    const sessions = await this.getSessions(participantId);

    for (const session of sessions) {
      if (
        session.status === 'ACTIVE' &&
        session.agentId === agentId &&
        session.expiresAt > currentTime &&
        session.remainingUses > 0 &&
        isSubset(requiredCategories, session.approvedCategories) &&
        isSubset(requiredScopes, session.approvedScopes)
      ) {
        return session;
      }
    }

    return null;
  }

  /**
   * Validate a session against requirements using the on-chain validator
   */
  async validateSession(
    participantId: string,
    sessionId: string,
    agentId: string,
    requiredCategories: Category[],
    requiredScopes: string[],
    currentTime: number
  ): Promise<SessionValidationResult> {
    this.logger.debug(
      { participantId, sessionId, agentId, requiredCategories, requiredScopes },
      'validateSession'
    );

    try {
      const driver = await this.ensureLogicDriver();

      const validateSessionFn = driver.routines['ValidateSession'];
      if (!validateSessionFn) {
        throw new Error('ValidateSession routine not found');
      }

      // Use the on-chain ValidateSession endpoint
      const result = await validateSessionFn(
        participantId,
        sessionId,
        agentId,
        requiredCategories,
        requiredScopes,
        BigInt(currentTime)
      ).call() as ContractValidationResult;

      // Map the reason from contract format to our domain type
      const reasonMap: Record<string, SessionValidationResult['reason']> = {
        'valid': null,
        'not_found': 'not_found',
        'wrong_status': 'wrong_status',
        'agent_mismatch': 'agent_mismatch',
        'expired': 'expired',
        'exhausted': 'exhausted',
        'missing_category': 'missing_category',
        'missing_scope': 'missing_scope',
      };

      return {
        valid: result.Valid,
        reason: result.Valid ? null : (reasonMap[result.Reason] ?? 'not_found'),
      };
    } catch (error) {
      this.logger.error(
        { participantId, sessionId, agentId, error },
        'Failed to validate session'
      );
      throw error;
    }
  }

  /**
   * Prepare a contract write for signing
   */
  async prepareContractWrite(
    action: WriteAction,
    params: Record<string, unknown>,
    participantId: string
  ): Promise<PreparedWrite> {
    this.logger.debug({ action, participantId }, 'prepareContractWrite');

    const mapping = ACTION_METHOD_MAP[action];
    const nonce = generateNonce();
    const now = getCurrentTimestamp();

    // Build the canonical payload
    const payload: WritePayload = {
      contract: mapping.contract,
      method: mapping.method,
      args: params,
      participantId,
      nonce,
    };

    // Compute the signing digest
    // In a full implementation, this would use MOI SDK's POLO serialization
    const signingDigest = computeSigningDigest(payload);
    const expiresAt = now + this.config.writeRequest.ttlSeconds;

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
   *
   * Note: This implementation calls the routine directly using the driver's signer.
   * For production with external signatures, you would need to:
   * 1. Build the interaction request manually
   * 2. Attach the external signature
   * 3. Use provider.sendInteraction() to submit
   */
  async submitSignedWrite(payload: WritePayload, _signature: string): Promise<SubmitWriteResult> {
    this.logger.debug(
      { contract: payload.contract, method: payload.method, nonce: payload.nonce },
      'submitSignedWrite'
    );

    try {
      const driver = await this.ensureLogicDriver();

      // Get the routine for the method
      const routineFn = driver.routines[payload.method];
      if (!routineFn) {
        return {
          success: false,
          error: `Unknown method: ${payload.method}`,
        };
      }

      // Build the arguments array from the args object
      const args = this.buildArgsArray(payload.method, payload.args);

      // Call the routine and send the interaction
      const response = await routineFn(...args).send();

      // Wait for the transaction to be included
      await response.wait();

      return {
        success: true,
        txHash: response.hash,
      };
    } catch (error) {
      this.logger.error(
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
  private buildArgsArray(method: string, args: Record<string, unknown>): unknown[] {
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
        // For unknown methods, convert args to array in sorted key order
        return Object.keys(args).sort().map(key => args[key]);
    }
  }

  /**
   * Get the status of a submitted transaction
   */
  async getTransactionStatus(txHash: string): Promise<TransactionStatus> {
    this.logger.debug({ txHash }, 'getTransactionStatus');

    try {
      if (!this.provider) {
        await this.ensureLogicDriver();
      }

      // Query the interaction receipt from the provider
      const receipt = await this.provider!.getInteractionReceipt(txHash);

      if (!receipt) {
        return 'pending';
      }

      // Check the receipt status
      const status = receipt.status;
      if (status === 1 || status === '0x1' || status === true) {
        return 'confirmed';
      }

      if (status === 0 || status === '0x0' || status === false) {
        return 'failed';
      }

      return 'pending';
    } catch (error) {
      this.logger.error({ txHash, error }, 'Failed to get transaction status');

      // If we can't fetch the receipt, assume pending
      return 'pending';
    }
  }
}
