import { expect, test } from '@playwright/test'

test('the production service worker serves navigation and local edits offline', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Explora el mástil/ })).toBeVisible()

  await expect
    .poll(async () =>
      page.evaluate(async () => Boolean(await navigator.serviceWorker.getRegistration())),
    )
    .toBe(true)
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await page.reload()
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true)

  try {
    await context.setOffline(true)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: /Explora el mástil/ })).toBeVisible()

    await page.getByRole('button', { name: 'Guardar en biblioteca' }).click()
    await expect(page.getByRole('status')).toContainText('Guardado en tu biblioteca')
    await page.getByRole('link', { name: 'Intervalos', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Entre una nota y otra.' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /sexta mayor/i })).toBeVisible()
    await page.getByRole('link', { name: 'Diccionario', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Diccionario de acordes.' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Detalle de C' }).getByRole('img')).toBeVisible()
    await page.getByRole('link', { name: 'Círculo de quintas', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Círculo de quintas.' })).toBeVisible()
    await page
      .getByRole('group', { name: 'Círculo de quintas' })
      .getByRole('button', { name: 'G mayor', exact: true })
      .click()
    await expect(page.locator('.key-panel').getByRole('heading', { name: 'G mayor' })).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
})
