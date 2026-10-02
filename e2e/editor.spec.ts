import { expect, test, type Page } from '@playwright/test';

/** Screen position of a map cell's centre. */
async function cell(page: Page, x: number, y: number) {
  const grid = await page.locator('div[title="Crash Site"]').locator('xpath=..').boundingBox();
  if (!grid) throw new Error('map not shown');
  const zoom = 24;
  return { x: grid.x + x * zoom + zoom / 2, y: grid.y + y * zoom + zoom / 2 };
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
}

test('build a room, paint it, and play from it', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByText('Beatable').first()).toBeVisible();

  // Draw a room next to the Flooded Vault (rows 15-17), move it up three rows, and resize it.
  await page.keyboard.press('KeyB');
  await drag(page, await cell(page, 24, 15), await cell(page, 27, 17));
  await expect(page.getByText('Added Room 16 (4×3)')).toBeVisible();
  await page.keyboard.press('KeyV');
  await drag(page, await cell(page, 25, 16), await cell(page, 25, 13));
  const moved = page.locator('div[title="Room 16"]');
  await expect(moved).toHaveCSS("top", `${12 * 24}px`);
  const handle = page.locator('[data-handle="e"]');
  const hb = (await handle.boundingBox())!;
  await drag(page, { x: hb.x + 4, y: hb.y + 4 }, { x: hb.x + 4 + 2 * 24, y: hb.y + 4 });
  await expect(page.getByText('Room 16 is now 6×3')).toBeVisible();

  // Paint it: a rectangle of spikes, then an enemy.
  await moved.dblclick();
  await expect(page.getByRole('radiogroup', { name: 'Paint tool' })).toBeVisible();
  await page.keyboard.press('KeyR');
  await page.keyboard.press('Digit3');
  const canvas = page.getByLabel('Room 16 tiles');
  const cb = (await canvas.boundingBox())!;
  await drag(page, { x: cb.x + cb.width * 0.3, y: cb.y + cb.height * 0.8 }, { x: cb.x + cb.width * 0.5, y: cb.y + cb.height * 0.85 });
  await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
  await page.keyboard.press('KeyN');
  await page.getByRole('radio', { name: /^Enemy/ }).click();
  await page.mouse.click(cb.x + cb.width * 0.6, cb.y + cb.height * 0.5);
  await expect(page.getByRole('dialog', { name: 'Enemy settings' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'crawler' })).toBeVisible();

  // Play from here, then come back to the painter.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /Play here/ }).click();
  await expect(page.getByText(/Testing from Room 16/)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Room 16 tiles')).toBeVisible();

  expect(errors).toEqual([]);
});

test('opening a sample keeps the previous project in the list', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Saved')).toBeVisible();
  await page.getByRole('button', { name: 'Project ▾' }).click();
  await page.getByRole('menuitem', { name: /Vault of the Hollow King/ }).click();
  await expect(page.getByLabel('Project name')).toHaveValue('Vault of the Hollow King');
  await expect(page.getByText('Saved')).toBeVisible();
  await page.getByRole('button', { name: 'Project ▾' }).click();
  await expect(page.getByRole('menuitem', { name: /Hollow Depths/ }).last()).toBeVisible();
  await page.getByRole('menuitem', { name: /^Hollow Depths/ }).last().click();
  await expect(page.getByLabel('Project name')).toHaveValue('Hollow Depths');
});
