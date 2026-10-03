import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PayrailContractKit,
  hexToBytes,
  type ContractProvider,
} from '../src/index';

function provider(): ContractProvider {
  return {
    async describe(contractId) {
      return {
        id: contractId,
        name: 'Test policy',
        version: 'preview',
        entrypoints: ['release'],
        stateVersion: 1n,
      };
    },
    async simulate(intent) {
      return {
        accepted: intent.attachedAmount <= 1_000n,
        estimatedUnits: BigInt(21_000 + intent.args.byteLength * 8),
        stateVersion: 1n,
        returnValue: new Uint8Array(),
        events: [],
        reason: null,
      };
    },
    async submit() {
      return {
        operationId: 'operation.preview',
        acceptedAtHeight: 1n,
        status: 'pending',
      };
    },
  };
}

test('canonical codecs reject ambiguous values', () => {
  assert.deepEqual([...hexToBytes('0x00ff')], [0, 255]);
  assert.throws(() => hexToBytes('0xFF'), /lowercase hexadecimal/);
});

test('intent construction preserves monetary values as bigint', () => {
  const kit = new PayrailContractKit(provider());
  const intent = kit.intent({
    contractId: 'escrow.preview',
    caller: 'account.preview',
    entrypoint: 'release',
    args: Uint8Array.of(1, 2),
    attachedAmount: 9_007_199_254_740_993n,
    executionBudget: 50_000n,
    nonce: 0n,
    validUntilHeight: 100n,
  });
  assert.equal(intent.attachedAmount, 9_007_199_254_740_993n);
  assert.deepEqual([...intent.args], [1, 2]);
  assert.ok(Object.isFrozen(intent));
});

test('intent validation rejects unsafe execution boundaries', () => {
  const kit = new PayrailContractKit(provider());
  const input = {
    contractId: 'escrow.preview',
    caller: 'account.preview',
    entrypoint: 'release',
    executionBudget: 1n,
    nonce: 0n,
    validUntilHeight: 1n,
  } as const;
  assert.throws(
    () => kit.intent({ ...input, executionBudget: 0n }),
    /positive/,
  );
  assert.throws(() => kit.intent({ ...input, nonce: -1n }), /negative/);
  assert.throws(
    () => kit.intent({ ...input, entrypoint: 'release()' }),
    /entrypoint/,
  );
});

test('simulation delegates a validated immutable intent', async () => {
  const kit = new PayrailContractKit(provider());
  const result = await kit.simulate({
    contractId: 'escrow.preview',
    caller: 'account.preview',
    entrypoint: 'release',
    attachedAmount: 500n,
    executionBudget: 25_000n,
    nonce: 2n,
    validUntilHeight: 50n,
  });
  assert.equal(result.accepted, true);
  assert.equal(result.estimatedUnits, 21_000n);
});
