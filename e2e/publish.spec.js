// One journey, the one that matters most: a TA clears the review queue and
// publishes. It runs in a real browser, so it is slow. Keep it to one or two.
import { test, expect } from '@playwright/test';

test('a TA reviews the pending submission, then publishes the lab', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Signed in as').selectOption('ta_a');

  const publish = page.getByRole('button', { name: 'Publish grades' });
  await page.getByRole('button', { name: 'Confirm stu1' }).click();
  await expect(page.getByRole('status')).toHaveText('Reviewed submission 1');

  await publish.click();
  await expect(page.getByRole('status')).toHaveText(/^Published at /);
});
