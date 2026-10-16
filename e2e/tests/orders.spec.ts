import { expect, Page, test } from '@playwright/test';

const PASSWORD = process.env.SEED_PASSWORD ?? 'ChangeMe123!';

async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByTestId('email').fill(email);
  await page.getByTestId('password').fill(PASSWORD);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('tenant-name')).toBeVisible();
}

test('owner signs in, creates an order and sees it listed', async ({ page }) => {
  const label = `e2e table ${Date.now()}`;
  await signIn(page, 'owner@trattoria.example');
  await expect(page.getByTestId('tenant-name')).toHaveText('Trattoria Roma');

  await page.getByTestId('customer-label').fill(label);
  await page.getByTestId('product-0').selectOption({ label: 'Margherita Pizza · $12.00' });
  await page.getByTestId('quantity-0').fill('2');
  await expect(page.getByTestId('draft-total')).toContainText('$24.00');
  await page.getByTestId('create-order').click();

  const row = page.getByTestId('order-row').filter({ hasText: label });
  await expect(row).toBeVisible();
  await expect(row).toContainText('2× Margherita Pizza');
  await expect(row).toContainText('$24.00');
  await expect(row).toContainText('pending');

  await row.getByTestId('set-preparing').click();
  await expect(page.getByTestId('order-row').filter({ hasText: label })).toContainText('preparing');
});

test('a different restaurant does not see the first restaurant orders', async ({ page }) => {
  const label = `e2e isolation ${Date.now()}`;

  await signIn(page, 'owner@trattoria.example');
  await page.getByTestId('customer-label').fill(label);
  await page.getByTestId('product-0').selectOption({ index: 1 });
  await page.getByTestId('create-order').click();
  await expect(page.getByTestId('order-row').filter({ hasText: label })).toBeVisible();
  await page.getByTestId('logout').click();
  await expect(page).toHaveURL(/\/login/);

  await signIn(page, 'owner@sushikaze.example');
  await expect(page.getByTestId('tenant-name')).toHaveText('Sushi Kaze');
  await expect(page.getByTestId('orders-table')).toBeVisible();
  await expect(page.getByText(label)).toHaveCount(0);
  await expect(page.getByText('Margherita Pizza')).toHaveCount(0);
  await expect(page.getByTestId('orders-table').getByText('Salmon Nigiri').first()).toBeVisible();
});

test('requests without a session are sent to the login page', async ({ page }) => {
  await page.goto('/orders');
  await expect(page).toHaveURL(/\/login/);
});
