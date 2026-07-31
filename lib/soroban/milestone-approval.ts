/**
 * Soroban Milestone Approval Transaction Service
 *
 * Builds, signs, and submits Soroban smart contract transactions for
 * milestone approval on the Stellar network. Provides real-time status
 * feedback throughout the transaction lifecycle.
 *
 * Requirements addressed:
 * - Build Transaction: Construct a Soroban transaction for milestone approval
 * - User Signature: Prompt the user to sign with their connected wallet
 * - Submit Transaction: Send to the Stellar network for execution
 * - Display Transaction Status: Real-time feedback (pending, confirmed, failed)
 */

import {
  TransactionBuilder,
  SorobanRpc,
  nativeToScVal,
  scValToNative,
  xdr,
  Contract,
  Networks,
  Account,
} from "@stellar/stellar-sdk";

// ── Types ───────────────────────────────────────────────────────────────────

export type MilestoneApprovalStatus =
  | "idle"
  | "building"
  | "awaiting_signature"
  | "submitting"
  | "pending"
  | "confirmed"
  | "failed";

export interface MilestoneApprovalState {
  status: MilestoneApprovalStatus;
  txHash: string | null;
  error: string | null;
  statusMessage: string;
}

export interface MilestoneApprovalParams {
  /** Stellar account ID of the client (approver). */
  clientAccountId: string;
  /** Deployed Soroban contract ID for the escrow/milestone contract. */
  contractId: string;
  /** Milestone ID to approve (passed as argument to the contract). */
  milestoneId: string;
  /** Network passphrase (Networks.TESTNET or Networks.PUBLIC). */
  networkPassphrase: string;
  /** Soroban RPC server URL. */
  rpcUrl: string;
  /** Callback to obtain the user's signed XDR envelope. */
  signTransaction: (txXdr: string) => Promise<string>;
  /** Optional callback for status updates. */
  onStatusChange?: (state: MilestoneApprovalState) => void;
}

// ── Status Helper ───────────────────────────────────────────────────────────

function createState(
  status: MilestoneApprovalStatus,
  overrides: Partial<MilestoneApprovalState> = {}
): MilestoneApprovalState {
  const messages: Record<MilestoneApprovalStatus, string> = {
    idle: "Ready to approve milestone",
    building: "Building Soroban transaction...",
    awaiting_signature: "Please sign the transaction in your wallet",
    submitting: "Submitting transaction to Stellar network...",
    pending: "Transaction submitted — waiting for confirmation...",
    confirmed: "✅ Milestone approved successfully on-chain!",
    failed: "❌ Transaction failed",
  };

  return {
    status,
    txHash: null,
    error: null,
    statusMessage: messages[status],
    ...overrides,
  };
}

// ── Main Service ────────────────────────────────────────────────────────────

/**
 * Build, sign, submit, and track a Soroban milestone approval transaction.
 *
 * Flow:
 *   1. Build a Soroban transaction invoking `approve_milestone` on the contract
 *   2. Request wallet signature via the provided callback
 *   3. Submit to the Soroban RPC endpoint
 *   4. Poll for transaction status until confirmed or failed
 *   5. Report the final state
 */
export async function approveMilestoneOnChain(
  params: MilestoneApprovalParams
): Promise<MilestoneApprovalState> {
  const {
    clientAccountId,
    contractId,
    milestoneId,
    networkPassphrase,
    rpcUrl,
    signTransaction,
    onStatusChange,
  } = params;

  let state: MilestoneApprovalState = createState("idle");

  const emitState = (update: MilestoneApprovalState) => {
    state = update;
    onStatusChange?.(state);
  };

  try {
    // ── 1. Build Transaction ──────────────────────────────────────────────
    emitState(createState("building"));

    const server = new SorobanRpc.Server(rpcUrl);
    const contract = new Contract(contractId);

    // Get the account's current sequence number
    const account = await server.getAccount(clientAccountId);

    // Build the Soroban transaction to call approve_milestone( milestoneId )
    const tx = new TransactionBuilder(account, {
      fee: "100000", // 0.1 XLM fee — adjust based on fee estimation
      networkPassphrase,
      sorobanData: await server.getLatestLedger(),
    })
      .addOperation(contract.call("approve_milestone", [
        nativeToScVal(milestoneId, { type: "string" }),
      ]))
      .setTimeout(300) // 5 minute timeout
      .build();

    // Prepare the transaction (simulate to get footprint & fee)
    const prepareResponse = await server.prepareTransaction(tx);

    if (prepareResponse.error) {
      emitState(
        createState("failed", {
          error: `Simulation failed: ${prepareResponse.error}`,
        })
      );
      return state;
    }

    // ── 2. User Signature ────────────────────────────────────────────────
    emitState(createState("awaiting_signature"));

    const signedXdr = await signTransaction(prepareResponse.toXDR());

    // ── 3. Submit Transaction ──────────────────────────────────────────────
    emitState(createState("submitting"));

    const sendResponse = await server.sendTransaction(signedXdr);

    if (sendResponse.error) {
      emitState(
        createState("failed", {
          error: `Submission failed: ${sendResponse.error}`,
          txHash: sendResponse.hash || null,
        })
      );
      return state;
    }

    const txHash = sendResponse.hash;
    emitState(createState("pending", { txHash }));

    // ── 4. Poll for Confirmation ──────────────────────────────────────────
    const MAX_POLL_ATTEMPTS = 30;
    const POLL_INTERVAL_MS = 2000;

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const getTxResponse = await server.getTransaction(txHash);

      if (getTxResponse.status === "SUCCESS") {
        emitState(
          createState("confirmed", {
            txHash,
          })
        );
        return state;
      }

      if (getTxResponse.status === "FAILED") {
        emitState(
          createState("failed", {
            error: "Transaction failed on-chain — check contract requirements",
            txHash,
          })
        );
        return state;
      }

      // NOT_FOUND — keep polling
      emitState(
        createState("pending", {
          txHash,
          statusMessage: `Waiting for confirmation (${attempt + 1}/${MAX_POLL_ATTEMPTS})...`,
        })
      );
    }

    // Timeout
    emitState(
      createState("failed", {
        error: "Transaction confirmation timed out — check Stellar network status",
        txHash,
      })
    );
    return state;
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : "Unknown error during milestone approval";
    emitState(createState("failed", { error: errorMessage }));
    return state;
  }
}
