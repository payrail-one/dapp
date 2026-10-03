import { expect, test } from '@playwright/test';

const contractId = 'ab'.repeat(32);
const address = `paydev1${'q'.repeat(52)}`;
const status = {
  networkId: '11'.repeat(32),
  addressPrefix: 'paydev',
  finalizedHeight: '40',
  finalityMode: 'four-validator-quorum',
  validatorCount: 4,
  onlineValidators: 4,
  quorumWeight: 3,
  asset: { id: '22'.repeat(32), symbol: 'TEST', decimals: 6 },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/network', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(status),
    }),
  );
  await page.route('**/api/faucet', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(submission('41', 'transfer', null)),
    }),
  );
  await page.route('**/api/accounts/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        address,
        accountId: '33'.repeat(32),
        nonce: '0',
        balance: '100000000',
        finalizedHeight: '41',
      }),
    }),
  );
  await page.route('**/api/transactions', async (route) => {
    const body = route.request().postDataJSON() as { envelope: string };
    const operation = body.envelope.slice(32, 34);
    const deploying = operation === '04';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        submission(
          deploying ? '42' : '43',
          deploying ? 'contractDeploy' : 'contractCall',
          {
            contractId,
            entrypoint: deploying ? null : 'deposit',
            executionUnits: deploying ? null : '4',
            codeHash: deploying ? '44'.repeat(32) : null,
            events: deploying ? [] : ['4465706f7369746564'],
          },
        ),
      ),
    });
  });
  await page.route('**/api/contracts/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: contractId,
        owner: address,
        codeHash: '44'.repeat(32),
        balance: '1000000',
        state: [{ key: '6465706f7369746564', value: '1000000' }],
        finalizedHeight: '43',
      }),
    }),
  );
  await page.goto('/');
  await expect(page.getByText('Ready to sign')).toBeVisible();
});

test('compiles, signs and presents a finalized deploy and call', async ({
  page,
}) => {
  await page.getByTestId('deploy-contract').click();
  await expect(page.locator('input[name="contractId"]')).toHaveValue(
    contractId,
  );
  await expect(page.getByTestId('contract-output')).toContainText(
    'contractDeploy',
  );

  await page.getByTestId('call-contract').click();
  await expect(page.getByTestId('contract-output')).toContainText(
    'executionUnits',
  );
  await expect(page.getByTestId('contract-output')).toContainText('deposit');
  await expect(
    page.getByText('1000000', { exact: true }).first(),
  ).toBeVisible();
});

test('shows compiler errors without sending a transaction', async ({
  page,
}) => {
  await page
    .getByTestId('contract-source')
    .fill('entry broken\n  unknown\nend');
  await page.getByTestId('deploy-contract').click();
  await expect(page.getByText('Action failed')).toBeVisible();
  await expect(page.getByTestId('contract-output')).toContainText(
    'unknown instruction',
  );
});

test('stays usable on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: /Write. Deploy/ }),
  ).toBeVisible();
  await expect(page.getByTestId('contract-source')).toBeVisible();
});

function submission(height: string, kind: string, contract: object | null) {
  return {
    transaction: {
      id: '55'.repeat(32),
      blockHeight: height,
      operationIndex: '0',
      from: address,
      to: address,
      amount: '0',
      fee: '1',
      outcome: 'applied',
      kind,
    },
    checkpoint: {
      height,
      hash: '66'.repeat(32),
      stateRoot: '77'.repeat(32),
      transactionCount: 1,
    },
    contract,
  };
}
