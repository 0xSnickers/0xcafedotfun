import { expect, test } from '@playwright/test';

const TOKEN_ADDRESS = '0xCAFE79d29aEf2e8d4c7359B03020AEa8aa741fC6';

test('home page renders launch hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Launch culture\./i })).toBeVisible();
  await expect(page.getByRole('button', { name: /Explore markets/i })).toBeVisible();
});

test('trade detail page renders token market shell', async ({ page }) => {
  await page.goto(`/trade/${TOKEN_ADDRESS}`);
  await expect(page.locator('.trade-terminal-page')).toBeVisible();
  await expect(page.getByText(/Markets/i).first()).toBeVisible();
});
