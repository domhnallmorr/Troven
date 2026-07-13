const { randomUUID } = require('node:crypto')
const fs = require('node:fs/promises')
const path = require('node:path')

const defaultSettings = {
  defaultTextEditor: '',
  openWith: {},
  quickAccessGroups: [],
  fileListColumns: {
    name: 420,
    type: 150,
    modifiedAt: 190,
    size: 110,
  },
}

function createDataStore({
  app,
  dataDirectory = process.cwd(),
  now = () => Date.now(),
  createId = randomUUID,
} = {}) {
  function getSettingsPath() {
    return path.join(getDataDirectory(), 'settings.json')
  }

  function getProjectsPath() {
    return path.join(getDataDirectory(), 'projects.json')
  }

  function getDiaryPath() {
    return path.join(getDataDirectory(), 'diary.json')
  }

  function getDataDirectory() {
    return dataDirectory
  }

  function getBackupDirectory() {
    return path.join(getDataDirectory(), 'backups')
  }

  function getLegacyDataPath(filename) {
    return path.join(app?.getPath?.('userData') ?? getDataDirectory(), filename)
  }

  function getBackupTimestamp() {
    return new Date(now()).toISOString().replaceAll(':', '-').replaceAll('.', '-')
  }

  async function getBackupPaths(filePath) {
    try {
      const backupDirectory = getBackupDirectory()
      const backupPrefix = `${path.basename(filePath)}.`
      const backupFiles = await fs.readdir(backupDirectory)

      return backupFiles
        .filter((file) => file.startsWith(backupPrefix) && file.endsWith('.bak'))
        .sort()
        .reverse()
        .map((file) => path.join(backupDirectory, file))
    } catch {
      return []
    }
  }

  async function readJsonWithBackups(filePath, fallbackValue) {
    const candidatePaths = [
      filePath,
      ...(await getBackupPaths(filePath)),
      getLegacyDataPath(path.basename(filePath)),
    ]

    for (const candidatePath of candidatePaths) {
      try {
        const rawJson = await fs.readFile(candidatePath, 'utf8')
        return JSON.parse(rawJson)
      } catch {
        // Try the next candidate.
      }
    }

    return fallbackValue
  }

  async function backupExistingJsonFile(filePath) {
    try {
      await fs.access(filePath)
    } catch {
      return
    }

    const backupDirectory = getBackupDirectory()
    const backupPath = path.join(
      backupDirectory,
      `${path.basename(filePath)}.${getBackupTimestamp()}.bak`,
    )

    await fs.mkdir(backupDirectory, { recursive: true })
    await fs.copyFile(filePath, backupPath)
  }

  async function writeJsonAtomically(filePath, value) {
    const directory = path.dirname(filePath)
    const tempPath = path.join(
      directory,
      `.${path.basename(filePath)}.${process.pid}.${now()}.tmp`,
    )

    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
    await backupExistingJsonFile(filePath)
    await fs.rename(tempPath, filePath)
  }

  function mergeSettings(settings) {
    return {
      ...defaultSettings,
      ...settings,
      openWith: {
        ...defaultSettings.openWith,
        ...(settings && typeof settings.openWith === 'object' ? settings.openWith : {}),
      },
      quickAccessGroups: Array.isArray(settings?.quickAccessGroups)
        ? settings.quickAccessGroups
        : defaultSettings.quickAccessGroups,
      fileListColumns: {
        ...defaultSettings.fileListColumns,
        ...(settings && typeof settings.fileListColumns === 'object' ? settings.fileListColumns : {}),
      },
    }
  }

  async function readSettings() {
    return mergeSettings(await readJsonWithBackups(getSettingsPath(), {}))
  }

  async function writeSettings(nextSettings) {
    const settings = mergeSettings(nextSettings)
    await writeJsonAtomically(getSettingsPath(), settings)
    return settings
  }

  async function updateSettings(patch) {
    const currentSettings = await readSettings()
    return writeSettings({
      ...currentSettings,
      ...patch,
      openWith: patch.openWith ?? currentSettings.openWith,
      quickAccessGroups: patch.quickAccessGroups ?? currentSettings.quickAccessGroups,
      fileListColumns: patch.fileListColumns ?? currentSettings.fileListColumns,
    })
  }

  function getQuickAccessDefaults() {
    return [
      { id: 'downloads', name: 'Downloads', path: app?.getPath?.('downloads') ?? '' },
      { id: 'documents', name: 'Documents', path: app?.getPath?.('documents') ?? '' },
      { id: 'desktop', name: 'Desktop', path: app?.getPath?.('desktop') ?? '' },
      { id: 'pictures', name: 'Pictures', path: app?.getPath?.('pictures') ?? '' },
    ]
  }

  function normalizeProject(project) {
    const timestamp = now()
    const id = String(project.id || createId())

    return {
      id,
      name: String(project.name || 'Untitled Project').trim() || 'Untitled Project',
      customer: String(project.customer || '').trim(),
      projectNumber: String(project.projectNumber || '').trim(),
      status: project.status === 'archived' ? 'archived' : 'active',
      activeTabId: String(project.activeTabId || ''),
      tabs: Array.isArray(project.tabs) ? project.tabs : [],
      createdAt: Number(project.createdAt || timestamp),
      updatedAt: timestamp,
      archivedAt: project.status === 'archived' ? Number(project.archivedAt || timestamp) : undefined,
    }
  }

  async function readProjects() {
    const projects = await readJsonWithBackups(getProjectsPath(), [])
    return Array.isArray(projects) ? projects.map(normalizeProject) : []
  }

  async function writeProjects(projects) {
    await writeJsonAtomically(getProjectsPath(), projects)
    return projects
  }

  async function saveProjects(projects) {
    const normalizedProjects = Array.isArray(projects) ? projects.map(normalizeProject) : []
    await writeProjects(normalizedProjects)
    return normalizedProjects
  }

  async function saveProject(project) {
    const projects = await readProjects()
    const normalizedProject = normalizeProject(project)
    const existingIndex = projects.findIndex((candidate) => candidate.id === normalizedProject.id)
    const nextProjects =
      existingIndex === -1
        ? [...projects, normalizedProject]
        : projects.map((candidate, index) => (index === existingIndex ? normalizedProject : candidate))

    await writeProjects(nextProjects)
    return normalizedProject
  }

  async function archiveProject(projectId) {
    const projects = await readProjects()
    const timestamp = now()
    const nextProjects = projects.map((project) =>
      project.id === projectId
        ? { ...project, status: 'archived', archivedAt: timestamp, updatedAt: timestamp }
        : project,
    )

    await writeProjects(nextProjects)
    return nextProjects
  }

  async function restoreProject(projectId) {
    const projects = await readProjects()
    const timestamp = now()
    const nextProjects = projects.map((project) =>
      project.id === projectId
        ? { ...project, status: 'active', archivedAt: undefined, updatedAt: timestamp }
        : project,
    )

    await writeProjects(nextProjects)
    return nextProjects
  }

  async function readDiary() {
    const diary = await readJsonWithBackups(getDiaryPath(), {})
    return diary && typeof diary === 'object' ? diary : {}
  }

  async function writeDiaryEntry(date, html) {
    const diary = await readDiary()
    const normalizedDate = String(date)

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) {
      throw new Error('Diary date must use YYYY-MM-DD format.')
    }

    diary[normalizedDate] = {
      html: String(html || ''),
      updatedAt: now(),
    }

    await writeJsonAtomically(getDiaryPath(), diary)
    return diary[normalizedDate]
  }

  return {
    archiveProject,
    defaultSettings,
    getBackupDirectory,
    getDiaryPath,
    getProjectsPath,
    getQuickAccessDefaults,
    getSettingsPath,
    normalizeProject,
    readDiary,
    readJsonWithBackups,
    readProjects,
    readSettings,
    restoreProject,
    saveProject,
    saveProjects,
    updateSettings,
    writeDiaryEntry,
    writeJsonAtomically,
    writeProjects,
    writeSettings,
  }
}

module.exports = {
  createDataStore,
  defaultSettings,
}
