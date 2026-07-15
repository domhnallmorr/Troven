const { app, BrowserWindow, Menu, clipboard, dialog, ipcMain, nativeTheme, shell } = require('electron')
const { spawn } = require('node:child_process')
const fs = require('node:fs/promises')
const path = require('node:path')
const JSZip = require('jszip')
const { PDFDocument } = require('pdf-lib')
const { createDataStore } = require('./dataStore.cjs')
const { getVisibleDirectoryEntries } = require('./fileSystemUtils.cjs')

const isDev = !app.isPackaged
const validThemes = new Set(['light', 'dark', 'slate'])
let currentTheme = 'light'
const iconCache = new Map()
const themeBackgrounds = {
  light: '#f6f7f9',
  dark: '#17191d',
  slate: '#0f1720',
}
const dataStore = createDataStore({ app })
const {
  archiveProject,
  getQuickAccessDefaults,
  readDiary,
  readProjects,
  readSettings,
  restoreProject,
  saveProject,
  saveProjects,
  updateSettings,
  writeDiaryEntry,
} = dataStore

async function getPdfPageCount(pdfPath) {
  const pdfBytes = await fs.readFile(pdfPath)
  const pdfDocument = await PDFDocument.load(pdfBytes)
  return pdfDocument.getPageCount()
}

async function extractPdfPages(sourcePath, outputPath, startPage, endPage) {
  const firstPage = Number(startPage)
  const lastPage = Number(endPage)

  if (!sourcePath || !outputPath) {
    throw new Error('Source and output PDF paths are required.')
  }

  if (!Number.isInteger(firstPage) || !Number.isInteger(lastPage) || firstPage < 1 || lastPage < firstPage) {
    throw new Error('Invalid page range.')
  }

  const sourceBytes = await fs.readFile(sourcePath)
  const sourceDocument = await PDFDocument.load(sourceBytes)
  const pageCount = sourceDocument.getPageCount()

  if (lastPage > pageCount) {
    throw new Error(`Page range exceeds PDF page count (${pageCount}).`)
  }

  const outputDocument = await PDFDocument.create()
  const pageIndexes = Array.from({ length: lastPage - firstPage + 1 }, (_value, index) => firstPage - 1 + index)
  const copiedPages = await outputDocument.copyPages(sourceDocument, pageIndexes)

  for (const page of copiedPages) {
    outputDocument.addPage(page)
  }

  const outputBytes = await outputDocument.save()
  await fs.writeFile(outputPath, outputBytes)
  return outputPath
}

async function mergePdfFiles(sourcePaths, outputPath) {
  if (!Array.isArray(sourcePaths) || sourcePaths.length === 0) {
    throw new Error('At least one PDF path is required.')
  }

  if (!outputPath) {
    throw new Error('Output PDF path is required.')
  }

  const outputDocument = await PDFDocument.create()

  for (const sourcePath of sourcePaths) {
    const pdfBytes = await fs.readFile(sourcePath)
    const sourceDocument = await PDFDocument.load(pdfBytes)
    const copiedPages = await outputDocument.copyPages(
      sourceDocument,
      sourceDocument.getPageIndices(),
    )

    for (const page of copiedPages) {
      outputDocument.addPage(page)
    }
  }

  const outputBytes = await outputDocument.save()
  await fs.writeFile(outputPath, outputBytes)
  return outputPath
}

function openSettingsModal(kind) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('settings:open', kind)
  }
}

function openProjectsManager() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('projects:manage')
  }
}

function openDiary() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('tools:diary')
  }
}

function openPdfTool(tool) {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('tools:pdf', tool)
  }
}

function applyNativeTheme(theme) {
  nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark'

  for (const win of BrowserWindow.getAllWindows()) {
    win.setBackgroundColor(themeBackgrounds[theme] ?? themeBackgrounds.light)
  }
}

function setTheme(theme) {
  if (!validThemes.has(theme)) {
    return
  }

  currentTheme = theme
  applyNativeTheme(theme)
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('theme:set', theme)
  }
  Menu.setApplicationMenu(createAppMenu())
}

function createAppMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [{ role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Theme',
          submenu: [
            {
              label: 'Light',
              type: 'radio',
              checked: currentTheme === 'light',
              click: () => setTheme('light'),
            },
            {
              label: 'Dark',
              type: 'radio',
              checked: currentTheme === 'dark',
              click: () => setTheme('dark'),
            },
            {
              label: 'Slate',
              type: 'radio',
              checked: currentTheme === 'slate',
              click: () => setTheme('slate'),
            },
          ],
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Projects',
      submenu: [
        {
          label: 'Manage Projects',
          click: () => openProjectsManager(),
        },
      ],
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Diary',
          click: () => openDiary(),
        },
        {
          label: 'PDF Tools',
          submenu: [
            {
              label: 'Extract Pages',
              click: () => openPdfTool('extract'),
            },
            {
              label: 'Merge PDFs',
              click: () => openPdfTool('merge'),
            },
          ],
        },
      ],
    },
    {
      label: 'Settings',
      submenu: [
        {
          label: 'Default Text Editor',
          click: () => openSettingsModal('textEditor'),
        },
        {
          label: 'Open With Options',
          click: () => openSettingsModal('openWith'),
        },
        {
          label: 'File List Columns',
          click: () => openSettingsModal('columns'),
        },
      ],
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }],
    },
  ])
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 560,
    title: 'Troven',
    backgroundColor: '#f6f7f9',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173')
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'renderer', 'index.html'))
  }
}

async function readDirectory(directoryPath) {
  const entries = getVisibleDirectoryEntries(await fs.readdir(directoryPath, { withFileTypes: true }))

  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directoryPath, entry.name)
      let stats = null

      try {
        stats = await fs.stat(fullPath)
      } catch {
        return null
      }

      const extension = entry.isDirectory() ? '' : path.extname(entry.name).slice(1).toLowerCase()
      const iconDataUrl = await getEntryIcon(fullPath, entry.isDirectory(), extension)

      return {
        name: entry.name,
        path: fullPath,
        type: entry.isDirectory() ? 'folder' : 'file',
        extension,
        iconDataUrl,
        size: entry.isDirectory() ? null : stats.size,
        modifiedAt: stats.mtimeMs,
      }
    }),
  )

  return files.filter(Boolean)
}

async function getEntryIcon(fullPath, isDirectory, extension) {
  const cacheKey = isDirectory ? '__folder__' : extension || '__file__'
  const cachedIcon = iconCache.get(cacheKey)

  if (cachedIcon) {
    return cachedIcon
  }

  try {
    const icon = await app.getFileIcon(fullPath, { size: 'small' })
    const dataUrl = icon.toDataURL()
    iconCache.set(cacheKey, dataUrl)
    return dataUrl
  } catch {
    return null
  }
}

async function getNewEntryIcons() {
  const tempDirectory = path.join(app.getPath('temp'), 'troven-icons')
  await fs.mkdir(tempDirectory, { recursive: true })

  const iconTargets = {
    text: 'troven-icon.txt',
    excel: 'troven-icon.xlsx',
    word: 'troven-icon.docx',
  }
  const icons = {}

  await Promise.all(
    Object.entries(iconTargets).map(async ([type, filename]) => {
      const targetPath = path.join(tempDirectory, filename)

      try {
        await fs.writeFile(targetPath, '', { flag: 'a' })
        icons[type] = await getEntryIcon(targetPath, false, path.extname(filename).slice(1))
      } catch {
        icons[type] = null
      }
    }),
  )

  return icons
}

function normalizeNewEntryName(name, type) {
  const trimmedName = String(name).trim()

  if (!trimmedName) {
    throw new Error('Name cannot be empty.')
  }

  if (trimmedName.includes('/') || trimmedName.includes('\\')) {
    throw new Error('Name cannot contain path separators.')
  }

  const extensionByType = {
    folder: '',
    text: '.txt',
    word: '.docx',
    excel: '.xlsx',
  }
  const extension = extensionByType[type]

  if (extension && !trimmedName.toLowerCase().endsWith(extension)) {
    return `${trimmedName}${extension}`
  }

  return trimmedName
}

async function createWordDocument(targetPath) {
  const zip = new JSZip()

  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  )
  zip.file(
    'word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p/><w:sectPr/></w:body>' +
      '</w:document>',
  )

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  await fs.writeFile(targetPath, buffer, { flag: 'wx' })
}

async function createExcelWorkbook(targetPath) {
  const zip = new JSZip()

  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '</Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>',
  )
  zip.file(
    'xl/workbook.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets>' +
      '</workbook>',
  )
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '</Relationships>',
  )
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>',
  )

  const buffer = await zip.generateAsync({ type: 'nodebuffer' })
  await fs.writeFile(targetPath, buffer, { flag: 'wx' })
}

async function createEntry(directoryPath, type, name) {
  const normalizedType = String(type)

  if (!['folder', 'text', 'word', 'excel'].includes(normalizedType)) {
    throw new Error('Unsupported item type.')
  }

  const normalizedName = normalizeNewEntryName(name, normalizedType)
  const targetPath = path.join(directoryPath, normalizedName)

  if (normalizedType === 'folder') {
    await fs.mkdir(targetPath)
  } else if (normalizedType === 'text') {
    await fs.writeFile(targetPath, '', { flag: 'wx' })
  } else if (normalizedType === 'word') {
    await createWordDocument(targetPath)
  } else if (normalizedType === 'excel') {
    await createExcelWorkbook(targetPath)
  }

  return targetPath
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function getAvailableDestinationPath(destinationDirectory, sourcePath) {
  const parsedPath = path.parse(sourcePath)
  let candidatePath = path.join(destinationDirectory, parsedPath.base)

  if (!(await pathExists(candidatePath))) {
    return candidatePath
  }

  let index = 2
  candidatePath = path.join(destinationDirectory, `${parsedPath.name} - Copy${parsedPath.ext}`)

  while (await pathExists(candidatePath)) {
    candidatePath = path.join(
      destinationDirectory,
      `${parsedPath.name} - Copy (${index})${parsedPath.ext}`,
    )
    index += 1
  }

  return candidatePath
}

async function copyPath(sourcePath, destinationPath) {
  const stats = await fs.stat(sourcePath)

  if (stats.isDirectory()) {
    await fs.cp(sourcePath, destinationPath, { recursive: true, errorOnExist: true, force: false })
    return
  }

  await fs.copyFile(sourcePath, destinationPath, fs.constants.COPYFILE_EXCL)
}

async function replacePath(sourcePath, destinationPath, operation) {
  const normalizedSourcePath = path.resolve(sourcePath).toLowerCase()
  const normalizedDestinationPath = path.resolve(destinationPath).toLowerCase()

  if (normalizedSourcePath === normalizedDestinationPath) {
    return
  }

  await fs.rm(destinationPath, { force: true, recursive: true })

  if (operation === 'copy') {
    await copyPath(sourcePath, destinationPath)
    return
  }

  await movePath(sourcePath, destinationPath)
}

async function movePath(sourcePath, destinationPath) {
  try {
    await fs.rename(sourcePath, destinationPath)
  } catch (error) {
    if (error && error.code !== 'EXDEV') {
      throw error
    }

    await copyPath(sourcePath, destinationPath)
    const stats = await fs.stat(sourcePath)

    if (stats.isDirectory()) {
      await fs.rm(sourcePath, { recursive: true, force: false })
    } else {
      await fs.unlink(sourcePath)
    }
  }
}

async function getPasteConflictAction(focusedWindow, sourcePath, destinationPath) {
  const result = await dialog.showMessageBox(focusedWindow, {
    type: 'question',
    buttons: ['Replace', 'Keep Both', 'Skip', 'Cancel'],
    defaultId: 1,
    cancelId: 3,
    title: 'File already exists',
    message: `An item named "${path.basename(destinationPath)}" already exists in this folder.`,
    detail: `Source:\n${sourcePath}\n\nDestination:\n${destinationPath}`,
    noLink: true,
  })

  return ['replace', 'keepBoth', 'skip', 'cancel'][result.response] || 'cancel'
}

async function pasteEntries(destinationDirectory, operation, sourcePaths, focusedWindow = null) {
  const normalizedOperation = String(operation)

  if (!['copy', 'cut'].includes(normalizedOperation)) {
    throw new Error('Unsupported clipboard operation.')
  }

  const pastedPaths = []

  for (const sourcePath of sourcePaths) {
    const defaultDestinationPath = path.join(destinationDirectory, path.basename(sourcePath))
    let destinationPath = defaultDestinationPath
    let conflictAction = 'replace'

    if (await pathExists(defaultDestinationPath)) {
      conflictAction = await getPasteConflictAction(focusedWindow, sourcePath, defaultDestinationPath)

      if (conflictAction === 'cancel') {
        break
      }

      if (conflictAction === 'skip') {
        continue
      }

      if (conflictAction === 'keepBoth') {
        destinationPath = await getAvailableDestinationPath(destinationDirectory, sourcePath)
      }
    }

    if (conflictAction === 'replace') {
      await replacePath(sourcePath, destinationPath, normalizedOperation)
    } else if (normalizedOperation === 'copy') {
      await copyPath(sourcePath, destinationPath)
    } else {
      await movePath(sourcePath, destinationPath)
    }

    pastedPaths.push(destinationPath)
  }

  return pastedPaths
}

function normalizeExecutablePath(programPath) {
  return String(programPath).trim().replace(/^["']|["']$/g, '')
}

function normalizeSearchExtensions(extensions) {
  if (!Array.isArray(extensions)) {
    return new Set()
  }

  return new Set(
    extensions
      .map((extension) => String(extension).trim().toLowerCase().replace(/^\./, ''))
      .filter(Boolean),
  )
}

function matchesSearchQuery(name, query, matchMode, caseSensitive) {
  if (!query) {
    return true
  }

  const candidateName = caseSensitive ? name : name.toLowerCase()
  const candidateQuery = caseSensitive ? query : query.toLowerCase()

  if (matchMode === 'startsWith') {
    return candidateName.startsWith(candidateQuery)
  }

  if (matchMode === 'endsWith') {
    return candidateName.endsWith(candidateQuery)
  }

  if (matchMode === 'exact') {
    return candidateName === candidateQuery
  }

  return candidateName.includes(candidateQuery)
}

async function searchDirectory(rootPath, options) {
  const query = String(options.query ?? '').trim()
  const extensionSet = normalizeSearchExtensions(options.extensions)

  if (!query && extensionSet.size === 0) {
    throw new Error('Search text or at least one extension is required.')
  }

  const target = ['files', 'folders', 'both'].includes(options.target) ? options.target : 'both'
  const matchMode = ['contains', 'startsWith', 'endsWith', 'exact'].includes(options.matchMode)
    ? options.matchMode
    : 'contains'
  const includeSubdirectories = Boolean(options.includeSubdirectories)
  const caseSensitive = Boolean(options.caseSensitive)
  const maxResults = 1000
  const results = []
  const pendingDirectories = [rootPath]

  while (pendingDirectories.length > 0 && results.length < maxResults) {
    const directoryPath = pendingDirectories.shift()
    let entries = []

    try {
      entries = getVisibleDirectoryEntries(await fs.readdir(directoryPath, { withFileTypes: true }))
    } catch {
      continue
    }

    for (const entry of entries) {
      if (results.length >= maxResults) {
        break
      }

      const fullPath = path.join(directoryPath, entry.name)
      const isDirectory = entry.isDirectory()
      const entryType = isDirectory ? 'folder' : 'file'

      if (isDirectory && includeSubdirectories) {
        pendingDirectories.push(fullPath)
      }

      if (target === 'files' && isDirectory) {
        continue
      }

      if (target === 'folders' && !isDirectory) {
        continue
      }

      const extension = isDirectory ? '' : path.extname(entry.name).slice(1).toLowerCase()

      if (!isDirectory && extensionSet.size > 0 && !extensionSet.has(extension)) {
        continue
      }

      if (!matchesSearchQuery(entry.name, query, matchMode, caseSensitive)) {
        continue
      }

      results.push({
        name: entry.name,
        path: fullPath,
        type: entryType,
        extension,
      })
    }
  }

  return {
    isLimited: results.length >= maxResults,
    maxResults,
    results,
  }
}

app.whenReady().then(() => {
  ipcMain.handle('app:get-version', () => app.getVersion())
  ipcMain.handle('app:get-data-directory', () => getDataDirectory())
  ipcMain.handle('settings:get', () => readSettings())
  ipcMain.handle('settings:update', (_event, patch) => updateSettings(patch))
  ipcMain.handle('app:get-quick-access-defaults', () => getQuickAccessDefaults())
  ipcMain.handle('projects:get', () => readProjects())
  ipcMain.handle('projects:save-all', (_event, projects) => saveProjects(projects))
  ipcMain.handle('projects:save', (_event, project) => saveProject(project))
  ipcMain.handle('projects:archive', (_event, projectId) => archiveProject(projectId))
  ipcMain.handle('projects:restore', (_event, projectId) => restoreProject(projectId))
  ipcMain.handle('diary:get', () => readDiary())
  ipcMain.handle('diary:save-entry', (_event, date, html) => writeDiaryEntry(date, html))
  ipcMain.handle('app:get-new-entry-icons', () => getNewEntryIcons())
  ipcMain.handle('dialog:open-folder', async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(focusedWindow, {
      title: 'Open Folder',
      properties: ['openDirectory'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })
  ipcMain.handle('dialog:show-error', async (_event, title, message) => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    await dialog.showMessageBox(focusedWindow, {
      type: 'error',
      title,
      message,
    })
  })
  ipcMain.handle('dialog:open-pdf', async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    const result = await dialog.showOpenDialog(focusedWindow, {
      title: 'Select PDF',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
      properties: ['openFile'],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })
  ipcMain.handle('dialog:save-pdf', async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow()
    const result = await dialog.showSaveDialog(focusedWindow, {
      title: 'Save PDF',
      defaultPath: 'output.pdf',
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }],
    })

    if (result.canceled || !result.filePath) {
      return null
    }

    return result.filePath.toLowerCase().endsWith('.pdf') ? result.filePath : `${result.filePath}.pdf`
  })
  ipcMain.handle('pdf:get-page-count', (_event, pdfPath) => getPdfPageCount(pdfPath))
  ipcMain.handle('pdf:extract-pages', (_event, sourcePath, outputPath, startPage, endPage) =>
    extractPdfPages(sourcePath, outputPath, startPage, endPage),
  )
  ipcMain.handle('pdf:merge-files', (_event, sourcePaths, outputPath) =>
    mergePdfFiles(sourcePaths, outputPath),
  )
  ipcMain.handle('fs:read-directory', async (_event, directoryPath) => readDirectory(directoryPath))
  ipcMain.handle('fs:search', async (_event, rootPath, options) => searchDirectory(rootPath, options))
  ipcMain.handle('fs:get-parent-path', (_event, targetPath) => {
    const parentPath = path.dirname(targetPath)
    return parentPath === targetPath ? targetPath : parentPath
  })
  ipcMain.handle('fs:rename-entry', async (_event, targetPath, nextName) => {
    const trimmedName = String(nextName).trim()

    if (!trimmedName) {
      throw new Error('Name cannot be empty.')
    }

    if (trimmedName.includes('/') || trimmedName.includes('\\')) {
      throw new Error('Name cannot contain path separators.')
    }

    const nextPath = path.join(path.dirname(targetPath), trimmedName)
    await fs.rename(targetPath, nextPath)
    return nextPath
  })
  ipcMain.handle('fs:create-entry', async (_event, directoryPath, type, name) =>
    createEntry(directoryPath, type, name),
  )
  ipcMain.handle('fs:paste-entries', async (_event, destinationDirectory, operation, sourcePaths) =>
    pasteEntries(destinationDirectory, operation, sourcePaths, BrowserWindow.getFocusedWindow()),
  )
  ipcMain.handle('fs:duplicate-file', async (_event, sourcePath) => {
    const stats = await fs.stat(sourcePath)

    if (stats.isDirectory()) {
      throw new Error('Only files can be duplicated.')
    }

    const destinationPath = await getAvailableDestinationPath(path.dirname(sourcePath), sourcePath)
    await copyPath(sourcePath, destinationPath)
    return destinationPath
  })
  ipcMain.handle('shell:open-in-explorer', async (_event, targetPath) => {
    const stats = await fs.stat(targetPath)

    if (stats.isDirectory()) {
      await shell.openPath(targetPath)
    } else {
      shell.showItemInFolder(targetPath)
    }

    return true
  })
  ipcMain.handle('shell:open-in-cmd', async (_event, targetPath) => {
    const stats = await fs.stat(targetPath)
    const directoryPath = stats.isDirectory() ? targetPath : path.dirname(targetPath)

    const child = spawn('cmd.exe', ['/c', 'start', '""', '/D', directoryPath, 'cmd.exe'], {
      cwd: directoryPath,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    })

    child.unref()
    return true
  })
  ipcMain.handle('shell:open-with-program', async (_event, programPath, targetPath) => {
    const trimmedProgramPath = normalizeExecutablePath(programPath)

    if (!trimmedProgramPath) {
      throw new Error('Program path is required.')
    }

    await fs.access(trimmedProgramPath)

    return new Promise((resolve, reject) => {
      const child = spawn(trimmedProgramPath, [targetPath], {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })

      child.once('error', reject)
      child.once('spawn', () => {
        child.unref()
        resolve(true)
      })
    })
  })
  ipcMain.handle('shell:open-path', async (_event, targetPath) => {
    const error = await shell.openPath(targetPath)

    if (error) {
      throw new Error(error)
    }

    return true
  })
  ipcMain.handle('clipboard:write-text', (_event, value) => {
    clipboard.writeText(value)
    return true
  })
  ipcMain.on('theme:current', (_event, theme) => {
    if (validThemes.has(theme)) {
      currentTheme = theme
      applyNativeTheme(theme)
      Menu.setApplicationMenu(createAppMenu())
    }
  })
  applyNativeTheme(currentTheme)
  Menu.setApplicationMenu(createAppMenu())
  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
