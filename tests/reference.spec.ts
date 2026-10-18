import { expect, test } from '@playwright/test'

test('the chord dictionary shows a C diagram, filters chord families, and opens symbols directly', async ({
  page,
}) => {
  await page.goto('/diccionario')
  const detail = page.getByRole('region', { name: 'Detalle de C' })
  await expect(detail.getByRole('heading', { name: 'C', exact: true })).toBeVisible()
  await expect(detail.getByText('C · E · G', { exact: true })).toBeVisible()
  await expect(detail.getByRole('img')).toHaveAttribute('aria-label', /^C\./)

  await page.getByRole('button', { name: 'Séptimas', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Cm7 Séptima menor' })).toBeVisible()
  await page.getByLabel('Buscar por nombre o símbolo').fill('Cm7')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir Cm7' }).click()
  await expect(page.getByRole('region', { name: 'Detalle de Cm7' })).toBeVisible()

  await page.getByLabel('Buscar por nombre o símbolo').fill('C/E')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  await page.getByRole('button', { name: 'Abrir C/E' }).click()
  const slashChord = page.getByRole('region', { name: 'Detalle de C/E' })
  await expect(slashChord.getByText('C · E · G', { exact: true })).toBeVisible()
})

test('a saved dictionary position returns from the library with its tuning context', async ({
  page,
}) => {
  await page.goto('/diccionario?chord=G')
  const detail = page.getByRole('region', { name: 'Detalle de G' })
  await expect(detail.getByRole('img')).toBeVisible()
  await expect(detail.locator('.tuning-caption')).toContainText('Estándar')
  await detail.getByRole('button', { name: 'Guardar favorito' }).click()
  await expect(detail.getByRole('status')).toContainText('Guardado en tu biblioteca')

  await page.getByRole('link', { name: 'Biblioteca', exact: true }).click()
  const favorite = page
    .locator('.saved-item')
    .filter({ has: page.getByRole('heading', { name: 'G', exact: true }) })
  await expect(favorite.locator('.context-line')).toContainText('Estándar')
  await expect(favorite.getByRole('link', { name: 'Explorar' })).toBeVisible()
  await favorite.getByRole('link', { name: 'Explorar' }).click()
  await expect(page.locator('.result-chord')).toHaveText('G')
  await expect(page.getByRole('group', { name: /Mástil, Estándar/ })).toBeVisible()
})

test('the circle connects major and minor keys and keeps enharmonic spellings', async ({
  page,
}) => {
  await page.goto('/quintas')
  const wheel = page.getByRole('group', { name: 'Círculo de quintas' })
  await wheel.getByRole('button', { name: 'G mayor', exact: true }).click()
  const keyPanel = page.locator('.key-panel')
  await expect(keyPanel.getByRole('heading', { name: 'G mayor' })).toBeVisible()
  await expect(keyPanel.locator('.signature')).toContainText('F#')
  await expect(keyPanel.getByText('E menor', { exact: true })).toBeVisible()

  await wheel.getByRole('button', { name: 'E menor', exact: true }).click()
  await expect(keyPanel.getByRole('heading', { name: 'E menor' })).toBeVisible()
  await expect(keyPanel.locator('.key-chords')).toContainText('Em')
  await expect(keyPanel.locator('.key-chords')).toContainText('Bm')
  await expect(keyPanel.locator('.key-chords')).toContainText('B7')

  await wheel.getByRole('button', { name: 'F# mayor', exact: true }).click()
  await expect(keyPanel.locator('.signature .note-pill')).toHaveCount(6)
  await page.getByLabel(/Usar escritura enarmónica/).check()
  await expect(keyPanel.getByRole('heading', { name: 'Gb mayor' })).toBeVisible()
  await expect(keyPanel.locator('.signature .note-pill')).toHaveCount(6)
  await expect(keyPanel.locator('.signature')).toContainText('Cb')
  const enharmonicScaleNotes = await keyPanel.locator('.scale-block .note-pill').allTextContents()
  expect(enharmonicScaleNotes).toContain('Cb')
  expect(enharmonicScaleNotes).not.toContain('B')

  await wheel.getByRole('button', { name: 'Db mayor', exact: true }).click()
  await page.getByLabel(/Usar escritura enarmónica/).check()
  await expect(keyPanel.getByRole('heading', { name: 'C# mayor' })).toBeVisible()
  await expect(keyPanel.locator('.signature .note-pill')).toHaveCount(7)
  await expect(keyPanel.locator('.signature')).toContainText('B#')
})

test('circle examples open major and minor progressions with their selected key and chords', async ({
  page,
}) => {
  await page.goto('/quintas')
  const wheel = page.getByRole('group', { name: 'Círculo de quintas' })
  await wheel.getByRole('button', { name: 'G mayor', exact: true }).click()
  await page.getByRole('link', { name: /Crear esta progresión/ }).click()
  await expect(page).toHaveURL(/\/progresiones\?chords=/)
  const setup = page.locator('.setup-fields select')
  await expect(setup.nth(0)).toHaveValue('G')
  await expect(setup.nth(1)).toHaveValue('major')
  await expect
    .poll(() =>
      page
        .locator('.chord-input input')
        .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
    )
    .toEqual(['G', 'D', 'Em', 'C'])

  await page.goto('/quintas')
  const minorWheel = page.getByRole('group', { name: 'Círculo de quintas' })
  await minorWheel.getByRole('button', { name: 'A menor', exact: true }).click()
  await page.getByRole('link', { name: /Crear esta progresión/ }).click()
  await expect(page).toHaveURL(/\/progresiones\?chords=/)
  await expect(setup.nth(0)).toHaveValue('A')
  await expect(setup.nth(1)).toHaveValue('minor')
  await expect
    .poll(() =>
      page
        .locator('.chord-input input')
        .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
    )
    .toEqual(['Am', 'F', 'C', 'G'])
})

test('dictionary and circle routes do not overflow at phone, tablet, or desktop widths', async ({
  page,
}) => {
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    for (const [path, heading] of [
      ['/diccionario', 'Diccionario de acordes.'],
      ['/quintas', 'Círculo de quintas.'],
    ]) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),
        `${path} overflows at ${width}px`,
      ).toBe(false)
    }
  }
})
