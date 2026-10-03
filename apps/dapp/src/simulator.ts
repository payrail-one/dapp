import {
  PayrailContractKit,
  bytesToHex,
  type ContractIntent,
  type ContractProvider,
} from '@payrail/contracts-sdk';
import { scenarioById, type ScenarioId } from './scenarios';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ATOMIC = /^(?:0|[1-9][0-9]{0,38})$/;

export interface SandboxDraft {
  readonly scenarioId: ScenarioId;
  readonly contractId: string;
  readonly caller: string;
  readonly entrypoint: string;
  readonly amountAtomic: string;
  readonly executionBudget: string;
  readonly nonce: string;
  readonly validUntilHeight: string;
  readonly argsJson: string;
}

export interface SandboxRun {
  readonly id: string;
  readonly createdAt: string;
  readonly scenarioId: ScenarioId;
  readonly accepted: boolean;
  readonly summary: string;
  readonly output: string;
  readonly snippet: string;
}

export function draftForScenario(
  id: ScenarioId,
  finalizedHeight = '1',
): SandboxDraft {
  const scenario = scenarioById(id);
  const height = canonicalUnsigned(finalizedHeight, 'finalizedHeight');
  return {
    scenarioId: id,
    contractId: scenario.contractId,
    caller: 'paydev.account.sandbox-user',
    entrypoint: scenario.entrypoint,
    amountAtomic: scenario.amountAtomic,
    executionBudget: scenario.executionBudget,
    nonce: '0',
    validUntilHeight: (height + 25n).toString(),
    argsJson: JSON.stringify(scenario.args, null, 2),
  };
}

export async function simulateDraft(draft: SandboxDraft): Promise<SandboxRun> {
  const args = parseArgs(draft.argsJson);
  const intentInput = {
    contractId: draft.contractId,
    caller: draft.caller,
    entrypoint: draft.entrypoint,
    args: encoder.encode(JSON.stringify(args)),
    attachedAmount: canonicalUnsigned(draft.amountAtomic, 'amountAtomic'),
    executionBudget: canonicalPositive(
      draft.executionBudget,
      'executionBudget',
    ),
    nonce: canonicalUnsigned(draft.nonce, 'nonce'),
    validUntilHeight: canonicalPositive(
      draft.validUntilHeight,
      'validUntilHeight',
    ),
  };
  const kit = new PayrailContractKit(providerFor(draft.scenarioId));
  const intent = kit.intent(intentInput);
  const simulation = await kit.simulate(intentInput);
  const createdAt = new Date().toISOString();
  const output = JSON.stringify(
    {
      mode: 'local-preview',
      accepted: simulation.accepted,
      networkWrite: false,
      contract: {
        id: intent.contractId,
        entrypoint: intent.entrypoint,
        caller: intent.caller,
      },
      value: {
        amountAtomic: intent.attachedAmount.toString(),
        executionBudget: intent.executionBudget.toString(),
        nonce: intent.nonce.toString(),
        validUntilHeight: intent.validUntilHeight.toString(),
      },
      result: {
        estimatedUnits: simulation.estimatedUnits.toString(),
        stateVersion: simulation.stateVersion.toString(),
        events: simulation.events,
        reason: simulation.reason,
      },
      encoding: {
        argsBytes: intent.args.byteLength,
        argsHex: bytesToHex(intent.args, true),
      },
      createdAt,
    },
    null,
    2,
  );
  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt,
    scenarioId: draft.scenarioId,
    accepted: simulation.accepted,
    summary: simulation.accepted
      ? `${scenarioById(draft.scenarioId).label} accepted locally`
      : (simulation.reason ?? 'Intent rejected locally'),
    output,
    snippet: sdkSnippet(draft),
  };
}

export function sdkSnippet(draft: SandboxDraft): string {
  return `import { PayrailContractKit } from '@payrail/contracts-sdk';

const kit = new PayrailContractKit(provider);
const args = new TextEncoder().encode(${JSON.stringify(draft.argsJson)});

const preview = await kit.simulate({
  contractId: ${JSON.stringify(draft.contractId)},
  caller: ${JSON.stringify(draft.caller)},
  entrypoint: ${JSON.stringify(draft.entrypoint)},
  args,
  attachedAmount: ${draft.amountAtomic}n,
  executionBudget: ${draft.executionBudget}n,
  nonce: ${draft.nonce}n,
  validUntilHeight: ${draft.validUntilHeight}n
});

// Preview only: explicit signing and a production provider are still required.
console.log(preview.accepted, preview.events);`;
}

export function serializeDraft(draft: SandboxDraft): string {
  parseArgs(draft.argsJson);
  canonicalUnsigned(draft.amountAtomic, 'amountAtomic');
  canonicalPositive(draft.executionBudget, 'executionBudget');
  canonicalUnsigned(draft.nonce, 'nonce');
  canonicalPositive(draft.validUntilHeight, 'validUntilHeight');
  return JSON.stringify({ version: 1, ...draft }, null, 2);
}

function providerFor(scenarioId: ScenarioId): ContractProvider {
  return {
    async describe(contractId) {
      const scenario = scenarioById(scenarioId);
      return {
        id: contractId,
        name: scenario.label,
        version: '0.1.0-local-preview',
        entrypoints: [scenario.entrypoint],
        stateVersion: 1n,
      };
    },
    async simulate(intent) {
      return evaluateScenario(scenarioId, intent);
    },
    async submit() {
      throw new Error(
        'The local preview provider cannot broadcast operations.',
      );
    },
  };
}

function evaluateScenario(id: ScenarioId, intent: ContractIntent) {
  const args = parseArgs(decoder.decode(intent.args));
  let accepted = false;
  let reason: string | null = null;
  let events: readonly string[] = [];
  if (id === 'escrow') {
    accepted = args.conditionVerified === true;
    reason = accepted ? null : 'The escrow condition is not verified.';
    events = accepted ? [`EscrowReleased:${text(args.reference)}`] : [];
  } else if (id === 'split') {
    const recipients = Array.isArray(args.recipients) ? args.recipients : [];
    const total = recipients.reduce(
      (sum, recipient) => sum + recipientBasisPoints(recipient),
      0n,
    );
    accepted = recipients.length >= 2 && total === 10_000n;
    reason = accepted
      ? null
      : 'Revenue shares must contain at least two recipients and total 10,000 bps.';
    events = accepted ? [`RevenueSplit:${recipients.length}`] : [];
  } else if (id === 'payout') {
    const limit = jsonUnsigned(args.limitAtomic, 'limitAtomic');
    const approvals = jsonUnsigned(args.approvals, 'approvals');
    const required = jsonUnsigned(args.requiredApprovals, 'requiredApprovals');
    accepted = intent.attachedAmount <= limit && approvals >= required;
    reason = accepted
      ? null
      : 'Payout exceeds its limit or does not have enough approvals.';
    events = accepted ? [`PayoutApproved:${text(args.reference)}`] : [];
  } else {
    const maximum = jsonUnsigned(args.maxAtomic, 'maxAtomic');
    const sequence = jsonUnsigned(args.sequence, 'sequence');
    const expected = jsonUnsigned(args.expectedSequence, 'expectedSequence');
    accepted =
      args.active === true &&
      intent.attachedAmount <= maximum &&
      sequence === expected;
    reason = accepted
      ? null
      : 'Mandate is inactive, over its ceiling or has a stale sequence.';
    events = accepted ? [`SubscriptionCollected:${text(args.mandate)}`] : [];
  }
  return {
    accepted,
    estimatedUnits: BigInt(20_000 + intent.args.byteLength * 11),
    stateVersion: 1n,
    returnValue: new Uint8Array(),
    events,
    reason,
  };
}

function parseArgs(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TypeError('Arguments must be valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('Arguments must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

function canonicalUnsigned(value: string, field: string): bigint {
  const normalized = value.trim();
  if (!ATOMIC.test(normalized)) {
    throw new TypeError(`${field} must be a canonical unsigned integer.`);
  }
  return BigInt(normalized);
}

function canonicalPositive(value: string, field: string): bigint {
  const parsed = canonicalUnsigned(value, field);
  if (parsed === 0n) throw new TypeError(`${field} must be positive.`);
  return parsed;
}

function jsonUnsigned(value: unknown, field: string): bigint {
  if (typeof value !== 'string') {
    throw new TypeError(`${field} must be an integer string.`);
  }
  return canonicalUnsigned(value, field);
}

function text(value: unknown): string {
  return typeof value === 'string' && value.length > 0 ? value : 'unknown';
}

function recipientBasisPoints(value: unknown): bigint {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Each revenue recipient must be an object.');
  }
  return jsonUnsigned((value as Record<string, unknown>).bps, 'bps');
}
