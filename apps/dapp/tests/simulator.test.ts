import assert from 'node:assert/strict';
import test from 'node:test';
import { draftForScenario, simulateDraft } from '../src/simulator';

test('accepts the default escrow scenario without a network write', async () => {
  const run = await simulateDraft(draftForScenario('escrow', '100'));
  const result = JSON.parse(run.output) as Record<string, unknown>;
  assert.equal(run.accepted, true);
  assert.equal(result.networkWrite, false);
  assert.equal(result.mode, 'local-preview');
});

test('rejects a revenue split that does not total 10,000 bps', async () => {
  const draft = draftForScenario('split');
  const run = await simulateDraft({
    ...draft,
    argsJson: JSON.stringify({
      recipients: [
        { account: 'paydev.account.a', bps: '7000' },
        { account: 'paydev.account.b', bps: '2000' },
      ],
    }),
  });
  assert.equal(run.accepted, false);
  assert.match(run.output, /10,000 bps/);
});

test('rejects a payout over its atomic limit', async () => {
  const draft = draftForScenario('payout');
  const run = await simulateDraft({ ...draft, amountAtomic: '500000001' });
  assert.equal(run.accepted, false);
  assert.match(run.output, /exceeds its limit/);
});

test('rejects non-canonical monetary input before evaluation', async () => {
  const draft = draftForScenario('escrow');
  await assert.rejects(
    () => simulateDraft({ ...draft, amountAtomic: '01' }),
    /canonical unsigned integer/,
  );
});

test('rejects malformed argument JSON', async () => {
  const draft = draftForScenario('subscription');
  await assert.rejects(
    () => simulateDraft({ ...draft, argsJson: '{' }),
    /valid JSON/,
  );
});
