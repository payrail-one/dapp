import { expect, test } from '@playwright/test';

const status = {
  networkId: 'payrail-devnet',
  addressPrefix: 'paydev',
  finalizedHeight: '2400',
  finalityMode: 'quorum',
  validatorCount: 4,
  onlineValidators: 4,
  quorumWeight: 3,
  asset: { id: 'payrail.test', symbol: 'TEST', decimals: 6 },
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/network', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(status),
    }),
  );
  await page.goto('/');
});

test('runs a safe local simulation and exposes the result', async ({
  page,
}) => {
  await expect(page.getByText('Developer Sandbox')).toBeVisible();
  await expect(page.getByText('No signing · no network write')).toBeVisible();
  await expect(page.getByText('#2400')).toBeVisible();
  await page.getByTestId('run-simulation').click();
  await expect(page.getByTestId('result-state')).toHaveText('ACCEPTED');
  await expect(page.getByTestId('sandbox-output')).toContainText(
    '"networkWrite": false',
  );
  await expect(page.getByTestId('sandbox-output')).toContainText(
    'EscrowReleased',
  );
});

test('shows policy rejection without offering a broadcast action', async ({
  page,
}) => {
  await page.getByRole('button', { name: /Payout policy/ }).click();
  await page.locator('input[name="amountAtomic"]').fill('500000001');
  await page.getByTestId('run-simulation').click();
  await expect(page.getByTestId('result-state')).toHaveText('REJECTED');
  await expect(page.getByTestId('sandbox-output')).toContainText(
    'exceeds its limit',
  );
  await expect(
    page.getByRole('button', { name: /broadcast|submit/i }),
  ).toHaveCount(0);
});

test('stays usable on a mobile viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(
    page.getByRole('heading', { name: /Build the intent/ }),
  ).toBeVisible();
  await page.getByRole('button', { name: /Revenue split/ }).click();
  await expect(page.getByTestId('args-json')).toHaveValue(/recipients/);
});
