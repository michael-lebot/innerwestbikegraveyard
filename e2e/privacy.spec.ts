import { expect, test } from '@playwright/test'

const ADDRESS = 'hello@innerwestbikegraveyard.com'

test('the privacy page opens with the TLDR, and both it and the accessibility page give the contact address', async ({
  page,
}) => {
  await page.goto('/privacy')
  const tldr = page.getByRole('main').locator('p').first()
  await expect(tldr).toHaveText(/^TLDR; I used AI to create this app\./)
  // Each claim the fact-check settled (the pull request that wrote this page gives the evidence).
  for (const clause of [
    "The app itself doesn't use any AI.",
    'only leaves your device if you use it to add a tag',
    'shown publicly on the map',
    "doesn't collect your name or email address",
    'sees your IP address',
    'a scrambled version of it, and of a random ID',
    'hosted in Sydney, Australia',
  ])
    await expect(tldr).toContainText(clause)
  for (const path of ['/privacy', '/accessibility']) {
    await page.goto(path)
    await expect(page.getByRole('main').getByRole('link', { name: ADDRESS }), path).toHaveAttribute(
      'href',
      `mailto:${ADDRESS}`,
    )
  }
})
