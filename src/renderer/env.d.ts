/// <reference types="vite/client" />

export {}

declare global {
  interface Window {
    troven: {
      getAppVersion: () => Promise<string>
      getDataDirectory: () => Promise<string>
      getSettings: () => Promise<TrovenSettings>
      updateSettings: (patch: Partial<TrovenSettings>) => Promise<TrovenSettings>
      getProjects: () => Promise<Project[]>
      saveProjects: (projects: Project[]) => Promise<Project[]>
      saveProject: (project: Project) => Promise<Project>
      archiveProject: (projectId: string) => Promise<Project[]>
      restoreProject: (projectId: string) => Promise<Project[]>
      getQuickAccessDefaults: () => Promise<QuickAccessLink[]>
      getDiary: () => Promise<DiaryEntries>
      saveDiaryEntry: (date: string, html: string) => Promise<DiaryEntry>
      openPdfDialog: () => Promise<string | null>
      savePdfDialog: () => Promise<string | null>
      getPdfPageCount: (pdfPath: string) => Promise<number>
      extractPdfPages: (
        sourcePath: string,
        outputPath: string,
        startPage: number,
        endPage: number,
      ) => Promise<string>
      mergePdfFiles: (sourcePaths: string[], outputPath: string) => Promise<string>
      onOpenDiary: (callback: () => void) => () => void
      onOpenPdfTool: (callback: (tool: PdfToolKind) => void) => () => void
      onManageProjects: (callback: () => void) => () => void
      onOpenSettings: (callback: (kind: SettingsModalKind) => void) => () => void
      getNewEntryIcons: () => Promise<Partial<Record<NewEntryType, string | null>>>
      openFolderDialog: () => Promise<string | null>
      showErrorDialog: (title: string, message: string) => Promise<void>
      readDirectory: (directoryPath: string) => Promise<FileEntry[]>
      searchDirectory: (rootPath: string, options: SearchOptions) => Promise<SearchResponse>
      getParentPath: (targetPath: string) => Promise<string>
      renameEntry: (targetPath: string, nextName: string) => Promise<string>
      createEntry: (directoryPath: string, type: NewEntryType, name: string) => Promise<string>
      pasteEntries: (
        destinationDirectory: string,
        operation: ClipboardOperation,
        sourcePaths: string[],
      ) => Promise<string[]>
      duplicateFile: (sourcePath: string) => Promise<string>
      openPath: (targetPath: string) => Promise<boolean>
      openInExplorer: (targetPath: string) => Promise<boolean>
      openInCmd: (targetPath: string) => Promise<boolean>
      openWithProgram: (programPath: string, targetPath: string) => Promise<boolean>
      writeClipboardText: (value: string) => Promise<boolean>
      setCurrentTheme: (theme: 'light' | 'dark' | 'slate') => void
      onThemeChange: (callback: (theme: 'light' | 'dark' | 'slate') => void) => () => void
    }
  }

  type FileEntry = {
    name: string
    path: string
    type: 'folder' | 'file'
    extension: string
    iconDataUrl: string | null
    size: number | null
    modifiedAt: number
  }

  type NewEntryType = 'folder' | 'text' | 'excel' | 'word'

  type ClipboardOperation = 'copy' | 'cut'

  type SettingsModalKind = 'textEditor' | 'openWith' | 'columns'

  type PdfToolKind = 'extract' | 'merge'

  type TrovenSettings = {
    defaultTextEditor: string
    openWith: Record<string, string | string[]>
    quickAccessGroups: QuickAccessGroup[]
    fileListColumns: Record<'name' | 'type' | 'modifiedAt' | 'size', number>
  }

  type QuickAccessLink = {
    id: string
    name: string
    path: string
  }

  type QuickAccessGroup = {
    id: string
    name: string
    links: QuickAccessLink[]
  }

  type SearchOptions = {
    query: string
    target: 'files' | 'folders' | 'both'
    includeSubdirectories: boolean
    outputMode: 'name' | 'path'
    pythonRaw: boolean
    extensions: string[]
    matchMode: 'contains' | 'startsWith' | 'endsWith' | 'exact'
    caseSensitive: boolean
  }

  type SearchResult = {
    name: string
    path: string
    type: 'folder' | 'file'
    extension: string
  }

  type SearchResponse = {
    isLimited: boolean
    maxResults: number
    results: SearchResult[]
  }

  type ExtensionFilter =
    | { mode: 'all' }
    | { mode: 'show'; extension: string }
    | { mode: 'hide'; extension: string }
    | { mode: 'include'; extensions: string[] }

  type SavedTab = {
    id: string
    currentPath: string
    history: string[]
    customName: string
    isNameLocked: boolean
    extensionFilter: ExtensionFilter
    isExtensionFilterLocked: boolean
  }

  type Project = {
    id: string
    name: string
    customer: string
    projectNumber: string
    status: 'active' | 'archived'
    activeTabId: string
    tabs: SavedTab[]
    createdAt: number
    updatedAt: number
    archivedAt?: number
  }

  type DiaryEntry = {
    html: string
    updatedAt: number
  }

  type DiaryEntries = Record<string, DiaryEntry>
}
