/**
 * MOI SDK Adapter Interface
 *
 * This interface defines the contract for interacting with the MOI network.
 * It abstracts the MOI JS SDK to provide a clean integration layer.
 *
 * For real MOI SDK integration, implement this interface using:
 * - JsonRpcProvider for network connection
 * - LogicDriver for contract interactions
 * - Wallet/Signer for transaction preparation
 */

import type {
  IntelligenceObjectSummary,
  CategoryRef,
  Session,
  WritePayload,
  TransactionStatus,
} from '../../domain/models.js';
import type { Category, WriteAction, ValidationFailureReason } from '../../domain/types.js';

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
 * Session validation result from the adapter
 */
export interface SessionValidationResult {
  valid: boolean;
  reason: ValidationFailureReason | null;
}

/**
 * MOI SDK Adapter Interface
 *
 * This is the only layer that directly interacts with the MOI JS SDK.
 * All protocol/chain interactions flow through this adapter.
 */
export interface IMoiSdkAdapter {
  /**
   * Get the full intelligence object for a participant
   * @param participantId - The participant's unique identifier
   * @returns The intelligence object summary or null if not found
   */
  getIntelligenceObject(participantId: string): Promise<IntelligenceObjectSummary | null>;

  /**
   * Get specific category references for a participant
   * @param participantId - The participant's unique identifier
   * @param categories - Array of category names to fetch
   * @returns Map of category to CategoryRef
   */
  getCategoryRefs(
    participantId: string,
    categories: Category[]
  ): Promise<Partial<Record<Category, CategoryRef>>>;

  /**
   * Get a specific session for a participant
   * @param participantId - The participant's unique identifier
   * @param sessionId - The session ID
   * @returns The session or null if not found
   */
  getSession(participantId: string, sessionId: string): Promise<Session | null>;

  /**
   * Get all sessions for a participant
   * @param participantId - The participant's unique identifier
   * @returns Array of sessions
   */
  getSessions(participantId: string): Promise<Session[]>;

  /**
   * Find an existing valid session that satisfies the requirements
   * @param participantId - The participant's unique identifier
   * @param agentId - The agent requesting access
   * @param requiredCategories - Categories needed
   * @param requiredScopes - Scopes needed
   * @param currentTime - Current timestamp for expiry check
   * @returns Session if found, null otherwise
   */
  findValidSession(
    participantId: string,
    agentId: string,
    requiredCategories: Category[],
    requiredScopes: string[],
    currentTime: number
  ): Promise<Session | null>;

  /**
   * Validate a session against requirements
   * @param participantId - The participant's unique identifier
   * @param sessionId - The session ID
   * @param agentId - The agent ID to validate against
   * @param requiredCategories - Required categories
   * @param requiredScopes - Required scopes
   * @param currentTime - Current timestamp for validation
   * @returns Validation result with reason if invalid
   */
  validateSession(
    participantId: string,
    sessionId: string,
    agentId: string,
    requiredCategories: Category[],
    requiredScopes: string[],
    currentTime: number
  ): Promise<SessionValidationResult>;

  /**
   * Prepare a contract write for signing
   * @param action - The write action type
   * @param params - Action-specific parameters
   * @param participantId - The participant's unique identifier
   * @returns Prepared write ready for external signing
   */
  prepareContractWrite(
    action: WriteAction,
    params: Record<string, unknown>,
    participantId: string
  ): Promise<PreparedWrite>;

  /**
   * Submit a signed write to the MOI network
   * @param payload - The write payload
   * @param signature - The signature from external signing
   * @returns Result with transaction hash or error
   */
  submitSignedWrite(payload: WritePayload, signature: string): Promise<SubmitWriteResult>;

  /**
   * Get the status of a submitted transaction
   * @param txHash - The transaction hash
   * @returns Transaction status
   */
  getTransactionStatus(txHash: string): Promise<TransactionStatus>;
}
