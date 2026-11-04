import { expect, test } from '@playwright/test';

test('app shell renders, switches views, and fits the screen', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');

  await expect(page.getByRole('heading', { name: /Pond Filter Simulator/ })).toBeVisible();
  await expect(page.getByRole('img', { name: /Side elevation/ })).toBeVisible();

  await page.getByRole('button', { name: 'Plan', exact: true }).click();
  await expect(page.getByRole('img', { name: /Plan view/ })).toBeVisible();
  await page.getByRole('button', { name: 'Section', exact: true }).click();

  // Engine output reaches the UI: water density at 15 °C.
  await expect(page.getByText('999.1').first()).toBeVisible();

  // No horizontal page scroll at any width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  if (testInfo.project.name === 'phone') {
    await expect(page.locator('[data-layout="compact"]')).toBeVisible();
    await page.getByRole('tab', { name: 'Edit' }).click();
    await expect(page.getByLabel('Water temperature')).toBeVisible();
    await page.getByRole('button', { name: 'Increase temperature' }).click();
    await expect(page.getByLabel('Water temperature')).toHaveValue('16');
  } else {
    await expect(page.locator('[data-layout="desktop"]')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Results' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Edit' })).toBeVisible();
  }

  // Imperial units convert temperature display.
  await page.getByLabel('Units').selectOption('imperial-uk');
  await expect(page.getByText('°F').first()).toBeVisible();
  const overflowImperial = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflowImperial).toBeLessThanOrEqual(0);

  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}.png`), fullPage: true });
  expect(errors).toEqual([]);
});

test('dark theme applies', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(11, 23, 25)');
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-dark.png`) });
});
