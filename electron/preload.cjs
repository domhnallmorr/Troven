const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('troven', {
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  getDataDirectory: () => ipcRenderer.invoke('app:get-data-directory'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  updateSettings: (patch) => ipcRenderer.invoke('settings:update', patch),
  getProjects: () => ipcRenderer.invoke('projects:get'),
  saveProjects: (projects) => ipcRenderer.invoke('projects:save-all', projects),
  saveProject: (project) => ipcRenderer.invoke('projects:save', project),
  archiveProject: (projectId) => ipcRenderer.invoke('projects:archive', projectId),
  restoreProject: (projectId) => ipcRenderer.invoke('projects:restore', projectId),
  getQuickAccessDefaults: () => ipcRenderer.invoke('app:get-quick-access-defaults'),
  getDiary: () => ipcRenderer.invoke('diary:get'),
  saveDiaryEntry: (date, html) => ipcRenderer.invoke('diary:save-entry', date, html),
  openPdfDialog: () => ipcRenderer.invoke('dialog:open-pdf'),
  savePdfDialog: () => ipcRenderer.invoke('dialog:save-pdf'),
  getPdfPageCount: (pdfPath) => ipcRenderer.invoke('pdf:get-page-count', pdfPath),
  extractPdfPages: (sourcePath, outputPath, startPage, endPage) =>
    ipcRenderer.invoke('pdf:extract-pages', sourcePath, outputPath, startPage, endPage),
  mergePdfFiles: (sourcePaths, outputPath) =>
    ipcRenderer.invoke('pdf:merge-files', sourcePaths, outputPath),
  onOpenDiary: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('tools:diary', listener)
    return () => ipcRenderer.removeListener('tools:diary', listener)
  },
  onManageProjects: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('projects:manage', listener)
    return () => ipcRenderer.removeListener('projects:manage', listener)
  },
  onOpenPdfTool: (callback) => {
    const listener = (_event, tool) => callback(tool)
    ipcRenderer.on('tools:pdf', listener)
    return () => ipcRenderer.removeListener('tools:pdf', listener)
  },
  onOpenSettings: (callback) => {
    const listener = (_event, kind) => callback(kind)
    ipcRenderer.on('settings:open', listener)
    return () => ipcRenderer.removeListener('settings:open', listener)
  },
  getNewEntryIcons: () => ipcRenderer.invoke('app:get-new-entry-icons'),
  openFolderDialog: () => ipcRenderer.invoke('dialog:open-folder'),
  showErrorDialog: (title, message) => ipcRenderer.invoke('dialog:show-error', title, message),
  readDirectory: (directoryPath) => ipcRenderer.invoke('fs:read-directory', directoryPath),
  searchDirectory: (rootPath, options) => ipcRenderer.invoke('fs:search', rootPath, options),
  getParentPath: (targetPath) => ipcRenderer.invoke('fs:get-parent-path', targetPath),
  renameEntry: (targetPath, nextName) => ipcRenderer.invoke('fs:rename-entry', targetPath, nextName),
  createEntry: (directoryPath, type, name) =>
    ipcRenderer.invoke('fs:create-entry', directoryPath, type, name),
  pasteEntries: (destinationDirectory, operation, sourcePaths) =>
    ipcRenderer.invoke('fs:paste-entries', destinationDirectory, operation, sourcePaths),
  duplicateFile: (sourcePath) => ipcRenderer.invoke('fs:duplicate-file', sourcePath),
  openPath: (targetPath) => ipcRenderer.invoke('shell:open-path', targetPath),
  openInExplorer: (targetPath) => ipcRenderer.invoke('shell:open-in-explorer', targetPath),
  openInCmd: (targetPath) => ipcRenderer.invoke('shell:open-in-cmd', targetPath),
  openWithProgram: (programPath, targetPath) =>
    ipcRenderer.invoke('shell:open-with-program', programPath, targetPath),
  writeClipboardText: (value) => ipcRenderer.invoke('clipboard:write-text', value),
  setCurrentTheme: (theme) => ipcRenderer.send('theme:current', theme),
  onThemeChange: (callback) => {
    const listener = (_event, theme) => callback(theme)
    ipcRenderer.on('theme:set', listener)
    return () => ipcRenderer.removeListener('theme:set', listener)
  },
})
