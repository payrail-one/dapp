export type ScenarioId = 'escrow' | 'split' | 'payout' | 'subscription';

export interface SandboxScenario {
  readonly id: ScenarioId;
  readonly number: string;
  readonly label: string;
  readonly summary: string;
  readonly contractId: string;
  readonly entrypoint: string;
  readonly amountAtomic: string;
  readonly executionBudget: string;
  readonly args: Readonly<Record<string, unknown>>;
}

export const sandboxScenarios: readonly SandboxScenario[] = [
  {
    id: 'escrow',
    number: '01',
    label: 'Conditional escrow',
    summary: 'Release locked value only after a verified delivery condition.',
    contractId: 'payrail.preview.escrow',
    entrypoint: 'release',
    amountAtomic: '125000000',
    executionBudget: '80000',
    args: {
      beneficiary: 'paydev.account.merchant',
      arbiter: 'paydev.account.arbiter',
      conditionVerified: true,
      reference: 'ORDER-2048',
    },
  },
  {
    id: 'split',
    number: '02',
    label: 'Revenue split',
    summary: 'Validate deterministic basis-point shares before distribution.',
    contractId: 'payrail.preview.revenue-split',
    entrypoint: 'distribute',
    amountAtomic: '38500000',
    executionBudget: '100000',
    args: {
      recipients: [
        { account: 'paydev.account.merchant', bps: '9700' },
        { account: 'paydev.account.platform', bps: '300' },
      ],
      reference: 'CART-8831',
    },
  },
  {
    id: 'payout',
    number: '03',
    label: 'Payout policy',
    summary:
      'Apply an atomic limit and approval threshold to a treasury payout.',
    contractId: 'payrail.preview.payout-policy',
    entrypoint: 'approve_payout',
    amountAtomic: '250000000',
    executionBudget: '90000',
    args: {
      beneficiary: 'paydev.account.supplier',
      limitAtomic: '500000000',
      approvals: '2',
      requiredApprovals: '2',
      reference: 'BATCH-2048',
    },
  },
  {
    id: 'subscription',
    number: '04',
    label: 'Subscription debit',
    summary: 'Check mandate state, period sequence and a per-debit ceiling.',
    contractId: 'payrail.preview.subscription',
    entrypoint: 'collect',
    amountAtomic: '15900000',
    executionBudget: '70000',
    args: {
      mandate: 'MANDATE-4421',
      active: true,
      sequence: '7',
      expectedSequence: '7',
      maxAtomic: '20000000',
    },
  },
];

export function scenarioById(id: ScenarioId): SandboxScenario {
  const scenario = sandboxScenarios.find((candidate) => candidate.id === id);
  if (!scenario) throw new TypeError('Unknown sandbox scenario.');
  return scenario;
}
