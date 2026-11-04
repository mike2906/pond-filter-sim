import { expect, test, type Page } from '@playwright/test';
import LZString from 'lz-string';
import { TEMPLATES } from '../src/templates';

async function fresh(page: Page) {
  await page.goto('./');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
}

const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

test('designer renders a solved design on phone and desktop', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await fresh(page);

  await expect(page.getByRole('img', { name: /Side elevation/ })).toBeVisible();
  // Key results reach the peek strip or the results panel.
  await expect(page.getByLabel('Key results').first()).toContainText('m³/h');
  await noHorizontalScroll(page);

  if (testInfo.project.name === 'phone') {
    await expect(page.locator('[data-layout="compact"]')).toBeVisible();
    await page.getByRole('button', { name: 'Plan', exact: true }).click();
    await expect(page.getByRole('img', { name: /Plan view/ })).toBeVisible();
    await page.getByRole('button', { name: 'Section', exact: true }).click();
    // Selecting a chamber in the drawing opens its editor.
    await page.locator('.section-svg [data-id="k1"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('region', { name: 'Edit' })).toBeVisible();
    await expect(page.getByLabel('Name')).toHaveValue('Static K1');
  } else {
    await expect(page.locator('[data-layout="desktop"]')).toBeVisible();
    await expect(page.getByRole('img', { name: /Plan view/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Results' })).toContainText('Head-loss budget');
    await expect(page.getByRole('region', { name: 'Explore' })).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}.png`) });
  expect(errors).toEqual([]);
});

test('editing a value re-solves, and undo restores it', async ({ page }, testInfo) => {
  await fresh(page);
  if (testInfo.project.name === 'phone') await page.getByRole('tab', { name: 'Edit' }).click();
  const temp = page.getByRole('textbox', { name: 'Water temperature', exact: true });
  await expect(temp).toHaveValue('15');
  await page.getByRole('button', { name: 'Increase Water temperature' }).click();
  await expect(temp).toHaveValue('16');
  // Typed decimals are kept while typing and committed on Enter.
  await temp.fill('12.5');
  await temp.press('Enter');
  await expect(temp).toHaveValue('12.5');
  await temp.blur();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(temp).toHaveValue('16');
});

test('selecting in the section highlights the same element in the plan', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'Both views show together on wide screens only');
  await fresh(page);
  await page.locator('.section-svg [data-id="vortex"]').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.plan-svg [data-id="vortex"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.section-svg [data-id="vortex"]')).toHaveAttribute('aria-pressed', 'true');
});

test('a share link opens the exact design', async ({ page }) => {
  const t = TEMPLATES.find((x) => x.id === 'pump-beads')!;
  await page.goto(`./#d=${LZString.compressToEncodedURIComponent(JSON.stringify(t.design))}`);
  await expect(page.getByRole('banner')).toContainText(t.design.name);
  await expect(page.locator('.toast')).toContainText('shared link');
});

test('templates load from the design menu', async ({ page }) => {
  await fresh(page);
  await page.getByRole('button', { name: 'Design', exact: true }).click();
  await page.getByRole('button', { name: /Your twin radial modules/ }).click();
  await expect(page.getByRole('banner')).toContainText('twin radial');
  await expect(page.getByLabel('Key results').first()).toContainText('m³/h');
});

test('imperial units convert results', async ({ page }) => {
  await fresh(page);
  await page.getByLabel('Units').selectOption('imperial-uk');
  await expect(page.getByLabel('Key results').first()).toContainText('UK gal/h');
  await noHorizontalScroll(page);
});

test('dark theme applies', async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await fresh(page);
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(11, 23, 25)');
  await page.screenshot({ path: testInfo.outputPath(`${testInfo.project.name}-dark.png`) });
});
