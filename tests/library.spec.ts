import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import type { Backup } from '../src/lib/types'

async function library(page: Page) {
  await page.getByRole('link', { name: 'Biblioteca', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tu música, a mano.' })).toBeVisible()
}
async function exportBackup(page: Page, path: string): Promise<Backup> {
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Exportar biblioteca' }).click()
  await (await download).saveAs(path)
  return JSON.parse(await readFile(path, 'utf8')) as Backup
}

test('exports and restores real favorites, keyboard pitches, custom tuning and progression; merges conflicts safely', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(90_000)
  await page.goto('/')
  await expect(page.locator('.result-chord')).toHaveText('E')
  await page.getByRole('button', { name: 'Guardar en biblioteca' }).click()
  await expect(page.getByRole('status')).toContainText('Guardado en tu biblioteca')

  await page.getByRole('button', { name: 'Guitarra', exact: true }).click()
  const settings = page.getByRole('dialog', { name: 'Tu instrumento' })
  await settings.getByRole('button', { name: 'Crear afinación' }).click()
  await settings.getByLabel('Nombre', { exact: true }).fill('Mi DADGAD')
  const tuningNotes = ['D2', 'A2', 'D3', 'G3', 'A3', 'D4']
  for (const [index, note] of tuningNotes.entries())
    await settings.getByLabel('Nota con octava', { exact: true }).nth(index).fill(note)
  await settings.getByRole('button', { name: 'Guardar afinación' }).click()
  await expect(
    settings.getByRole('option', { name: 'Mi DADGAD · personal', exact: true }),
  ).toHaveJSProperty('selected', true)
  await settings.getByRole('button', { name: 'Listo, a tocar' }).click()
  for (let string = 1; string <= 6; string++)
    await page
      .getByRole('button', { name: new RegExp(`cuerda ${string} al aire, seleccionar`) })
      .press('Enter')
  await expect(page.locator('.open-control.selected')).toHaveCount(6)
  const dadgadChord = await page.locator('.result-chord').innerText()
  await page.getByRole('button', { name: 'Guardar en biblioteca' }).click()
  await expect(page.getByRole('status')).toContainText('Guardado en tu biblioteca')
  await page.getByRole('button', { name: 'Añadir a progresión' }).click()
  await page.getByLabel('Nombre de la progresión').fill('Idea DADGAD')
  await page.getByRole('button', { name: 'Guardar progresión' }).click()
  await expect(page.getByRole('status')).toContainText('Progresión guardada')

  await page.getByRole('link', { name: 'Explorar', exact: true }).first().click()
  await page.getByRole('button', { name: /Teclado virtual/ }).click()
  for (const note of ['C3', 'E3', 'G3'])
    await page.getByRole('button', { name: note, exact: true }).click()
  await expect(page.locator('.result-chord')).toHaveText('C')
  await page.getByRole('button', { name: 'Guardar en biblioteca' }).click()
  await expect(page.getByRole('status')).toContainText('Guardado en tu biblioteca')
  await library(page)
  const backupPath = testInfo.outputPath('biblioteca.json')
  const exported = await exportBackup(page, backupPath)
  expect(exported.version).toBe(1)
  expect(exported.tunings).toHaveLength(1)
  expect(exported.tunings[0]!.notes).toEqual(tuningNotes)
  expect(exported.favorites).toHaveLength(3)
  expect(exported.favorites.find((item) => item.name === 'E')?.frets).toEqual([0, 2, 2, 1, 0, 0])
  expect(exported.favorites.find((item) => item.name === dadgadChord)?.context.tuning.name).toBe(
    'Mi DADGAD',
  )
  expect(exported.favorites.find((item) => item.name === 'C')?.notes).toEqual(['C3', 'E3', 'G3'])
  expect(exported.progressions).toHaveLength(1)
  expect(exported.progressions[0]!.context.tuning.notes).toEqual(tuningNotes)
  expect(exported.progressions[0]!.steps.at(-1)?.voicing).toEqual([0, 0, 0, 0, 0, 0])

  // A new browser context starts with genuinely empty IndexedDB.
  const isolated = await browser.newContext()
  try {
    const restored = await isolated.newPage()
    await restored.goto(new URL('/biblioteca', page.url()).href)
    await expect(restored.getByRole('heading', { name: 'Aquí empiezan tus ideas.' })).toBeVisible()
    await restored.getByLabel('Archivo de copia de seguridad').setInputFiles(backupPath)
    const preview = restored.locator('.import-preview')
    await expect(preview.getByRole('heading', { name: 'Tu copia está lista.' })).toBeVisible()
    await expect(preview).toContainText('También se aplicarán los ajustes')
    await expect(restored.locator('.saved-item')).toHaveCount(0)
    await preview.getByRole('button', { name: 'Confirmar importación' }).click()
    await expect(restored.getByRole('status')).toContainText('5 elementos añadidos y 0 conflictos')
    await expect(restored.locator('.saved-item')).toHaveCount(3)
    const piano = restored
      .locator('.saved-item')
      .filter({ has: restored.getByRole('heading', { name: 'C', exact: true }) })
    await expect(piano.locator('.saved-notes')).toHaveText('C3 · E3 · G3')
    await piano.getByRole('link', { name: 'Explorar' }).click()
    for (const note of ['C3', 'E3', 'G3'])
      await expect(restored.getByRole('button', { name: note, exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      )

    await library(restored)
    const savedPosition = restored
      .locator('.saved-item')
      .filter({ has: restored.getByRole('heading', { name: dadgadChord, exact: true }) })
    await savedPosition.getByRole('link', { name: 'Explorar' }).click()
    await expect(restored.getByRole('group', { name: 'Mástil, Mi DADGAD' })).toBeVisible()
    await expect(restored.locator('.open-control.selected')).toHaveCount(6)
    await expect(restored.locator('.result-chord')).toHaveText(dadgadChord)
    await library(restored)
    await restored.getByRole('button', { name: /Progresiones/ }).click()
    await expect(restored.getByRole('heading', { name: 'Idea DADGAD' })).toBeVisible()
    await restored.getByRole('link', { name: 'Editar', exact: true }).click()
    await expect(restored.getByLabel('Nombre de la progresión')).toHaveValue('Idea DADGAD')
    await expect(restored.locator('.context-note')).toContainText('Mi DADGAD')
    await expect(restored.locator('.chord-step')).toHaveCount(5)
    await library(restored)
    await restored.getByRole('button', { name: /Afinaciones/ }).click()
    await expect(restored.getByRole('heading', { name: 'Mi DADGAD', exact: true })).toBeVisible()
    await expect(restored.locator('.saved-notes')).toHaveText(tuningNotes.join(' · '))

    // Reimport one changed ID: preserve the original and create exactly one copy.
    const conflicting = JSON.parse(JSON.stringify(exported)) as Backup
    conflicting.favorites.find((item) => item.name === 'E')!.name = 'E importado'
    await restored
      .getByLabel('Archivo de copia de seguridad')
      .setInputFiles({
        name: 'conflicto.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(conflicting)),
      })
    await restored.getByRole('button', { name: 'Confirmar importación' }).click()
    await expect(restored.getByRole('status')).toContainText('1 elementos añadidos y 1 conflictos')
    await restored.getByRole('button', { name: /Favoritos/ }).click()
    await expect(restored.getByRole('heading', { name: 'E', exact: true })).toBeVisible()
    await expect(
      restored.getByRole('heading', { name: 'E importado (copia)', exact: true }),
    ).toBeVisible()
    await expect(restored.locator('.saved-item')).toHaveCount(4)

    await restored
      .getByLabel('Archivo de copia de seguridad')
      .setInputFiles({
        name: 'invalido.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify({ ...exported, version: 99 })),
      })
    await expect(restored.getByRole('alert')).toContainText('version')
    await expect(restored.getByRole('button', { name: 'Confirmar importación' })).toHaveCount(0)
    await expect(restored.locator('.saved-item')).toHaveCount(4)
    await restored.reload()
    await expect(
      restored.getByRole('heading', { name: 'E importado (copia)', exact: true }),
    ).toBeVisible()
  } finally {
    await isolated.close()
  }
})
