import { expect, test } from '@playwright/test'

test('identifies the default E chord and saves it to the library', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /Explora el mástil/ })).toBeVisible()
  await expect(page.locator('.result-chord')).toHaveText('E')

  await page.getByRole('button', { name: 'Guardar en biblioteca' }).click()
  await expect(page.getByRole('status')).toContainText('Guardado en tu biblioteca')
  await page.getByRole('link', { name: 'Biblioteca' }).click()
  await expect(page.getByText(/^E$/).first()).toBeVisible()
})

test('calculates intervals between letter notes and octaved notes', async ({ page }) => {
  await page.goto('/intervalos')
  await expect(page.getByLabel('Nota de referencia')).toHaveValue('A')
  await expect(page.getByLabel('Nota de destino')).toHaveValue('F#')
  await expect(page.getByRole('heading', { name: /sexta mayor/i })).toBeVisible()

  await page.getByRole('button', { name: 'C4 → D5' }).click()
  await expect(page.getByRole('heading', { name: /novena mayor/i })).toBeVisible()
})

test('creates a tuning, keeps bass five settings after reload, and displays its low B', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Guitarra' }).click()
  const dialog = page.getByRole('dialog', { name: 'Tu instrumento' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Crear afinación' }).click()
  await dialog.getByLabel('Nombre', { exact: true }).fill('Prueba E2E')
  await dialog.getByRole('button', { name: 'Guardar afinación' }).click()
  await expect(dialog.getByLabel('Afinación')).toContainText('Prueba E2E')

  await dialog.getByLabel('Instrumento').selectOption('bass5')
  await expect(dialog.getByText('B0', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Listo, a tocar' }).click()
  await page.reload()

  await page.getByRole('button', { name: /Bajo · 5 cuerdas/ }).click()
  const reopened = page.getByRole('dialog', { name: 'Tu instrumento' })
  await expect(reopened.getByLabel('Instrumento')).toHaveValue('bass5')
  await expect(reopened.getByText('B0', { exact: true })).toBeVisible()
})

test('saves a progression and restores it after reloading', async ({ page }) => {
  await page.goto('/progresiones')
  const nameField = page.getByLabel('Nombre de la progresión')
  await expect(nameField).toHaveValue('Mi primera progresión')
  await page.getByRole('button', { name: 'Guardar progresión' }).click()
  await expect(page.getByRole('status')).toContainText('Progresión guardada')

  await page.reload()
  await expect(page.getByLabel('Nombre de la progresión')).toHaveValue('Mi primera progresión')
  await expect(page.getByText('En tu biblioteca')).toBeVisible()
})

test('keeps keyboard and photo transcription tools labelled', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Teclado virtual/ }).click()
  await expect(page.getByRole('heading', { name: 'Un teclado, el mismo lenguaje' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'C3', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  )

  await page.getByRole('button', { name: /Teclado virtual/ }).click()
  await page.getByRole('button', { name: /Consultar una imagen/ }).click()
  await expect(page.getByRole('heading', { name: 'De la imagen al mástil' })).toBeVisible()
  await expect(page.getByText(/Las fotos de manos se transcriben manualmente/)).toBeVisible()
  await expect(page.getByLabel('Imagen de referencia')).toHaveAttribute('type', 'file')
})

test('the document does not overflow at common tablet and phone widths', async ({ page }) => {
  for (const width of [390, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: /Explora el mástil/ })).toBeVisible()
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(overflows, `page overflow at ${width}px`).toBe(false)
  }
})

test('recognizes a diagram locally and applies only the confirmed strings', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /Consultar una imagen/ }).click()
  const vertical = [50, 90, 130, 170, 210, 250]
    .map((x) => `<line x1="${x}" y1="60" x2="${x}" y2="310"/>`)
    .join('')
  const horizontal = [60, 110, 160, 210, 260, 310]
    .map((y) => `<line x1="50" y1="${y}" x2="250" y2="${y}"/>`)
    .join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="360"><rect width="300" height="360" fill="white"/><g stroke="black" stroke-width="2">${vertical}${horizontal}</g><g fill="black"><circle cx="90" cy="185" r="11"/><circle cx="130" cy="135" r="11"/><circle cx="210" cy="85" r="11"/></g></svg>`
  await page
    .getByLabel('Imagen de referencia')
    .setInputFiles({ name: 'C.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(svg) })
  await page.getByRole('button', { name: 'Analizar diagrama' }).click()
  await expect(page.getByRole('button', { name: 'Confirmar posiciones' })).toBeVisible()
  // Unmarked strings remain muted until the player explicitly marks them open.
  await expect(page.getByLabel('Cuerda 3 · G3').locator('option').first()).toHaveJSProperty(
    'selected',
    true,
  )
  await page.getByLabel('Cuerda 3 · G3').selectOption({ label: 'Al aire' })
  await page.getByLabel('Cuerda 1 · E4').selectOption({ label: 'Al aire' })
  await page.getByRole('button', { name: 'Confirmar posiciones' }).click()
  await expect(page.locator('.result-chord')).toHaveText('C')
  await expect(page.locator('.fret-control.selected')).toHaveCount(3)
  await expect(page.locator('.open-control.selected')).toHaveCount(2)
})

test('follows the system appearance and returns focus after instrument settings', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'light' })
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const trigger = page.getByRole('button', { name: 'Guitarra', exact: true })
  await trigger.click()
  await expect(page.getByRole('button', { name: 'Cerrar ajustes' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('minor keys update harmony, persist and survive transposition', async ({ page }) => {
  await page.goto('/progresiones')
  await page.getByRole('combobox', { name: 'Tónica', exact: true }).selectOption('A')
  await page.getByRole('combobox', { name: 'Modo', exact: true }).selectOption('minor')
  await page.getByLabel('Acorde 1', { exact: true }).fill('Am')
  await page.getByLabel('Acorde 2', { exact: true }).fill('E7')
  await expect(page.locator('.chord-step').nth(0).locator('.roman')).toHaveText('i')
  await expect(page.locator('.chord-step').nth(1).locator('.roman')).toHaveText('V7')
  await expect(page.locator('.suggestions-panel')).toContainText('A menor')
  await expect(page.locator('.suggestions')).toContainText('armónica')
  await page.getByRole('button', { name: 'Guardar progresión', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Progresión guardada')
  await expect(page).toHaveURL(/id=/)
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Modo', exact: true })).toHaveValue('minor')
  await expect(page.getByRole('combobox', { name: 'Tónica', exact: true })).toHaveValue('A')
  await page.getByLabel('Semitonos de transposición').selectOption('2')
  await page.getByRole('button', { name: 'Transponer progresión', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Modo', exact: true })).toHaveValue('minor')
  await expect(page.getByRole('combobox', { name: 'Tónica', exact: true })).toHaveValue('B')
  await expect(page.getByLabel('Acorde 1', { exact: true })).toHaveValue('Bm')
})

test('clicking a chord opens a diagram and saves the chosen position', async ({ page }) => {
  await page.goto('/progresiones')
  await page.getByLabel('Acorde 1', { exact: true }).click()
  const panel = page.locator('#chord-position-panel')
  await expect(panel.getByRole('heading', { name: 'Posiciones de C', exact: true })).toBeVisible()
  await expect(panel.getByRole('img')).toBeVisible()
  await expect(panel.getByRole('img')).toHaveAttribute('aria-label', /C\./)
  expect(await panel.locator('.markers .muted').count()).toBeGreaterThan(0)
  await panel.getByRole('button', { name: 'Posición siguiente', exact: true }).click()
  await expect(panel.locator('.position-navigation')).toContainText('Posición 2')
  await panel.getByRole('button', { name: 'Usar esta posición', exact: true }).click()
  await expect(panel.getByRole('button', { name: 'Ya está elegida', exact: true })).toBeDisabled()
  await expect(page.locator('.chord-step').first()).toContainText('Posición guardada')
  await page.getByRole('button', { name: 'Guardar progresión', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Progresión guardada')
  await expect(page).toHaveURL(/id=/)
  await page.reload()
  await page.getByRole('button', { name: 'Ver posiciones de C, acorde 1', exact: true }).click()
  await expect(page.locator('#chord-position-panel .badge')).toHaveText('Posición guardada')
  await page.getByRole('button', { name: 'Cerrar posiciones', exact: true }).click()
  await expect(page.locator('#chord-position-panel')).toHaveCount(0)
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})
