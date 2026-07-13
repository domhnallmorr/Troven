import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createDataStore } from './dataStore.cjs'

let tempDirectory
let legacyDirectory
let tick

const fakeApp = {
  getPath(name) {
    const paths = {
      desktop: path.join(tempDirectory, 'Desktop'),
      documents: path.join(tempDirectory, 'Documents'),
      downloads: path.join(tempDirectory, 'Downloads'),
      pictures: path.join(tempDirectory, 'Pictures'),
      userData: legacyDirectory,
    }

    return paths[name] ?? tempDirectory
  },
}

function makeStore() {
  return createDataStore({
    app: fakeApp,
    dataDirectory: tempDirectory,
    now: () => tick++,
    createId: () => `project-${tick++}`,
  })
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'))
}

beforeEach(async () => {
  tempDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'troven-data-store-'))
  legacyDirectory = path.join(tempDirectory, 'legacy')
  tick = Date.UTC(2026, 6, 13, 12, 0, 0)
})

afterEach(async () => {
  await fs.rm(tempDirectory, { force: true, recursive: true })
})

describe('data store persistence', () => {
  it('writes JSON atomically and backs up the previous version', async () => {
    const store = makeStore()
    const settingsPath = store.getSettingsPath()

    await store.writeSettings({ defaultTextEditor: 'C:\\Tools\\notepad++.exe' })
    await store.writeSettings({ defaultTextEditor: 'C:\\Tools\\code.exe' })

    expect(await readJson(settingsPath)).toMatchObject({
      defaultTextEditor: 'C:\\Tools\\code.exe',
    })

    const files = await fs.readdir(tempDirectory)
    expect(files.some((file) => file.endsWith('.tmp'))).toBe(false)

    const backupFiles = await fs.readdir(store.getBackupDirectory())
    expect(backupFiles).toHaveLength(1)
    expect(backupFiles[0]).toMatch(/^settings\.json\..+\.bak$/)

    const backup = await readJson(path.join(store.getBackupDirectory(), backupFiles[0]))
    expect(backup).toMatchObject({
      defaultTextEditor: 'C:\\Tools\\notepad++.exe',
    })
  })

  it('falls back to the newest valid backup when the main project JSON is corrupt', async () => {
    const store = makeStore()
    const projectsPath = store.getProjectsPath()
    const backupDirectory = store.getBackupDirectory()

    await fs.mkdir(backupDirectory, { recursive: true })
    await fs.writeFile(projectsPath, '{ broken json', 'utf8')
    await fs.writeFile(
      path.join(backupDirectory, 'projects.json.2026-07-13T10-00-00-000Z.bak'),
      JSON.stringify([{ id: 'old', name: 'Old Backup', tabs: [] }]),
      'utf8',
    )
    await fs.writeFile(
      path.join(backupDirectory, 'projects.json.2026-07-13T11-00-00-000Z.bak'),
      JSON.stringify([{ id: 'new', name: 'New Backup', tabs: [{ id: 'tab-a' }] }]),
      'utf8',
    )

    const projects = await store.readProjects()

    expect(projects).toHaveLength(1)
    expect(projects[0]).toMatchObject({
      id: 'new',
      name: 'New Backup',
      tabs: [{ id: 'tab-a' }],
    })
  })

  it('uses legacy app data only after current JSON and backups fail', async () => {
    const store = makeStore()

    await fs.mkdir(legacyDirectory, { recursive: true })
    await fs.writeFile(
      path.join(legacyDirectory, 'projects.json'),
      JSON.stringify([{ id: 'legacy', name: 'Legacy Project', tabs: [] }]),
      'utf8',
    )

    const projects = await store.readProjects()

    expect(projects).toHaveLength(1)
    expect(projects[0]).toMatchObject({
      id: 'legacy',
      name: 'Legacy Project',
    })
  })
})

describe('project data handling', () => {
  it('edits project metadata without losing tabs or archived state', async () => {
    const store = makeStore()
    const tabs = [
      {
        id: 'tab-1',
        currentPath: 'Z:\\Customer\\Job',
        customName: 'Calculations',
        isNameLocked: true,
        filter: { mode: 'include', extensions: ['pdf'] },
      },
    ]

    await store.saveProject({
      id: 'project-1',
      name: 'Original',
      customer: 'Old Customer',
      projectNumber: 'P-001',
      status: 'archived',
      archivedAt: 123,
      activeTabId: 'tab-1',
      tabs,
      createdAt: 100,
    })

    await store.saveProject({
      id: 'project-1',
      name: 'Renamed',
      customer: 'New Customer',
      projectNumber: 'P-002',
      status: 'archived',
      archivedAt: 123,
      activeTabId: 'tab-1',
      tabs,
      createdAt: 100,
    })

    const [project] = await store.readProjects()

    expect(project).toMatchObject({
      id: 'project-1',
      name: 'Renamed',
      customer: 'New Customer',
      projectNumber: 'P-002',
      status: 'archived',
      archivedAt: 123,
      activeTabId: 'tab-1',
      tabs,
      createdAt: 100,
    })
  })

  it('preserves project order when saving the reordered project list', async () => {
    const store = makeStore()

    await store.saveProjects([
      { id: 'b', name: 'Second', tabs: [] },
      { id: 'a', name: 'First', tabs: [] },
    ])

    expect((await store.readProjects()).map((project) => project.id)).toEqual(['b', 'a'])
  })
})

describe('settings and diary data', () => {
  it('merges partial settings updates without clearing existing nested values', async () => {
    const store = makeStore()

    await store.writeSettings({
      defaultTextEditor: 'C:\\Tools\\notepad++.exe',
      openWith: { pdf: ['C:\\Chrome\\chrome.exe'] },
      fileListColumns: { name: 500, size: 90 },
    })

    const settings = await store.updateSettings({
      defaultTextEditor: 'C:\\Tools\\code.exe',
    })

    expect(settings).toMatchObject({
      defaultTextEditor: 'C:\\Tools\\code.exe',
      openWith: { pdf: ['C:\\Chrome\\chrome.exe'] },
      fileListColumns: {
        name: 500,
        type: 150,
        modifiedAt: 190,
        size: 90,
      },
    })
  })

  it('rejects diary entries without a YYYY-MM-DD date', async () => {
    const store = makeStore()

    await expect(store.writeDiaryEntry('13/07/2026', '<p>Nope</p>')).rejects.toThrow(
      'Diary date must use YYYY-MM-DD format.',
    )
  })
})
