import { expect, test, type Page } from '@playwright/test';

async function waitForAnalysis(page: Page) {
  const terminal = page.locator('.report, .error').first();
  await expect(terminal).toBeVisible({ timeout: 60_000 });
  const error = page.locator('.error');
  if (await error.isVisible()) {
    throw new Error(`Drantis UI analysis failed: ${await error.innerText()}`);
  }
  await expect(page.locator('.report')).toBeVisible();
}

async function waitForComparison(page: Page) {
  const terminal = page.locator('.comparison, .error').first();
  await expect(terminal).toBeVisible({ timeout: 60_000 });
  const error = page.locator('.error');
  if (await error.isVisible()) {
    throw new Error(`Drantis UI comparison failed: ${await error.innerText()}`);
  }
  await expect(page.locator('.comparison')).toBeVisible();
}

test('showcase analysis renders genuine release artifacts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /start deterministic analysis/i }).click();
  await waitForAnalysis(page);
  await expect(page.getByText('RELEASE DECISION')).toBeVisible();
  await expect(page.getByRole('button', { name: 'system' })).toBeVisible();
  await page.getByRole('button', { name: 'system' }).click();
  await expect(page.getByText(/architecture and trust relationships/i)).toBeVisible();
});

test('controlled regression comparison explains changed artifacts', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /compare reference/i }).click();
  await waitForComparison(page);
  await expect(page.getByText('CONTROLLED REGRESSION')).toBeVisible();
  await expect(page.getByText(/changed controls/i)).toBeVisible();
});

test('release decision explains uncertain and failed controls', async ({ page }) => {
  await page.goto('/');
  await page.locator('select').selectOption('missing-tenant-authorization');
  await page.getByRole('button', { name: /start deterministic analysis/i }).click();
  await waitForAnalysis(page);
  await expect(page.getByText('WHY THIS DECISION')).toBeVisible();
  await expect(page.getByText(/release decisions remain traceable/i)).toBeVisible();
});

test('Senten integration renders intended-vs-observed correspondence', async ({ page }) => {
  await page.goto('/');
  await page.locator('select').selectOption('senten-reference');
  await page.getByRole('button', { name: /start deterministic analysis/i }).click();
  await waitForAnalysis(page);
  await page.getByRole('button', { name: 'senten' }).click();
  await expect(page.getByText(/intended architecture meets observed assurance/i)).toBeVisible();
  await expect(page.getByText('MATCHED')).toBeVisible();
  await expect(page.getByText('UNOBSERVED')).toBeVisible();
  await expect(page.getByText('UNDECLARED')).toBeVisible();
});
