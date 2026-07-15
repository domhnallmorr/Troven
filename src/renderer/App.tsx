import {
  Archive,
  ArrowUp,
  Bold,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  Code2,
  ClipboardCopy,
  ClipboardPaste,
  CopyPlus,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  FilePlus,
  Filter,
  Folder,
  FolderPlus,
  FolderOpen,
  Image,
  Italic,
  Link2,
  List,
  ListOrdered,
  Lock,
  Monitor,
  Plus,
  RefreshCw,
  Scissors,
  Search,
  Terminal,
  Trash2,
  Type,
  Underline,
  X,
} from 'lucide-react'
import type { DragEvent, FormEvent, MouseEvent, ReactNode, SetStateAction } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  applyExtensionFilter,
  clampMenuPosition,
  type ExtensionFilter,
  formatSize,
  getBreadcrumbs,
  getDefaultTabName,
  getOpenWithProgramList,
  getProgramLabel,
  truncateText,
} from './explorerUtils'

type ThemeId = 'light' | 'dark' | 'slate'
type SortKey = 'name' | 'type' | 'modifiedAt' | 'size'
type SortDirection = 'asc' | 'desc'
type ClipboardState = {
  operation: ClipboardOperation
  entries: FileEntry[]
} | null

type ExplorerState = {
  currentPath: string
  history: string[]
  entries: FileEntry[]
  isLoading: boolean
  error: string
}

type TabState = {
  id: string
  explorer: ExplorerState
  customName: string
  isNameLocked: boolean
  selectedEntryPaths: string[]
  lastSelectedEntryPath: string | null
  extensionFilter: ExtensionFilter
  isExtensionFilterLocked: boolean
}

const initialExplorerState: ExplorerState = {
  currentPath: '',
  history: [],
  entries: [],
  isLoading: false,
  error: '',
}

function createTabState(patch: Partial<TabState> = {}): TabState {
  return {
    id: crypto.randomUUID(),
    explorer: { ...initialExplorerState },
    customName: '',
    isNameLocked: false,
    selectedEntryPaths: [],
    lastSelectedEntryPath: null,
    extensionFilter: { mode: 'all' },
    isExtensionFilterLocked: false,
    ...patch,
  }
}

function applyStateAction<T>(current: T, action: SetStateAction<T>) {
  return typeof action === 'function' ? (action as (currentValue: T) => T)(current) : action
}

const defaultSettings: TrovenSettings = {
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

function getInitialTheme(): ThemeId {
  const savedTheme = localStorage.getItem('troven-theme')

  if (savedTheme === 'light' || savedTheme === 'dark' || savedTheme === 'slate') {
    return savedTheme
  }

  return 'light'
}

function getLocalDateKey(date: Date) {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDaysToDateKey(dateKey: string, dayOffset: number) {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + dayOffset)
  return getLocalDateKey(date)
}

function formatDiaryDate(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
  }).format(new Date(year, month - 1, day))
}

export function App() {
  const [version, setVersion] = useState<string>('')
  const [theme, setTheme] = useState<ThemeId>(getInitialTheme)
  const [tabs, setTabs] = useState<TabState[]>(() => [createTabState()])
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id)
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [draggedProjectId, setDraggedProjectId] = useState<string | null>(null)
  const [quickAccessDefaults, setQuickAccessDefaults] = useState<QuickAccessLink[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false)
  const [isProjectsManagerOpen, setIsProjectsManagerOpen] = useState(false)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [isQuickAccessGroupModalOpen, setIsQuickAccessGroupModalOpen] = useState(false)
  const [isQuickAccessLinkModalOpen, setIsQuickAccessLinkModalOpen] = useState(false)
  const [quickAccessLinkGroupId, setQuickAccessLinkGroupId] = useState<string | null>(null)
  const [collapsedQuickAccessGroupIds, setCollapsedQuickAccessGroupIds] = useState<string[]>([])
  const [draggedQuickAccessLink, setDraggedQuickAccessLink] = useState<{
    groupId: string
    linkId: string
  } | null>(null)
  const [draftQuickAccessGroupName, setDraftQuickAccessGroupName] = useState('')
  const [draftQuickAccessLinkName, setDraftQuickAccessLinkName] = useState('')
  const [draftQuickAccessLinkPath, setDraftQuickAccessLinkPath] = useState('')
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntries>({})
  const [isDiaryOpen, setIsDiaryOpen] = useState(false)
  const [diaryDate, setDiaryDate] = useState(() => getLocalDateKey(new Date()))
  const [diaryHtml, setDiaryHtml] = useState('')
  const [isDiaryDirty, setIsDiaryDirty] = useState(false)
  const [isDiarySaving, setIsDiarySaving] = useState(false)
  const [pdfToolModal, setPdfToolModal] = useState<PdfToolKind | null>(null)
  const [extractPdfPath, setExtractPdfPath] = useState('')
  const [extractPdfPageCount, setExtractPdfPageCount] = useState(0)
  const [extractStartPage, setExtractStartPage] = useState(1)
  const [extractEndPage, setExtractEndPage] = useState(1)
  const [mergePdfText, setMergePdfText] = useState('')
  const [pdfToolError, setPdfToolError] = useState('')
  const [isPdfToolWorking, setIsPdfToolWorking] = useState(false)
  const [draftProjectName, setDraftProjectName] = useState('')
  const [draftCustomer, setDraftCustomer] = useState('')
  const [draftProjectNumber, setDraftProjectNumber] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
  const [isEditingPath, setIsEditingPath] = useState(false)
  const [pathInput, setPathInput] = useState('')
  const [tabContextMenu, setTabContextMenu] = useState<{
    x: number
    y: number
    tabId: string
  } | null>(null)
  const [entryContextMenu, setEntryContextMenu] = useState<{
    x: number
    y: number
    entry: FileEntry | null
  } | null>(null)
  const [clipboardState, setClipboardState] = useState<ClipboardState>(null)
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false)
  const [draftTabName, setDraftTabName] = useState('')
  const [draftIsLocked, setDraftIsLocked] = useState(false)
  const [renamingEntry, setRenamingEntry] = useState<FileEntry | null>(null)
  const [draftEntryName, setDraftEntryName] = useState('')
  const [isTabFilterModalOpen, setIsTabFilterModalOpen] = useState(false)
  const [draftVisibleExtensions, setDraftVisibleExtensions] = useState<string[]>([])
  const [draftIsExtensionFilterLocked, setDraftIsExtensionFilterLocked] = useState(false)
  const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false)
  const [filterMenuPosition, setFilterMenuPosition] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [isNewMenuOpen, setIsNewMenuOpen] = useState(false)
  const [newMenuPosition, setNewMenuPosition] = useState<{ x: number; y: number } | null>(null)
  const [isOpenWithMenuOpen, setIsOpenWithMenuOpen] = useState(false)
  const [openWithMenuPosition, setOpenWithMenuPosition] = useState<{ x: number; y: number } | null>(
    null,
  )
  const [newEntryType, setNewEntryType] = useState<NewEntryType | null>(null)
  const [draftNewEntryName, setDraftNewEntryName] = useState('')
  const [newEntryIcons, setNewEntryIcons] = useState<Partial<Record<NewEntryType, string | null>>>(
    {},
  )
  const [settings, setSettings] = useState<TrovenSettings>(defaultSettings)
  const [settingsModal, setSettingsModal] = useState<SettingsModalKind | null>(null)
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)
  const [searchOptions, setSearchOptions] = useState<SearchOptions>({
    query: '',
    target: 'both',
    includeSubdirectories: false,
    outputMode: 'path',
    pythonRaw: false,
    extensions: [],
    matchMode: 'contains',
    caseSensitive: false,
  })
  const [draftSearchExtensions, setDraftSearchExtensions] = useState('')
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null)
  const [searchOutput, setSearchOutput] = useState('')
  const [searchError, setSearchError] = useState('')
  const [isSearching, setIsSearching] = useState(false)
  const [draftTextEditor, setDraftTextEditor] = useState('')
  const [draftOpenWithRows, setDraftOpenWithRows] = useState<Array<{ extension: string; program: string }>>(
    [],
  )
  const [draftColumnWidths, setDraftColumnWidths] = useState<TrovenSettings['fileListColumns']>(
    defaultSettings.fileListColumns,
  )
  const tabMenuRef = useRef<HTMLDivElement | null>(null)
  const entryMenuRef = useRef<HTMLDivElement | null>(null)
  const filterMenuRef = useRef<HTMLDivElement | null>(null)
  const newMenuRef = useRef<HTMLDivElement | null>(null)
  const openWithMenuRef = useRef<HTMLDivElement | null>(null)
  const diaryEditorRef = useRef<HTMLDivElement | null>(null)
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]
  const explorer = activeTab.explorer
  const customTabName = activeTab.customName
  const isTabNameLocked = activeTab.isNameLocked
  const selectedEntryPaths = activeTab.selectedEntryPaths
  const lastSelectedEntryPath = activeTab.lastSelectedEntryPath
  const extensionFilter = activeTab.extensionFilter
  const isExtensionFilterLocked = activeTab.isExtensionFilterLocked
  const activeProjects = projects.filter((project) => project.status === 'active')
  const archivedProjects = projects.filter((project) => project.status === 'archived')
  const activeProject = activeProjectId
    ? projects.find((project) => project.id === activeProjectId) ?? null
    : null

  function updateTab(tabId: string, updater: (tab: TabState) => TabState) {
    setTabs((currentTabs) => currentTabs.map((tab) => (tab.id === tabId ? updater(tab) : tab)))
  }

  function updateActiveTab(updater: (tab: TabState) => TabState) {
    updateTab(activeTabId, updater)
  }

  function setExplorer(action: SetStateAction<ExplorerState>) {
    updateActiveTab((tab) => ({
      ...tab,
      explorer: applyStateAction(tab.explorer, action),
    }))
  }

  function setSelectedEntryPaths(action: SetStateAction<string[]>) {
    updateActiveTab((tab) => ({
      ...tab,
      selectedEntryPaths: applyStateAction(tab.selectedEntryPaths, action),
    }))
  }

  function setLastSelectedEntryPath(action: SetStateAction<string | null>) {
    updateActiveTab((tab) => ({
      ...tab,
      lastSelectedEntryPath: applyStateAction(tab.lastSelectedEntryPath, action),
    }))
  }

  function setExtensionFilter(action: SetStateAction<ExtensionFilter>) {
    updateActiveTab((tab) => ({
      ...tab,
      extensionFilter: applyStateAction(tab.extensionFilter, action),
    }))
  }

  function setIsExtensionFilterLocked(action: SetStateAction<boolean>) {
    updateActiveTab((tab) => ({
      ...tab,
      isExtensionFilterLocked: applyStateAction(tab.isExtensionFilterLocked, action),
    }))
  }

  function setActiveTabName({ customName: nextCustomName, isNameLocked }: {
    customName: string
    isNameLocked: boolean
  }) {
    updateActiveTab((tab) => ({
      ...tab,
      customName: nextCustomName,
      isNameLocked,
    }))
  }

  useEffect(() => {
    window.troven.getAppVersion().then(setVersion).catch(() => setVersion('dev'))
  }, [])

  useEffect(() => {
    window.troven
      .getSettings()
      .then((nextSettings) => {
        setSettings(nextSettings)
        setCollapsedQuickAccessGroupIds(nextSettings.quickAccessGroups.map((group) => group.id))
      })
      .catch(() => setSettings(defaultSettings))
  }, [])

  useEffect(() => {
    window.troven.getProjects().then(setProjects).catch(() => setProjects([]))
  }, [])

  useEffect(() => {
    window.troven
      .getQuickAccessDefaults()
      .then(setQuickAccessDefaults)
      .catch(() => setQuickAccessDefaults([]))
  }, [])

  useEffect(() => {
    window.troven.getDiary().then(setDiaryEntries).catch(() => setDiaryEntries({}))
  }, [])

  useEffect(() => {
    const project = activeProjectId
      ? projects.find((candidate) => candidate.id === activeProjectId)
      : null

    if (!project || project.status !== 'active') {
      return
    }

    const timeoutId = window.setTimeout(() => {
      const nextProject: Project = {
        ...project,
        activeTabId,
        tabs: tabs.map(serializeTab),
        updatedAt: Date.now(),
      }

      window.troven
        .saveProject(nextProject)
        .then((savedProject) =>
          setProjects((currentProjects) => upsertProject(currentProjects, savedProject)),
        )
        .catch(() => undefined)
    }, 400)

    return () => window.clearTimeout(timeoutId)
  }, [activeProjectId, activeTabId, tabs])

  useEffect(
    () =>
      window.troven.onOpenSettings((kind) => {
        openSettingsModal(kind)
      }),
    [settings],
  )

  useEffect(() => window.troven.onManageProjects(() => setIsProjectsManagerOpen(true)), [])

  useEffect(() => window.troven.onOpenDiary(() => openDiary()), [diaryEntries])
  useEffect(() => window.troven.onOpenPdfTool(openPdfTool), [])

  useEffect(() => {
    if (isDiaryOpen && diaryEditorRef.current && diaryEditorRef.current.innerHTML !== diaryHtml) {
      diaryEditorRef.current.innerHTML = diaryHtml
    }
  }, [diaryDate, diaryHtml, isDiaryOpen])

  useEffect(() => {
    window.troven.getNewEntryIcons().then(setNewEntryIcons).catch(() => setNewEntryIcons({}))
  }, [])

  useLayoutEffect(() => {
    if (!tabContextMenu || !tabMenuRef.current) {
      return
    }

    const nextPosition = clampMenuPosition({
      x: tabContextMenu.x,
      y: tabContextMenu.y,
      menuWidth: tabMenuRef.current.offsetWidth,
      menuHeight: tabMenuRef.current.offsetHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })

    if (nextPosition.x !== tabContextMenu.x || nextPosition.y !== tabContextMenu.y) {
      setTabContextMenu((current) => (current ? { ...current, ...nextPosition } : current))
    }
  }, [tabContextMenu])

  useLayoutEffect(() => {
    if (!entryContextMenu || !entryMenuRef.current) {
      return
    }

    const nextPosition = clampMenuPosition({
      x: entryContextMenu.x,
      y: entryContextMenu.y,
      menuWidth: entryMenuRef.current.offsetWidth,
      menuHeight: entryMenuRef.current.offsetHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })

    if (nextPosition.x !== entryContextMenu.x || nextPosition.y !== entryContextMenu.y) {
      setEntryContextMenu((current) => (current ? { ...current, ...nextPosition } : current))
    }
  }, [entryContextMenu])

  useLayoutEffect(() => {
    if (!filterMenuPosition || !filterMenuRef.current) {
      return
    }

    const nextPosition = clampMenuPosition({
      x: filterMenuPosition.x,
      y: filterMenuPosition.y,
      menuWidth: filterMenuRef.current.offsetWidth,
      menuHeight: filterMenuRef.current.offsetHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })

    if (nextPosition.x !== filterMenuPosition.x || nextPosition.y !== filterMenuPosition.y) {
      setFilterMenuPosition(nextPosition)
    }
  }, [filterMenuPosition])

  useLayoutEffect(() => {
    if (!newMenuPosition || !newMenuRef.current) {
      return
    }

    const nextPosition = clampMenuPosition({
      x: newMenuPosition.x,
      y: newMenuPosition.y,
      menuWidth: newMenuRef.current.offsetWidth,
      menuHeight: newMenuRef.current.offsetHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })

    if (nextPosition.x !== newMenuPosition.x || nextPosition.y !== newMenuPosition.y) {
      setNewMenuPosition(nextPosition)
    }
  }, [newMenuPosition])

  useLayoutEffect(() => {
    if (!openWithMenuPosition || !openWithMenuRef.current) {
      return
    }

    const nextPosition = clampMenuPosition({
      x: openWithMenuPosition.x,
      y: openWithMenuPosition.y,
      menuWidth: openWithMenuRef.current.offsetWidth,
      menuHeight: openWithMenuRef.current.offsetHeight,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    })

    if (nextPosition.x !== openWithMenuPosition.x || nextPosition.y !== openWithMenuPosition.y) {
      setOpenWithMenuPosition(nextPosition)
    }
  }, [openWithMenuPosition])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('troven-theme', theme)
    window.troven.setCurrentTheme(theme)
  }, [theme])

  useEffect(() => window.troven.onThemeChange(setTheme), [])

  useEffect(() => {
    setPathInput(explorer.currentPath)
  }, [explorer.currentPath])

  useEffect(() => {
    function closeContextMenu() {
      setTabContextMenu(null)
      setEntryContextMenu(null)
      setIsFilterMenuOpen(false)
      setFilterMenuPosition(null)
      setIsNewMenuOpen(false)
      setNewMenuPosition(null)
      setIsOpenWithMenuOpen(false)
      setOpenWithMenuPosition(null)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setTabContextMenu(null)
        setEntryContextMenu(null)
        setIsFilterMenuOpen(false)
        setFilterMenuPosition(null)
        setIsNewMenuOpen(false)
        setNewMenuPosition(null)
        setIsOpenWithMenuOpen(false)
        setOpenWithMenuPosition(null)
        setIsRenameModalOpen(false)
        setIsTabFilterModalOpen(false)
        setIsProjectModalOpen(false)
        setEditingProjectId(null)
        setIsProjectsManagerOpen(false)
        setIsQuickAccessGroupModalOpen(false)
        setIsQuickAccessLinkModalOpen(false)
        setPdfToolModal(null)
        setIsSearchModalOpen(false)
        setRenamingEntry(null)
        setNewEntryType(null)
      }
    }

    window.addEventListener('click', closeContextMenu)
    window.addEventListener('keydown', closeOnEscape)

    return () => {
      window.removeEventListener('click', closeContextMenu)
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [])

  const filteredEntries = useMemo(
    () => applyExtensionFilter(explorer.entries, extensionFilter),
    [explorer.entries, extensionFilter],
  )

  const sortedEntries = useMemo(() => {
    const direction = sortDirection === 'asc' ? 1 : -1

    return [...filteredEntries].sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'folder' ? -1 : 1
      }

      if (sortKey === 'modifiedAt' || sortKey === 'size') {
        const firstValue = a[sortKey] ?? -1
        const secondValue = b[sortKey] ?? -1
        return (firstValue - secondValue) * direction
      }

      const firstValue = sortKey === 'type' ? getKindLabel(a) : a.name
      const secondValue = sortKey === 'type' ? getKindLabel(b) : b.name
      return firstValue.localeCompare(secondValue, undefined, { sensitivity: 'base' }) * direction
    })
  }, [filteredEntries, sortDirection, sortKey])
  const selectedEntries = useMemo(
    () => explorer.entries.filter((entry) => selectedEntryPaths.includes(entry.path)),
    [explorer.entries, selectedEntryPaths],
  )
  const selectedSize = selectedEntries.reduce((total, entry) => total + (entry.size ?? 0), 0)
  const totalColumnWidth = Object.values(settings.fileListColumns).reduce(
    (total, width) => total + width,
    0,
  )
  const isModalOpen =
    isRenameModalOpen ||
    Boolean(renamingEntry) ||
    isTabFilterModalOpen ||
    isProjectModalOpen ||
    isProjectsManagerOpen ||
    isQuickAccessGroupModalOpen ||
    isQuickAccessLinkModalOpen ||
    isDiaryOpen ||
    Boolean(pdfToolModal) ||
    isSearchModalOpen ||
    Boolean(settingsModal) ||
    Boolean(newEntryType)

  useEffect(() => {
    function handleFileListShortcut(event: globalThis.KeyboardEvent) {
      if (
        event.defaultPrevented ||
        isModalOpen ||
        isEditingPath ||
        !explorer.currentPath ||
        !isControlShortcut(event) ||
        isEditableShortcutTarget(event.target)
      ) {
        return
      }

      const shortcutKey = event.key.toLowerCase()

      if (shortcutKey === 'a') {
        event.preventDefault()
        const nextSelection = sortedEntries.map((entry) => entry.path)
        setSelectedEntryPaths(nextSelection)
        setLastSelectedEntryPath(nextSelection.at(-1) ?? null)
        return
      }

      if (shortcutKey === 'x' || shortcutKey === 'c') {
        if (selectedEntries.length === 0) {
          return
        }

        event.preventDefault()
        setClipboardState({
          operation: shortcutKey === 'x' ? 'cut' : 'copy',
          entries: selectedEntries,
        })
        setEntryContextMenu(null)
        return
      }

      if (shortcutKey === 'v') {
        if (!clipboardState) {
          return
        }

        event.preventDefault()
        void pasteClipboard()
      }
    }

    window.addEventListener('keydown', handleFileListShortcut)

    return () => window.removeEventListener('keydown', handleFileListShortcut)
  }, [
    clipboardState,
    explorer.currentPath,
    isEditingPath,
    isModalOpen,
    selectedEntries,
    sortedEntries,
  ])

  function openSettingsModal(kind: SettingsModalKind) {
    setSettingsModal(kind)
    setDraftTextEditor(settings.defaultTextEditor)
    setDraftOpenWithRows(
      Object.entries(settings.openWith).flatMap(([extension, programs]) =>
        getOpenWithProgramList(programs).map((program) => ({ extension, program })),
      ),
    )
    setDraftColumnWidths(settings.fileListColumns)
  }

  async function saveTextEditorSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextSettings = await window.troven.updateSettings({
      defaultTextEditor: draftTextEditor.trim(),
    })
    setSettings(nextSettings)
    setSettingsModal(null)
  }

  async function saveOpenWithSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const openWith = draftOpenWithRows.reduce<Record<string, string[]>>((result, row) => {
      const extension = normalizeExtension(row.extension)
      const program = row.program.trim()

      if (extension && program) {
        result[extension] = [...(result[extension] ?? []), program]
      }

      return result
    }, {})
    const nextSettings = await window.troven.updateSettings({ openWith })
    setSettings(nextSettings)
    setSettingsModal(null)
  }

  async function saveColumnSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextSettings = await window.troven.updateSettings({
      fileListColumns: draftColumnWidths,
    })
    setSettings(nextSettings)
    setSettingsModal(null)
  }

  function startColumnResize(column: SortKey, event: MouseEvent<HTMLSpanElement>) {
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startWidth = settings.fileListColumns[column]

    function resize(moveEvent: globalThis.MouseEvent) {
      const nextWidth = Math.max(70, startWidth + moveEvent.clientX - startX)
      setSettings((current) => ({
        ...current,
        fileListColumns: {
          ...current.fileListColumns,
          [column]: nextWidth,
        },
      }))
    }

    async function stopResize(upEvent: globalThis.MouseEvent) {
      const nextWidth = Math.max(70, startWidth + upEvent.clientX - startX)
      document.removeEventListener('mousemove', resize)
      document.removeEventListener('mouseup', stopResize)
      const nextColumns = { ...settings.fileListColumns, [column]: nextWidth }
      const nextSettings = await window.troven.updateSettings({ fileListColumns: nextColumns })
      setSettings(nextSettings)
    }

    document.addEventListener('mousemove', resize)
    document.addEventListener('mouseup', stopResize)
  }

  async function loadDirectory(
    directoryPath: string,
    options: { pushHistory?: boolean; showErrorDialog?: boolean; replaceHistory?: string[] } = {},
  ) {
    if (!directoryPath) {
      return
    }

    setExplorer((current) => ({
      ...current,
      isLoading: true,
      error: '',
    }))

    try {
      const entries = await window.troven.readDirectory(directoryPath)
      setExplorer((current) => ({
        ...current,
        currentPath: directoryPath,
        entries,
        history:
          options.replaceHistory ??
          (options.pushHistory && current.currentPath
            ? [...current.history, current.currentPath]
            : current.history),
        isLoading: false,
        error: '',
      }))
      setSelectedEntryPaths([])
      setLastSelectedEntryPath(null)
      if (!isExtensionFilterLocked) {
        setExtensionFilter({ mode: 'all' })
      }
      setIsEditingPath(false)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to read this folder.'
      setExplorer((current) => ({
        ...current,
        isLoading: false,
        error: message,
      }))

      if (options.showErrorDialog) {
        await window.troven.showErrorDialog(
          'Folder not found',
          `Troven could not open this path:\n\n${directoryPath}\n\n${message}`,
        )
      }
    }
  }

  async function chooseFolder() {
    const selectedPath = await window.troven.openFolderDialog()

    if (selectedPath) {
      await loadDirectory(selectedPath)
    }
  }

  async function openQuickAccessPath(targetPath: string) {
    await loadDirectory(targetPath, { pushHistory: Boolean(explorer.currentPath) })
  }

  function openQuickAccessGroupModal() {
    setDraftQuickAccessGroupName('')
    setIsQuickAccessGroupModalOpen(true)
  }

  async function saveQuickAccessGroups(groups: QuickAccessGroup[]) {
    const nextSettings = await window.troven.updateSettings({ quickAccessGroups: groups })
    setSettings(nextSettings)
  }

  async function createQuickAccessGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = draftQuickAccessGroupName.trim()

    if (!name) {
      return
    }

    const groupId = crypto.randomUUID()
    await saveQuickAccessGroups([...settings.quickAccessGroups, { id: groupId, name, links: [] }])
    setCollapsedQuickAccessGroupIds((current) => [...current, groupId])
    setIsQuickAccessGroupModalOpen(false)
  }

  async function removeQuickAccessGroup(groupId: string) {
    await saveQuickAccessGroups(settings.quickAccessGroups.filter((group) => group.id !== groupId))
    setCollapsedQuickAccessGroupIds((current) => current.filter((id) => id !== groupId))
  }

  function toggleQuickAccessGroup(groupId: string) {
    setCollapsedQuickAccessGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId],
    )
  }

  function openQuickAccessLinkModal(groupId: string) {
    setQuickAccessLinkGroupId(groupId)
    setDraftQuickAccessLinkName('')
    setDraftQuickAccessLinkPath('')
    setIsQuickAccessLinkModalOpen(true)
  }

  async function browseQuickAccessLinkPath() {
    const selectedPath = await window.troven.openFolderDialog()

    if (selectedPath) {
      setDraftQuickAccessLinkPath(selectedPath)
      setDraftQuickAccessLinkName((current) => current || getDefaultTabName(selectedPath))
    }
  }

  async function createQuickAccessLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!quickAccessLinkGroupId) {
      return
    }

    const path = draftQuickAccessLinkPath.trim()
    const name = draftQuickAccessLinkName.trim() || getDefaultTabName(path)

    if (!path || !name) {
      return
    }

    await saveQuickAccessGroups(
      settings.quickAccessGroups.map((group) =>
        group.id === quickAccessLinkGroupId
          ? { ...group, links: [...group.links, { id: crypto.randomUUID(), name, path }] }
          : group,
      ),
    )
    setIsQuickAccessLinkModalOpen(false)
    setQuickAccessLinkGroupId(null)
  }

  async function removeQuickAccessLink(groupId: string, linkId: string) {
    await saveQuickAccessGroups(
      settings.quickAccessGroups.map((group) =>
        group.id === groupId
          ? { ...group, links: group.links.filter((link) => link.id !== linkId) }
          : group,
      ),
    )
  }

  function startQuickAccessLinkDrag(
    event: DragEvent<HTMLDivElement>,
    groupId: string,
    linkId: string,
  ) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', linkId)
    setDraggedQuickAccessLink({ groupId, linkId })
  }

  function dragQuickAccessLinkOver(
    event: DragEvent<HTMLDivElement>,
    targetGroupId: string,
    targetLinkId: string,
  ) {
    event.preventDefault()
    const sourceLinkId = draggedQuickAccessLink?.linkId ?? event.dataTransfer.getData('text/plain')
    const sourceGroupId = draggedQuickAccessLink?.groupId

    if (!sourceLinkId || !sourceGroupId || sourceGroupId !== targetGroupId || sourceLinkId === targetLinkId) {
      return
    }

    setSettings((currentSettings) => ({
      ...currentSettings,
      quickAccessGroups: currentSettings.quickAccessGroups.map((group) => {
        if (group.id !== targetGroupId) {
          return group
        }

        const sourceIndex = group.links.findIndex((link) => link.id === sourceLinkId)
        const targetIndex = group.links.findIndex((link) => link.id === targetLinkId)

        if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
          return group
        }

        const nextLinks = [...group.links]
        const [movedLink] = nextLinks.splice(sourceIndex, 1)
        nextLinks.splice(targetIndex, 0, movedLink)
        return { ...group, links: nextLinks }
      }),
    }))
  }

  function finishQuickAccessLinkDrag() {
    setSettings((currentSettings) => {
      void window.troven
        .updateSettings({ quickAccessGroups: currentSettings.quickAccessGroups })
        .then(setSettings)
        .catch(() => undefined)
      return currentSettings
    })
    setDraggedQuickAccessLink(null)
  }

  function openDiary(date = getLocalDateKey(new Date())) {
    const entry = diaryEntries[date]

    setDiaryDate(date)
    setDiaryHtml(entry?.html ?? '')
    setIsDiaryDirty(false)
    setIsDiaryOpen(true)
  }

  function getCurrentDiaryHtml() {
    return diaryEditorRef.current?.innerHTML ?? diaryHtml
  }

  async function saveDiaryEntry(date = diaryDate, html = getCurrentDiaryHtml()) {
    setIsDiarySaving(true)

    try {
      const savedEntry = await window.troven.saveDiaryEntry(date, html)
      setDiaryEntries((currentEntries) => ({
        ...currentEntries,
        [date]: savedEntry,
      }))
      setDiaryHtml(html)
      setIsDiaryDirty(false)
    } finally {
      setIsDiarySaving(false)
    }
  }

  async function closeDiary() {
    if (isDiaryDirty) {
      await saveDiaryEntry()
    }

    setIsDiaryOpen(false)
  }

  async function changeDiaryDate(dayOffset: number) {
    const nextDate = addDaysToDateKey(diaryDate, dayOffset)
    if (isDiaryDirty) {
      await saveDiaryEntry()
    }
    openDiary(nextDate)
  }

  async function changeDiaryToDate(nextDate: string) {
    if (!nextDate) {
      return
    }

    if (isDiaryDirty) {
      await saveDiaryEntry()
    }
    openDiary(nextDate)
  }

  function markDiaryDirty() {
    setIsDiaryDirty(true)
  }

  function applyDiaryCommand(command: string, value?: string) {
    diaryEditorRef.current?.focus()
    document.execCommand(command, false, value)
    markDiaryDirty()
  }

  function openPdfTool(tool: PdfToolKind) {
    setPdfToolModal(tool)
    setPdfToolError('')
    setIsPdfToolWorking(false)
  }

  async function browseExtractPdf() {
    const selectedPath = await window.troven.openPdfDialog()

    if (!selectedPath) {
      return
    }

    try {
      setPdfToolError('')
      const pageCount = await window.troven.getPdfPageCount(selectedPath)
      setExtractPdfPath(selectedPath)
      setExtractPdfPageCount(pageCount)
      setExtractStartPage(1)
      setExtractEndPage(pageCount)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to read this PDF.'
      setPdfToolError(message)
    }
  }

  async function extractPdfRange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!extractPdfPath || extractPdfPageCount === 0) {
      return
    }

    const outputPath = await window.troven.savePdfDialog()

    if (!outputPath) {
      return
    }

    setIsPdfToolWorking(true)
    setPdfToolError('')

    try {
      await window.troven.extractPdfPages(
        extractPdfPath,
        outputPath,
        extractStartPage,
        extractEndPage,
      )
      setPdfToolModal(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to extract PDF pages.'
      setPdfToolError(message)
    } finally {
      setIsPdfToolWorking(false)
    }
  }

  async function mergePdfs(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const sourcePaths = parsePdfPathList(mergePdfText)

    if (sourcePaths.length === 0) {
      setPdfToolError('Paste at least one PDF path to merge.')
      return
    }

    const outputPath = await window.troven.savePdfDialog()

    if (!outputPath) {
      return
    }

    setIsPdfToolWorking(true)
    setPdfToolError('')

    try {
      await window.troven.mergePdfFiles(sourcePaths, outputPath)
      setPdfToolModal(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to merge PDFs.'
      setPdfToolError(message)
    } finally {
      setIsPdfToolWorking(false)
    }
  }

  async function goBack() {
    const previousPath = explorer.history.at(-1)

    if (!previousPath) {
      return
    }

    setExplorer((current) => ({
      ...current,
      history: current.history.slice(0, -1),
    }))
    await loadDirectory(previousPath, { replaceHistory: explorer.history.slice(0, -1) })
  }

  async function goUp() {
    if (!explorer.currentPath) {
      return
    }

    const parentPath = await window.troven.getParentPath(explorer.currentPath)

    if (parentPath !== explorer.currentPath) {
      await loadDirectory(parentPath, { pushHistory: true })
    }
  }

  async function refreshDirectory() {
    await loadDirectory(explorer.currentPath)
  }

  function openSearchModal() {
    setSearchError('')
    setSearchResponse(null)
    setSearchOutput('')
    setDraftSearchExtensions(searchOptions.extensions.map((extension) => `.${extension}`).join(', '))
    setIsSearchModalOpen(true)
  }

  async function runSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!explorer.currentPath) {
      return
    }

    const nextOptions = {
      ...searchOptions,
      extensions: parseSearchExtensions(draftSearchExtensions),
    }

    setSearchOptions(nextOptions)
    setSearchError('')
    setIsSearching(true)

    try {
      const response = await window.troven.searchDirectory(explorer.currentPath, nextOptions)
      setSearchResponse(response)
      setSearchOutput(formatSearchResults(response.results, nextOptions))
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to complete search.'
      setSearchError(message)
      setSearchResponse(null)
      setSearchOutput('')
    } finally {
      setIsSearching(false)
    }
  }

  async function copySearchOutput() {
    if (searchOutput) {
      await window.troven.writeClipboardText(searchOutput)
    }
  }

  function openNewProjectModal() {
    setEditingProjectId(null)
    setDraftProjectName('')
    setDraftCustomer('')
    setDraftProjectNumber('')
    setIsProjectModalOpen(true)
  }

  function openEditProjectModal(project: Project) {
    setEditingProjectId(project.id)
    setDraftProjectName(project.name)
    setDraftCustomer(project.customer)
    setDraftProjectNumber(project.projectNumber)
    setIsProjectsManagerOpen(false)
    setIsProjectModalOpen(true)
  }

  async function saveProjectMetadata(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const now = Date.now()
    const projectName = draftProjectName.trim()

    if (!projectName) {
      return
    }

    if (editingProjectId) {
      const project = projects.find((candidate) => candidate.id === editingProjectId)

      if (!project) {
        setIsProjectModalOpen(false)
        setEditingProjectId(null)
        return
      }

      const savedProject = await window.troven.saveProject({
        ...project,
        name: projectName,
        customer: draftCustomer.trim(),
        projectNumber: draftProjectNumber.trim(),
        updatedAt: now,
      })

      setProjects((currentProjects) => upsertProject(currentProjects, savedProject))
      setIsProjectModalOpen(false)
      setEditingProjectId(null)
      return
    }

    const firstTab = createTabState()
    const project: Project = {
      id: crypto.randomUUID(),
      name: projectName,
      customer: draftCustomer.trim(),
      projectNumber: draftProjectNumber.trim(),
      status: 'active',
      activeTabId: firstTab.id,
      tabs: [serializeTab(firstTab)],
      createdAt: now,
      updatedAt: now,
      archivedAt: undefined,
    }

    const savedProject = await window.troven.saveProject(project)
    setProjects((currentProjects) => upsertProject(currentProjects, savedProject))
    setTabs([firstTab])
    setActiveTabId(firstTab.id)
    setActiveProjectId(savedProject.id)
    setIsEditingPath(false)
    setClipboardState(null)
    setIsProjectModalOpen(false)
    setEditingProjectId(null)
  }

  async function loadProject(project: Project) {
    const hydratedTabs = await Promise.all(project.tabs.map(hydrateSavedTab))
    const nextTabs = hydratedTabs.length > 0 ? hydratedTabs : [createTabState()]
    const nextActiveTabId = nextTabs.some((tab) => tab.id === project.activeTabId)
      ? project.activeTabId
      : nextTabs[0].id

    setTabs(nextTabs)
    setActiveTabId(nextActiveTabId)
    setActiveProjectId(project.id)
    setIsEditingPath(false)
    setTabContextMenu(null)
    setEntryContextMenu(null)
    setIsProjectsManagerOpen(false)
  }

  async function archiveProject(project: Project, event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    const nextProjects = await window.troven.archiveProject(project.id)
    setProjects(nextProjects)

    if (activeProjectId === project.id) {
      setActiveProjectId(null)
    }
  }

  async function restoreProject(project: Project) {
    const nextProjects = await window.troven.restoreProject(project.id)
    setProjects(nextProjects)
  }

  async function openEntry(entry: FileEntry) {
    setSelectedEntryPaths([entry.path])
    setLastSelectedEntryPath(entry.path)

    if (entry.type === 'folder') {
      await loadDirectory(entry.path, { pushHistory: true })
      return
    }

    await window.troven.openPath(entry.path)
  }

  function changeSort(nextSortKey: SortKey) {
    if (nextSortKey === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }

    setSortKey(nextSortKey)
    setSortDirection('asc')
  }

  async function submitPath(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextPath = pathInput.trim()

    if (!nextPath || nextPath === explorer.currentPath) {
      setIsEditingPath(false)
      setPathInput(explorer.currentPath)
      return
    }

    await loadDirectory(nextPath, { pushHistory: true, showErrorDialog: true })
  }

  function cancelPathEdit() {
    setIsEditingPath(false)
    setPathInput(explorer.currentPath)
  }

  const breadcrumbs = useMemo(() => getBreadcrumbs(explorer.currentPath), [explorer.currentPath])
  const defaultTabName = useMemo(() => getDefaultTabName(explorer.currentPath), [explorer.currentPath])
  const contextEntry = entryContextMenu?.entry ?? null

  function openTabContextMenu(event: MouseEvent<HTMLButtonElement>, tabId: string) {
    event.preventDefault()
    setActiveTabId(tabId)
    setEntryContextMenu(null)
    setTabContextMenu({ x: event.clientX, y: event.clientY, tabId })
  }

  function selectTab(tabId: string) {
    setActiveTabId(tabId)
    setIsEditingPath(false)
    setTabContextMenu(null)
    setEntryContextMenu(null)
  }

  function startTabDrag(event: DragEvent<HTMLButtonElement>, tabId: string) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', tabId)
    setDraggedTabId(tabId)
  }

  function dragTabOver(event: DragEvent<HTMLButtonElement>, targetTabId: string) {
    event.preventDefault()
    const sourceTabId = draggedTabId ?? event.dataTransfer.getData('text/plain')

    if (!sourceTabId || sourceTabId === targetTabId) {
      return
    }

    setTabs((currentTabs) => {
      const sourceIndex = currentTabs.findIndex((tab) => tab.id === sourceTabId)
      const targetIndex = currentTabs.findIndex((tab) => tab.id === targetTabId)

      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
        return currentTabs
      }

      const nextTabs = [...currentTabs]
      const [movedTab] = nextTabs.splice(sourceIndex, 1)
      nextTabs.splice(targetIndex, 0, movedTab)
      return nextTabs
    })
  }

  function finishTabDrag() {
    setDraggedTabId(null)
  }

  function startProjectDrag(event: DragEvent<HTMLDivElement>, projectId: string) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', projectId)
    setDraggedProjectId(projectId)
  }

  function dragProjectOver(event: DragEvent<HTMLDivElement>, targetProjectId: string) {
    event.preventDefault()
    const sourceProjectId = draggedProjectId ?? event.dataTransfer.getData('text/plain')

    if (!sourceProjectId || sourceProjectId === targetProjectId) {
      return
    }

    setProjects((currentProjects) => {
      const sourceIndex = currentProjects.findIndex((project) => project.id === sourceProjectId)
      const targetIndex = currentProjects.findIndex((project) => project.id === targetProjectId)

      if (sourceIndex === -1 || targetIndex === -1 || sourceIndex === targetIndex) {
        return currentProjects
      }

      const nextProjects = [...currentProjects]
      const [movedProject] = nextProjects.splice(sourceIndex, 1)
      nextProjects.splice(targetIndex, 0, movedProject)
      return nextProjects
    })
  }

  function finishProjectDrag() {
    setProjects((currentProjects) => {
      void window.troven.saveProjects(currentProjects).catch(() => undefined)
      return currentProjects
    })
    setDraggedProjectId(null)
  }

  function openRenameModal() {
    setTabContextMenu(null)
    setDraftTabName(isTabNameLocked && customTabName ? customTabName : defaultTabName)
    setDraftIsLocked(true)
    setIsRenameModalOpen(true)
  }

  function addNewTab() {
    const nextTab = createTabState()
    setTabs((currentTabs) => [...currentTabs, nextTab])
    setActiveTabId(nextTab.id)
    setTabContextMenu(null)
    setIsEditingPath(false)
  }

  function duplicateTab() {
    const sourceTab = tabs.find((tab) => tab.id === (tabContextMenu?.tabId ?? activeTabId)) ?? activeTab
    const nextTab = createTabState({
      explorer: {
        ...sourceTab.explorer,
        history: [...sourceTab.explorer.history],
        entries: [...sourceTab.explorer.entries],
        isLoading: false,
        error: '',
      },
      customName: sourceTab.customName,
      isNameLocked: sourceTab.isNameLocked,
      selectedEntryPaths: [...sourceTab.selectedEntryPaths],
      lastSelectedEntryPath: sourceTab.lastSelectedEntryPath,
      extensionFilter: { mode: 'all' },
      isExtensionFilterLocked: false,
    })

    setTabs((currentTabs) => [...currentTabs, nextTab])
    setActiveTabId(nextTab.id)
    setTabContextMenu(null)
    setIsEditingPath(false)
  }

  function deleteTab() {
    if (tabs.length <= 1 || !tabContextMenu) {
      return
    }

    const deletedTabId = tabContextMenu.tabId
    const deletedIndex = tabs.findIndex((tab) => tab.id === deletedTabId)
    const fallbackTab = tabs[deletedIndex + 1] ?? tabs[deletedIndex - 1] ?? tabs[0]

    setTabs((currentTabs) => currentTabs.filter((tab) => tab.id !== deletedTabId))

    if (activeTabId === deletedTabId) {
      setActiveTabId(fallbackTab.id)
      setIsEditingPath(false)
    }

    setTabContextMenu(null)
    setEntryContextMenu(null)
  }

  function openTabFilterModal() {
    const extensions = getDirectoryExtensions(explorer.entries)
    setTabContextMenu(null)
    setDraftVisibleExtensions(getVisibleExtensionsForDraft(extensions, extensionFilter))
    setDraftIsExtensionFilterLocked(isExtensionFilterLocked)
    setIsTabFilterModalOpen(true)
  }

  function toggleDraftVisibleExtension(extension: string, checked: boolean) {
    setDraftVisibleExtensions((current) =>
      checked
        ? [...current, extension].sort((a, b) => a.localeCompare(b))
        : current.filter((candidate) => candidate !== extension),
    )
  }

  function saveTabFilter(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const extensions = getDirectoryExtensions(explorer.entries)

    setIsExtensionFilterLocked(draftIsExtensionFilterLocked)
    setExtensionFilter(
      draftVisibleExtensions.length === extensions.length
        ? { mode: 'all' }
        : { mode: 'include', extensions: draftVisibleExtensions },
    )
    setIsTabFilterModalOpen(false)
  }

  function openEntryContextMenu(event: MouseEvent<HTMLTableRowElement>, entry: FileEntry) {
    event.preventDefault()
    event.stopPropagation()
    const nextSelection = selectedEntryPaths.includes(entry.path) ? selectedEntryPaths : [entry.path]
    setSelectedEntryPaths(nextSelection)
    setLastSelectedEntryPath(entry.path)
    setTabContextMenu(null)
    setIsFilterMenuOpen(false)
    setFilterMenuPosition(null)
    setIsNewMenuOpen(false)
    setNewMenuPosition(null)
    setIsOpenWithMenuOpen(false)
    setOpenWithMenuPosition(null)
    setEntryContextMenu({ x: event.clientX, y: event.clientY, entry })
  }

  function openFolderContextMenu(event: MouseEvent<HTMLDivElement>) {
    if (!explorer.currentPath) {
      return
    }

    event.preventDefault()
    setSelectedEntryPaths([])
    setLastSelectedEntryPath(null)
    setTabContextMenu(null)
    setIsFilterMenuOpen(false)
    setFilterMenuPosition(null)
    setIsNewMenuOpen(false)
    setNewMenuPosition(null)
    setIsOpenWithMenuOpen(false)
    setOpenWithMenuPosition(null)
    setEntryContextMenu({ x: event.clientX, y: event.clientY, entry: null })
  }

  async function copyEntryText(value: string) {
    await window.troven.writeClipboardText(value)
    setEntryContextMenu(null)
  }

  function selectEntry(entry: FileEntry, event: MouseEvent<HTMLTableRowElement>) {
    if (event.shiftKey && lastSelectedEntryPath) {
      const startIndex = sortedEntries.findIndex((candidate) => candidate.path === lastSelectedEntryPath)
      const endIndex = sortedEntries.findIndex((candidate) => candidate.path === entry.path)

      if (startIndex !== -1 && endIndex !== -1) {
        const firstIndex = Math.min(startIndex, endIndex)
        const lastIndex = Math.max(startIndex, endIndex)
        setSelectedEntryPaths(sortedEntries.slice(firstIndex, lastIndex + 1).map((candidate) => candidate.path))
        return
      }
    }

    if (event.ctrlKey || event.metaKey) {
      setSelectedEntryPaths((current) =>
        current.includes(entry.path)
          ? current.filter((selectedPath) => selectedPath !== entry.path)
          : [...current, entry.path],
      )
      setLastSelectedEntryPath(entry.path)
      return
    }

    setSelectedEntryPaths([entry.path])
    setLastSelectedEntryPath(entry.path)
  }

  function getContextEntries(entry: FileEntry) {
    const selection = selectedEntryPaths.includes(entry.path)
      ? explorer.entries.filter((candidate) => selectedEntryPaths.includes(candidate.path))
      : [entry]

    return selection.length > 0 ? selection : [entry]
  }

  function setClipboard(operation: ClipboardOperation, entry: FileEntry) {
    setClipboardState({ operation, entries: getContextEntries(entry) })
    setEntryContextMenu(null)
  }

  async function pasteClipboard() {
    if (!clipboardState || !explorer.currentPath) {
      return
    }

    try {
      const pastedPaths = await window.troven.pasteEntries(
        explorer.currentPath,
        clipboardState.operation,
        clipboardState.entries.map((entry) => entry.path),
      )
      await loadDirectory(explorer.currentPath)
      setSelectedEntryPaths(pastedPaths)
      setLastSelectedEntryPath(pastedPaths.at(-1) ?? null)

      if (clipboardState.operation === 'cut') {
        setClipboardState(null)
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to paste selected items.'
      await window.troven.showErrorDialog('Paste failed', message)
    } finally {
      setEntryContextMenu(null)
    }
  }

  async function duplicateFile(entry: FileEntry) {
    const entries = getContextEntries(entry)

    if (entries.length !== 1 || entries[0].type !== 'file') {
      return
    }

    try {
      const duplicatePath = await window.troven.duplicateFile(entries[0].path)
      await loadDirectory(explorer.currentPath)
      setSelectedEntryPaths([duplicatePath])
      setLastSelectedEntryPath(duplicatePath)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to duplicate this file.'
      await window.troven.showErrorDialog('Duplicate failed', message)
    } finally {
      setEntryContextMenu(null)
    }
  }

  async function openInCmd(targetPath: string) {
    try {
      await window.troven.openInCmd(targetPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open Command Prompt.'
      await window.troven.showErrorDialog('Open in CMD failed', message)
    } finally {
      setEntryContextMenu(null)
    }
  }

  async function openInExplorer(targetPath: string) {
    try {
      await window.troven.openInExplorer(targetPath)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open File Explorer.'
      await window.troven.showErrorDialog('Open in Explorer failed', message)
    } finally {
      setEntryContextMenu(null)
    }
  }

  async function openInTextEditor(entry: FileEntry) {
    const editorPath = settings.defaultTextEditor.trim()

    if (!editorPath) {
      await window.troven.showErrorDialog(
        'Text editor not configured',
        'Set a default text editor under Settings > Default Text Editor.',
      )
      setEntryContextMenu(null)
      return
    }

    try {
      await window.troven.openWithProgram(editorPath, entry.path)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open this file in the text editor.'
      await window.troven.showErrorDialog('Open in Text Editor failed', message)
    } finally {
      setEntryContextMenu(null)
    }
  }

  function openOpenWithMenu(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setIsFilterMenuOpen(false)
    setFilterMenuPosition(null)
    setIsNewMenuOpen(false)
    setNewMenuPosition(null)
    setIsOpenWithMenuOpen(true)
    setOpenWithMenuPosition({ x: rect.right + 4, y: rect.top })
  }

  async function openWithConfiguredProgram(entry: FileEntry, programPath: string) {

    if (!programPath) {
      return
    }

    try {
      await window.troven.openWithProgram(programPath, entry.path)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to open this file with the configured program.'
      await window.troven.showErrorDialog('Open With failed', message)
    } finally {
      setEntryContextMenu(null)
    }
  }

  function openFilterMenu(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setIsFilterMenuOpen(true)
    setFilterMenuPosition({ x: rect.right + 4, y: rect.top })
  }

  function setFileTypeFilter(mode: 'all' | 'show' | 'hide') {
    if (!entryContextMenu?.entry) {
      return
    }

    setExtensionFilter(
      mode === 'all' ? { mode: 'all' } : { mode, extension: entryContextMenu.entry.extension },
    )
    setEntryContextMenu(null)
    setIsFilterMenuOpen(false)
    setFilterMenuPosition(null)
  }

  function openNewMenu(event: MouseEvent<HTMLButtonElement>) {
    event.stopPropagation()
    const rect = event.currentTarget.getBoundingClientRect()
    setIsNewMenuOpen(true)
    setNewMenuPosition({ x: rect.right + 4, y: rect.top })
  }

  function openNewEntryModal(type: NewEntryType) {
    setEntryContextMenu(null)
    setIsNewMenuOpen(false)
    setNewMenuPosition(null)
    setNewEntryType(type)
    setDraftNewEntryName(getDefaultNewEntryName(type))
  }

  async function saveNewEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!newEntryType || !explorer.currentPath) {
      return
    }

    try {
      const createdPath = await window.troven.createEntry(
        explorer.currentPath,
        newEntryType,
        draftNewEntryName,
      )
      await loadDirectory(explorer.currentPath)
      setSelectedEntryPaths([createdPath])
      setLastSelectedEntryPath(createdPath)
      setNewEntryType(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to create this item.'
      await window.troven.showErrorDialog('Create failed', message)
    }
  }

  function openEntryRenameModal(entry: FileEntry) {
    setEntryContextMenu(null)
    setSelectedEntryPaths([entry.path])
    setLastSelectedEntryPath(entry.path)
    setRenamingEntry(entry)
    setDraftEntryName(entry.name)
  }

  async function saveEntryName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!renamingEntry) {
      return
    }

    const nextName = draftEntryName.trim()

    if (!nextName || nextName === renamingEntry.name) {
      setRenamingEntry(null)
      return
    }

    try {
      const nextPath = await window.troven.renameEntry(renamingEntry.path, nextName)
      await loadDirectory(explorer.currentPath)
      setSelectedEntryPaths([nextPath])
      setLastSelectedEntryPath(nextPath)
      setRenamingEntry(null)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to rename this item.'
      await window.troven.showErrorDialog('Rename failed', message)
    }
  }

  function saveTabName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextName = draftTabName.trim()
    const shouldLockName = draftIsLocked && nextName.length > 0

    setActiveTabName({
      customName: shouldLockName ? nextName : '',
      isNameLocked: shouldLockName,
    })
    setIsRenameModalOpen(false)
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">T</div>
          <div>
            <h1>Troven</h1>
            <p>Project explorer</p>
          </div>
        </div>

        <button className="primary-action" onClick={openNewProjectModal} type="button">
          <Plus size={16} />
          New Project
        </button>

        <section className="sidebar-section">
          <h2>Active Projects</h2>
          {activeProjects.length === 0 ? (
            <div className="empty-state">Saved active projects will live here.</div>
          ) : (
            <div className="project-list">
              {activeProjects.map((project) => (
                <div
                  className={`project-item ${project.id === activeProjectId ? 'active' : ''} ${
                    project.id === draggedProjectId ? 'dragging' : ''
                  }`}
                  draggable
                  key={project.id}
                  onDragEnd={finishProjectDrag}
                  onDragOver={(event) => dragProjectOver(event, project.id)}
                  onDragStart={(event) => startProjectDrag(event, project.id)}
                  onDrop={finishProjectDrag}
                >
                  <button
                    className="project-load-button"
                    onClick={() => loadProject(project)}
                    title={project.name}
                    type="button"
                  >
                    <span className="project-name">{project.name}</span>
                    <span className="project-meta">
                      {[project.customer, project.projectNumber].filter(Boolean).join(' · ') ||
                        'No customer or project number'}
                    </span>
                  </button>
                  <button
                    className="icon-button project-archive-button"
                    onClick={(event) => archiveProject(project, event)}
                    title="Archive project"
                    type="button"
                  >
                    <Archive size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="sidebar-section">
          <h2>Quick Access</h2>
          <div className="quick-access-list">
            {quickAccessDefaults.map((link) => (
              <button
                className="quick-access-link"
                key={link.id}
                onClick={() => openQuickAccessPath(link.path)}
                title={link.path}
                type="button"
              >
                {getQuickAccessIcon(link.id)}
                <span>{link.name}</span>
              </button>
            ))}
          </div>

          <button className="secondary-action add-row-action" onClick={openQuickAccessGroupModal} type="button">
            <FolderPlus size={15} />
            Add Group
          </button>

          <div className="quick-access-groups">
            {settings.quickAccessGroups.map((group) => {
              const isCollapsed = collapsedQuickAccessGroupIds.includes(group.id)

              return (
                <div className="quick-access-group" key={group.id}>
                  <div className="quick-access-group-header">
                    <button
                      className="quick-access-group-toggle"
                      onClick={() => toggleQuickAccessGroup(group.id)}
                      title={isCollapsed ? 'Expand group' : 'Collapse group'}
                      type="button"
                    >
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      <span>{group.name}</span>
                    </button>
                    <div className="quick-access-group-actions">
                      <button
                        className="mini-icon-button"
                        onClick={() => openQuickAccessLinkModal(group.id)}
                        title="Add link"
                        type="button"
                      >
                        <Plus size={13} />
                      </button>
                      <button
                        className="mini-icon-button"
                        onClick={() => removeQuickAccessGroup(group.id)}
                        title="Remove group"
                        type="button"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>

                  {!isCollapsed && group.links.length === 0 ? (
                    <div className="quick-access-empty">No links yet.</div>
                  ) : null}

                  {!isCollapsed
                    ? group.links.map((link) => (
                        <div
                          className={`custom-quick-access-row ${
                            draggedQuickAccessLink?.linkId === link.id ? 'dragging' : ''
                          }`}
                          draggable
                          key={link.id}
                          onDragEnd={finishQuickAccessLinkDrag}
                          onDragOver={(event) => dragQuickAccessLinkOver(event, group.id, link.id)}
                          onDragStart={(event) => startQuickAccessLinkDrag(event, group.id, link.id)}
                          onDrop={finishQuickAccessLinkDrag}
                        >
                          <button
                            className="quick-access-link"
                            onClick={() => openQuickAccessPath(link.path)}
                            title={link.path}
                            type="button"
                          >
                            <Link2 size={15} />
                            <span>{link.name}</span>
                          </button>
                          <button
                            className="mini-icon-button"
                            onClick={() => removeQuickAccessLink(group.id, link.id)}
                            title="Remove link"
                            type="button"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ))
                    : null}
                </div>
              )
            })}
          </div>

        </section>
      </aside>

      <section className="workspace">
        <div className="tab-strip">
          {tabs.map((tab) => {
            const currentTabTitle = getTabTitle(tab)

            return (
              <button
                className={`tab ${tab.id === activeTabId ? 'active' : ''} ${
                  tab.id === draggedTabId ? 'dragging' : ''
                }`}
                draggable
                key={tab.id}
                onClick={() => selectTab(tab.id)}
                onContextMenu={(event) => openTabContextMenu(event, tab.id)}
                onDragEnd={finishTabDrag}
                onDragOver={(event) => dragTabOver(event, tab.id)}
                onDragStart={(event) => startTabDrag(event, tab.id)}
                onDrop={finishTabDrag}
                title={currentTabTitle}
                type="button"
              >
                <FolderOpen size={16} />
                <span className="tab-title">{truncateText(currentTabTitle, 20)}</span>
                {tab.isNameLocked ? <Lock className="tab-lock" size={12} /> : null}
              </button>
            )
          })}
        </div>

        <section className="explorer-panel">
          <div className="explorer-toolbar">
            <div className="nav-actions">
              <button
                className="icon-button"
                onClick={chooseFolder}
                title="Open folder"
                type="button"
              >
                <FolderOpen size={16} />
              </button>
              <button
                className="icon-button"
                disabled={explorer.history.length === 0 || explorer.isLoading}
                onClick={goBack}
                title="Back"
                type="button"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="icon-button"
                disabled={!explorer.currentPath || explorer.isLoading}
                onClick={goUp}
                title="Up"
                type="button"
              >
                <ArrowUp size={17} />
              </button>
              <button
                className="icon-button"
                disabled={!explorer.currentPath || explorer.isLoading}
                onClick={refreshDirectory}
                title="Refresh"
                type="button"
              >
                <RefreshCw size={16} />
              </button>
            </div>
            <form className="path-bar" onSubmit={submitPath}>
              {isEditingPath ? (
                <input
                  autoFocus
                  className="path-input"
                  onBlur={cancelPathEdit}
                  onChange={(event) => setPathInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      cancelPathEdit()
                    }
                  }}
                  value={pathInput}
                />
              ) : (
                <div
                  className="breadcrumb-bar"
                  onDoubleClick={() => setIsEditingPath(true)}
                  role="button"
                  tabIndex={0}
                  title="Double-click to edit path"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      setIsEditingPath(true)
                    }
                  }}
                >
                  {breadcrumbs.length > 0 ? (
                    breadcrumbs
                      .map((breadcrumb, index) => ({ breadcrumb, index }))
                      .reverse()
                      .map(({ breadcrumb, index }) => (
                        <span className="breadcrumb-part" key={`${breadcrumb.path}-${index}`}>
                          {index > 0 ? (
                            <ChevronRight className="breadcrumb-separator" size={14} />
                          ) : null}
                          <button
                            className="breadcrumb-button"
                            onClick={() => loadDirectory(breadcrumb.path, { pushHistory: true })}
                            onDoubleClick={(event) => event.stopPropagation()}
                            type="button"
                          >
                            {breadcrumb.label}
                          </button>
                        </span>
                      ))
                  ) : (
                    <button
                      className="breadcrumb-button muted"
                      onClick={() => setIsEditingPath(true)}
                      type="button"
                    >
                      No folder selected
                    </button>
                  )}
                </div>
              )}
            </form>
            <button
              className="search-pill"
              disabled={!explorer.currentPath}
              onClick={openSearchModal}
              type="button"
            >
              <Search size={16} />
              <span>Search</span>
            </button>
          </div>

          {explorer.currentPath ? (
            <div className="file-table-wrap" onContextMenu={openFolderContextMenu}>
              <table className="file-table" style={{ width: totalColumnWidth }}>
                <colgroup>
                  <col style={{ width: settings.fileListColumns.name }} />
                  <col style={{ width: settings.fileListColumns.type }} />
                  <col style={{ width: settings.fileListColumns.modifiedAt }} />
                  <col style={{ width: settings.fileListColumns.size }} />
                </colgroup>
                <thead>
                  <tr>
                    <SortableHeader
                      activeKey={sortKey}
                      direction={sortDirection}
                      label="Name"
                      sortKey="name"
                      onResizeStart={startColumnResize}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      activeKey={sortKey}
                      direction={sortDirection}
                      label="Type"
                      sortKey="type"
                      onResizeStart={startColumnResize}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      activeKey={sortKey}
                      direction={sortDirection}
                      label="Modified"
                      sortKey="modifiedAt"
                      onResizeStart={startColumnResize}
                      onSort={changeSort}
                    />
                    <SortableHeader
                      activeKey={sortKey}
                      direction={sortDirection}
                      label="Size"
                      sortKey="size"
                      onResizeStart={startColumnResize}
                      onSort={changeSort}
                    />
                  </tr>
                </thead>
                <tbody>
                  {sortedEntries.map((entry) => (
                    <tr
                      className={selectedEntryPaths.includes(entry.path) ? 'selected-row' : undefined}
                      key={entry.path}
                      onContextMenu={(event) => openEntryContextMenu(event, entry)}
                      onDoubleClick={() => openEntry(entry)}
                      onClick={(event) => selectEntry(entry, event)}
                    >
                      <td>
                        <div className="entry-name">
                          {entry.type === 'folder' ? (
                            <Folder className="entry-folder-icon" size={17} />
                          ) : entry.iconDataUrl ? (
                            <img alt="" className="entry-icon" src={entry.iconDataUrl} />
                          ) : (
                            <span className="entry-icon fallback-icon" />
                          )}
                          <span>{entry.name}</span>
                        </div>
                      </td>
                      <td>{getKindLabel(entry)}</td>
                      <td>{formatDate(entry.modifiedAt)}</td>
                      <td className="numeric-cell">{formatSize(entry.size)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {explorer.isLoading ? <div className="table-message">Loading folder...</div> : null}
              {!explorer.isLoading && explorer.error ? (
                <div className="table-message error-message">{explorer.error}</div>
              ) : null}
              {!explorer.isLoading && !explorer.error && sortedEntries.length === 0 ? (
                <div className="table-message">This folder is empty.</div>
              ) : null}
            </div>
          ) : (
            <div className="placeholder">
              <FolderOpen size={42} />
              <h3>Open a folder</h3>
              <p>Select a directory to browse files and folders in this tab.</p>
              <button className="primary-action compact-action" type="button" onClick={chooseFolder}>
                <FolderOpen size={16} />
                Choose folder
              </button>
            </div>
          )}
        </section>

        <footer className="statusbar">
          <div className="statusbar-left">
            <span>{explorer.entries.length} Items</span>
            <span>
              {selectedEntries.length} Selected ({formatSize(selectedSize)})
            </span>
          </div>
          <div className="statusbar-right">
            Clipboard {clipboardState ? clipboardState.entries.length : 0} Selected
          </div>
        </footer>
      </section>

      {tabContextMenu ? (
        <div
          className="context-menu"
          onClick={(event) => event.stopPropagation()}
          ref={tabMenuRef}
          style={{ left: tabContextMenu.x, top: tabContextMenu.y }}
        >
          <button className="context-menu-item" onClick={openRenameModal} type="button">
            <Edit3 size={15} />
            Rename
          </button>
          <div className="context-menu-separator" />
          <button
            className="context-menu-item"
            disabled={!explorer.currentPath || getDirectoryExtensions(explorer.entries).length === 0}
            onClick={openTabFilterModal}
            type="button"
          >
            <Filter size={15} />
            Filter
          </button>
          <div className="context-menu-separator" />
          <button className="context-menu-item" onClick={addNewTab} type="button">
            <Plus size={15} />
            Add New Tab
          </button>
          <button className="context-menu-item" onClick={duplicateTab} type="button">
            <CopyPlus size={15} />
            Duplicate Tab
          </button>
          <button
            className="context-menu-item"
            disabled={tabs.length <= 1}
            onClick={deleteTab}
            type="button"
          >
            <Trash2 size={15} />
            Delete Tab
          </button>
        </div>
      ) : null}

      {entryContextMenu ? (
        <div
          className="context-menu entry-context-menu"
          onClick={(event) => event.stopPropagation()}
          ref={entryMenuRef}
          style={{ left: entryContextMenu.x, top: entryContextMenu.y }}
        >
          {contextEntry?.type === 'file' ? (
            <>
              <button
                className="context-menu-item"
                onClick={() => openInTextEditor(contextEntry)}
                type="button"
              >
                <Code2 size={15} />
                Open in Text Editor
              </button>
              {getConfiguredOpenWithPrograms(contextEntry, settings).length > 0 ? (
                <button
                  className="context-menu-item submenu-item"
                  onClick={openOpenWithMenu}
                  type="button"
                >
                  <span className="menu-item-content">
                    <ExternalLink size={15} />
                    Open With
                  </span>
                  <ChevronRight size={15} />
                </button>
              ) : null}
              <div className="context-menu-separator" />
            </>
          ) : null}
          {contextEntry ? (
            <>
              <button
                className="context-menu-item icon-menu-item"
                onClick={() => openEntryRenameModal(contextEntry)}
                type="button"
              >
                <Edit3 size={15} />
                Rename
              </button>
              <div className="context-menu-separator" />
              <button
                className="context-menu-item"
                onClick={() => copyEntryText(contextEntry.path)}
                type="button"
              >
                Copy Full Path to Clipboard
              </button>
              <button
                className="context-menu-item"
                onClick={() => copyEntryText(contextEntry.name)}
                type="button"
              >
                Copy Filename to Clipboard
              </button>
            </>
          ) : null}
          {contextEntry?.type === 'file' && contextEntry.extension ? (
            <>
              <div className="context-menu-separator" />
              <button className="context-menu-item submenu-item" onClick={openFilterMenu} type="button">
                <span className="menu-item-content">
                  <Filter size={15} />
                  Filter
                </span>
                <ChevronRight size={15} />
              </button>
            </>
          ) : null}
          <div className="context-menu-separator" />
          <button className="context-menu-item submenu-item" onClick={openNewMenu} type="button">
            <span className="menu-item-content">
              <Plus size={15} />
              New
            </span>
            <ChevronRight size={15} />
          </button>
          {contextEntry ? (
            <>
              <div className="context-menu-separator" />
              <button
                className="context-menu-item"
                onClick={() => setClipboard('cut', contextEntry)}
                type="button"
              >
                <Scissors size={15} />
                Cut
              </button>
              <button
                className="context-menu-item"
                onClick={() => setClipboard('copy', contextEntry)}
                type="button"
              >
                <ClipboardCopy size={15} />
                Copy
              </button>
            </>
          ) : (
            <div className="context-menu-separator" />
          )}
          <button
            className="context-menu-item"
            disabled={!clipboardState || !explorer.currentPath}
            onClick={pasteClipboard}
            type="button"
          >
            <ClipboardPaste size={15} />
            Paste
          </button>
          {contextEntry ? (
            <>
              <div className="context-menu-separator" />
              <button
                className="context-menu-item"
                disabled={
                  getContextEntries(contextEntry).length !== 1 ||
                  getContextEntries(contextEntry)[0].type !== 'file'
                }
                onClick={() => duplicateFile(contextEntry)}
                type="button"
              >
                <CopyPlus size={15} />
                Duplicate File
              </button>
            </>
          ) : null}
          <div className="context-menu-separator" />
          <button
            className="context-menu-item"
            onClick={() => openInCmd(contextEntry?.path ?? explorer.currentPath)}
            type="button"
          >
            <Terminal size={15} />
            Open in CMD
          </button>
          <button
            className="context-menu-item"
            onClick={() => openInExplorer(contextEntry?.path ?? explorer.currentPath)}
            type="button"
          >
            <ExternalLink size={15} />
            Open in Explorer
          </button>
        </div>
      ) : null}

      {entryContextMenu &&
      contextEntry &&
      isOpenWithMenuOpen &&
      openWithMenuPosition &&
      getConfiguredOpenWithPrograms(contextEntry, settings).length > 0 ? (
        <div
          className="context-menu open-with-context-menu"
          onClick={(event) => event.stopPropagation()}
          ref={openWithMenuRef}
          style={{ left: openWithMenuPosition.x, top: openWithMenuPosition.y }}
        >
          {getConfiguredOpenWithPrograms(contextEntry, settings).map((programPath) => (
            <button
              className="context-menu-item"
              key={programPath}
              onClick={() => openWithConfiguredProgram(contextEntry, programPath)}
              type="button"
            >
              <ExternalLink size={15} />
              {getProgramLabel(programPath)}
            </button>
          ))}
        </div>
      ) : null}

      {entryContextMenu &&
      contextEntry &&
      isFilterMenuOpen &&
      filterMenuPosition &&
      contextEntry.type === 'file' &&
      contextEntry.extension ? (
        <div
          className="context-menu filter-context-menu"
          onClick={(event) => event.stopPropagation()}
          ref={filterMenuRef}
          style={{ left: filterMenuPosition.x, top: filterMenuPosition.y }}
        >
          <button className="context-menu-item" onClick={() => setFileTypeFilter('show')} type="button">
            Show Just This File Type
          </button>
          <button className="context-menu-item" onClick={() => setFileTypeFilter('hide')} type="button">
            Hide this File Type
          </button>
          <button className="context-menu-item" onClick={() => setFileTypeFilter('all')} type="button">
            Clear Filter
          </button>
        </div>
      ) : null}

      {entryContextMenu && isNewMenuOpen && newMenuPosition ? (
        <div
          className="context-menu new-context-menu"
          onClick={(event) => event.stopPropagation()}
          ref={newMenuRef}
          style={{ left: newMenuPosition.x, top: newMenuPosition.y }}
        >
          <button className="context-menu-item" onClick={() => openNewEntryModal('folder')} type="button">
            <FolderPlus size={15} />
            New Folder
          </button>
          <button className="context-menu-item" onClick={() => openNewEntryModal('text')} type="button">
            <NewEntryMenuIcon fallback={<FilePlus size={15} />} iconDataUrl={newEntryIcons.text} />
            New Text File
          </button>
          <button className="context-menu-item" onClick={() => openNewEntryModal('excel')} type="button">
            <NewEntryMenuIcon fallback={<FilePlus size={15} />} iconDataUrl={newEntryIcons.excel} />
            New Excel File
          </button>
          <button className="context-menu-item" onClick={() => openNewEntryModal('word')} type="button">
            <NewEntryMenuIcon fallback={<FilePlus size={15} />} iconDataUrl={newEntryIcons.word} />
            New Word File
          </button>
        </div>
      ) : null}

      {newEntryType ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={saveNewEntry}>
            <header className="modal-header">
              <h2>{getNewEntryModalTitle(newEntryType)}</h2>
              <p>{explorer.currentPath}</p>
            </header>

            <label className="field-label" htmlFor="new-entry-name">
              Name
            </label>
            <input
              autoFocus
              className="text-input"
              id="new-entry-name"
              onChange={(event) => setDraftNewEntryName(event.target.value)}
              value={draftNewEntryName}
            />

            <div className="modal-actions">
              <button className="primary-action compact-action" type="submit">
                <Check size={16} />
                Save
              </button>
              <button className="secondary-action" onClick={() => setNewEntryType(null)} type="button">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {renamingEntry ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={saveEntryName}>
            <header className="modal-header">
              <h2>Rename {renamingEntry.type === 'folder' ? 'Folder' : 'File'}</h2>
              <p>{renamingEntry.path}</p>
            </header>

            <label className="field-label" htmlFor="entry-name">
              Name
            </label>
            <input
              autoFocus
              className="text-input"
              id="entry-name"
              onChange={(event) => setDraftEntryName(event.target.value)}
              value={draftEntryName}
            />

            <div className="modal-actions">
              <button className="primary-action compact-action" type="submit">
                <Check size={16} />
                Save
              </button>
              <button className="secondary-action" onClick={() => setRenamingEntry(null)} type="button">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isRenameModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={saveTabName}>
            <header className="modal-header">
              <h2>Rename Tab</h2>
              <p>Set a custom tab title, or unlock it to follow the current folder name.</p>
            </header>

            <label className="field-label" htmlFor="tab-name">
              Tab name
            </label>
            <input
              autoFocus
              className="text-input"
              id="tab-name"
              onChange={(event) => setDraftTabName(event.target.value)}
              value={draftTabName}
            />

            <label className="checkbox-row">
              <input
                checked={draftIsLocked}
                onChange={(event) => setDraftIsLocked(event.target.checked)}
                type="checkbox"
              />
              <span>Lock this name</span>
            </label>

            <div className="modal-actions">
              <button className="primary-action compact-action" type="submit">
                <Check size={16} />
                Save
              </button>
              <button
                className="secondary-action"
                onClick={() => setIsRenameModalOpen(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isTabFilterModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal settings-modal" onSubmit={saveTabFilter}>
            <header className="modal-header">
              <h2>Filter Tab</h2>
              <p>Select which file extensions should be listed in this tab.</p>
            </header>

            <div className="extension-filter-list">
              {getDirectoryExtensions(explorer.entries).map((extension) => (
                <label className="checkbox-row extension-filter-row" key={extension}>
                  <input
                    checked={draftVisibleExtensions.includes(extension)}
                    onChange={(event) =>
                      toggleDraftVisibleExtension(extension, event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>{getExtensionFilterLabel(extension)}</span>
                </label>
              ))}
            </div>

            <label className="checkbox-row">
              <input
                checked={draftIsExtensionFilterLocked}
                onChange={(event) => setDraftIsExtensionFilterLocked(event.target.checked)}
                type="checkbox"
              />
              <span>Lock Filter</span>
            </label>

            <div className="modal-actions">
              <button className="primary-action compact-action" type="submit">
                <Check size={16} />
                Save
              </button>
              <button
                className="secondary-action"
                onClick={() => setIsTabFilterModalOpen(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isProjectModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal settings-modal" onSubmit={saveProjectMetadata}>
            <header className="modal-header">
              <h2>{editingProjectId ? 'Edit Project' : 'New Project'}</h2>
              <p>
                {editingProjectId
                  ? 'Update this project metadata.'
                  : 'Create an active project with a blank starting tab.'}
              </p>
            </header>

            <label className="field-label" htmlFor="project-name">
              Project name
            </label>
            <input
              autoFocus
              className="text-input"
              id="project-name"
              onChange={(event) => setDraftProjectName(event.target.value)}
              value={draftProjectName}
            />

            <label className="field-label" htmlFor="project-customer">
              Customer
            </label>
            <input
              className="text-input"
              id="project-customer"
              onChange={(event) => setDraftCustomer(event.target.value)}
              value={draftCustomer}
            />

            <label className="field-label" htmlFor="project-number">
              Project Number
            </label>
            <input
              className="text-input"
              id="project-number"
              onChange={(event) => setDraftProjectNumber(event.target.value)}
              value={draftProjectNumber}
            />

            <div className="modal-actions">
              <button
                className="primary-action compact-action"
                disabled={!draftProjectName.trim()}
                type="submit"
              >
                <Check size={16} />
                Save
              </button>
              <button
                className="secondary-action"
                onClick={() => {
                  setIsProjectModalOpen(false)
                  setEditingProjectId(null)
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isQuickAccessGroupModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal" onSubmit={createQuickAccessGroup}>
            <header className="modal-header">
              <h2>New Quick Access Group</h2>
            </header>

            <label className="field-label" htmlFor="quick-access-group-name">
              Group name
            </label>
            <input
              autoFocus
              className="text-input"
              id="quick-access-group-name"
              onChange={(event) => setDraftQuickAccessGroupName(event.target.value)}
              value={draftQuickAccessGroupName}
            />

            <div className="modal-actions">
              <button
                className="primary-action compact-action"
                disabled={!draftQuickAccessGroupName.trim()}
                type="submit"
              >
                <Check size={16} />
                Save
              </button>
              <button
                className="secondary-action"
                onClick={() => setIsQuickAccessGroupModalOpen(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isQuickAccessLinkModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal settings-modal" onSubmit={createQuickAccessLink}>
            <header className="modal-header">
              <h2>Add Quick Access Link</h2>
            </header>

            <label className="field-label" htmlFor="quick-access-link-name">
              Link name
            </label>
            <input
              autoFocus
              className="text-input"
              id="quick-access-link-name"
              onChange={(event) => setDraftQuickAccessLinkName(event.target.value)}
              value={draftQuickAccessLinkName}
            />

            <label className="field-label" htmlFor="quick-access-link-path">
              Folder path
            </label>
            <div className="path-picker-row">
              <input
                className="text-input"
                id="quick-access-link-path"
                onChange={(event) => setDraftQuickAccessLinkPath(event.target.value)}
                value={draftQuickAccessLinkPath}
              />
              <button className="secondary-action" onClick={browseQuickAccessLinkPath} type="button">
                Browse
              </button>
            </div>

            <div className="modal-actions">
              <button
                className="primary-action compact-action"
                disabled={!draftQuickAccessLinkPath.trim()}
                type="submit"
              >
                <Check size={16} />
                Save
              </button>
              <button
                className="secondary-action"
                onClick={() => setIsQuickAccessLinkModalOpen(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isDiaryOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal diary-modal">
            <header className="modal-header diary-header">
              <div>
                <h2>Diary</h2>
                <p>{formatDiaryDate(diaryDate)}</p>
              </div>
              <div className="diary-date-controls">
                <button className="secondary-action compact-secondary" onClick={() => changeDiaryDate(-1)} type="button">
                  <ChevronLeft size={15} />
                  Previous
                </button>
                <input
                  className="text-input diary-date-input"
                  onChange={(event) => changeDiaryToDate(event.target.value)}
                  type="date"
                  value={diaryDate}
                />
                <button className="secondary-action compact-secondary" onClick={() => changeDiaryDate(1)} type="button">
                  Next
                  <ChevronRight size={15} />
                </button>
              </div>
            </header>

            <div className="diary-toolbar">
              <button className="icon-button" onClick={() => applyDiaryCommand('bold')} title="Bold" type="button">
                <Bold size={15} />
              </button>
              <button className="icon-button" onClick={() => applyDiaryCommand('italic')} title="Italic" type="button">
                <Italic size={15} />
              </button>
              <button className="icon-button" onClick={() => applyDiaryCommand('underline')} title="Underline" type="button">
                <Underline size={15} />
              </button>
              <button className="icon-button" onClick={() => applyDiaryCommand('formatBlock', 'h2')} title="Heading" type="button">
                <Type size={15} />
              </button>
              <button className="icon-button" onClick={() => applyDiaryCommand('formatBlock', 'p')} title="Normal text" type="button">
                P
              </button>
              <button className="icon-button" onClick={() => applyDiaryCommand('insertUnorderedList')} title="Bullet list" type="button">
                <List size={15} />
              </button>
              <button className="icon-button" onClick={() => applyDiaryCommand('insertOrderedList')} title="Numbered list" type="button">
                <ListOrdered size={15} />
              </button>
            </div>

            <div
              className="diary-editor"
              contentEditable
              key={diaryDate}
              onInput={markDiaryDirty}
              ref={diaryEditorRef}
              role="textbox"
              suppressContentEditableWarning
            />

            <div className="modal-actions">
              <span className="diary-save-state">
                {isDiarySaving ? 'Saving...' : isDiaryDirty ? 'Unsaved changes' : 'Saved'}
              </span>
              <button
                className="primary-action compact-action"
                disabled={isDiarySaving || !isDiaryDirty}
                onClick={() => saveDiaryEntry()}
                type="button"
              >
                <Check size={16} />
                Save
              </button>
              <button className="secondary-action" onClick={closeDiary} type="button">
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {pdfToolModal === 'extract' ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal settings-modal" onSubmit={extractPdfRange}>
            <header className="modal-header">
              <h2>Extract PDF Pages</h2>
              <p>Select a PDF and choose an inclusive page range.</p>
            </header>

            <label className="field-label" htmlFor="extract-pdf-path">
              PDF file
            </label>
            <div className="path-picker-row">
              <input
                className="text-input"
                id="extract-pdf-path"
                readOnly
                value={extractPdfPath}
              />
              <button className="secondary-action" onClick={browseExtractPdf} type="button">
                Browse
              </button>
            </div>

            {extractPdfPageCount > 0 ? (
              <div className="pdf-page-range">
                <label className="column-width-row">
                  <span className="field-label">Start page</span>
                  <select
                    className="text-input"
                    onChange={(event) => {
                      const nextStartPage = Number(event.target.value)
                      setExtractStartPage(nextStartPage)
                      setExtractEndPage((current) => Math.max(current, nextStartPage))
                    }}
                    value={extractStartPage}
                  >
                    {Array.from({ length: extractPdfPageCount }, (_value, index) => index + 1).map((page) => (
                      <option key={page} value={page}>
                        {page}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="column-width-row">
                  <span className="field-label">End page</span>
                  <select
                    className="text-input"
                    onChange={(event) => setExtractEndPage(Number(event.target.value))}
                    value={extractEndPage}
                  >
                    {Array.from({ length: extractPdfPageCount }, (_value, index) => index + 1)
                      .filter((page) => page >= extractStartPage)
                      .map((page) => (
                        <option key={page} value={page}>
                          {page}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
            ) : null}

            {pdfToolError ? <div className="tool-error">{pdfToolError}</div> : null}

            <div className="modal-actions">
              <button
                className="primary-action compact-action"
                disabled={isPdfToolWorking || !extractPdfPath || extractPdfPageCount === 0}
                type="submit"
              >
                <Check size={16} />
                Extract
              </button>
              <button className="secondary-action" onClick={() => setPdfToolModal(null)} type="button">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {pdfToolModal === 'merge' ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal settings-modal wide-modal" onSubmit={mergePdfs}>
            <header className="modal-header">
              <h2>Merge PDFs</h2>
              <p>Paste one PDF path per line. Files are merged in the order shown.</p>
            </header>

            <label className="field-label" htmlFor="merge-pdf-list">
              PDF paths
            </label>
            <textarea
              className="text-input pdf-merge-list"
              id="merge-pdf-list"
              onChange={(event) => setMergePdfText(event.target.value)}
              placeholder={'C:\\\\Reports\\\\first.pdf\nC:\\\\Reports\\\\second.pdf'}
              value={mergePdfText}
            />

            {pdfToolError ? <div className="tool-error">{pdfToolError}</div> : null}

            <div className="modal-actions">
              <button
                className="primary-action compact-action"
                disabled={isPdfToolWorking || parsePdfPathList(mergePdfText).length === 0}
                type="submit"
              >
                <Check size={16} />
                Merge
              </button>
              <button className="secondary-action" onClick={() => setPdfToolModal(null)} type="button">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {isProjectsManagerOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal projects-manager-modal">
            <header className="modal-header">
              <h2>Manage Projects</h2>
              <p>Restore archived projects or manage active projects.</p>
            </header>

            <section className="project-manager-section">
              <h3>Active</h3>
              {activeProjects.length === 0 ? (
                <div className="empty-state">No active projects.</div>
              ) : (
                <div className="manager-project-list">
                  {activeProjects.map((project) => (
                    <div className="manager-project-row" key={project.id}>
                      <div className="manager-project-detail">
                        <span className="project-name">{project.name}</span>
                        <span className="project-meta">{getProjectMeta(project)}</span>
                      </div>
                      <button
                        className="secondary-action compact-secondary"
                        onClick={() => loadProject(project)}
                        type="button"
                      >
                        <FolderOpen size={15} />
                        Load
                      </button>
                      <button
                        className="secondary-action compact-secondary"
                        onClick={() => openEditProjectModal(project)}
                        type="button"
                      >
                        <Edit3 size={15} />
                        Edit
                      </button>
                      <button
                        className="secondary-action compact-secondary"
                        onClick={(event) => archiveProject(project, event)}
                        type="button"
                      >
                        <Archive size={15} />
                        Archive
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="project-manager-section">
              <h3>Archived</h3>
              {archivedProjects.length === 0 ? (
                <div className="empty-state">No archived projects.</div>
              ) : (
                <div className="manager-project-list">
                  {archivedProjects.map((project) => (
                    <div className="manager-project-row" key={project.id}>
                      <div className="manager-project-detail">
                        <span className="project-name">{project.name}</span>
                        <span className="project-meta">{getProjectMeta(project)}</span>
                      </div>
                      <button
                        className="secondary-action compact-secondary"
                        onClick={() => restoreProject(project)}
                        type="button"
                      >
                        <FolderOpen size={15} />
                        Restore
                      </button>
                      <button
                        className="secondary-action compact-secondary"
                        onClick={() => openEditProjectModal(project)}
                        type="button"
                      >
                        <Edit3 size={15} />
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <div className="modal-actions">
              <button
                className="secondary-action"
                onClick={() => setIsProjectsManagerOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isSearchModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal search-modal" onSubmit={runSearch}>
            <header className="modal-header">
              <h2>Search</h2>
              <p>{explorer.currentPath}</p>
            </header>

            <div className="search-layout">
              <section className="search-options">
                <label className="field-label" htmlFor="search-query">
                  Text to search for
                </label>
                <input
                  autoFocus
                  className="text-input"
                  id="search-query"
                  onChange={(event) =>
                    setSearchOptions((current) => ({ ...current, query: event.target.value }))
                  }
                  value={searchOptions.query}
                />

                <label className="field-label" htmlFor="search-target">
                  Search for
                </label>
                <select
                  className="text-input"
                  id="search-target"
                  onChange={(event) =>
                    setSearchOptions((current) => ({
                      ...current,
                      target: event.target.value as SearchOptions['target'],
                    }))
                  }
                  value={searchOptions.target}
                >
                  <option value="both">Files and folders</option>
                  <option value="files">Files</option>
                  <option value="folders">Folders</option>
                </select>

                <label className="field-label" htmlFor="search-match-mode">
                  Match mode
                </label>
                <select
                  className="text-input"
                  id="search-match-mode"
                  onChange={(event) =>
                    setSearchOptions((current) => ({
                      ...current,
                      matchMode: event.target.value as SearchOptions['matchMode'],
                    }))
                  }
                  value={searchOptions.matchMode}
                >
                  <option value="contains">Contains</option>
                  <option value="startsWith">Starts with</option>
                  <option value="endsWith">Ends with</option>
                  <option value="exact">Exact match</option>
                </select>

                <label className="field-label" htmlFor="search-extensions">
                  Extension types
                </label>
                <input
                  className="text-input"
                  disabled={searchOptions.target === 'folders'}
                  id="search-extensions"
                  onChange={(event) => setDraftSearchExtensions(event.target.value)}
                  placeholder=".pdf, .inp, .odb"
                  value={draftSearchExtensions}
                />

                <label className="field-label" htmlFor="search-output-mode">
                  Output
                </label>
                <select
                  className="text-input"
                  id="search-output-mode"
                  onChange={(event) =>
                    setSearchOptions((current) => ({
                      ...current,
                      outputMode: event.target.value as SearchOptions['outputMode'],
                    }))
                  }
                  value={searchOptions.outputMode}
                >
                  <option value="path">Full path</option>
                  <option value="name">Folder/filename only</option>
                </select>

                <label className="checkbox-row">
                  <input
                    checked={searchOptions.includeSubdirectories}
                    onChange={(event) =>
                      setSearchOptions((current) => ({
                        ...current,
                        includeSubdirectories: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Search subdirectories</span>
                </label>

                <label className="checkbox-row">
                  <input
                    checked={searchOptions.caseSensitive}
                    onChange={(event) =>
                      setSearchOptions((current) => ({
                        ...current,
                        caseSensitive: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Case sensitive</span>
                </label>

                <label className="checkbox-row">
                  <input
                    checked={searchOptions.pythonRaw}
                    onChange={(event) =>
                      setSearchOptions((current) => ({
                        ...current,
                        pythonRaw: event.target.checked,
                      }))
                    }
                    type="checkbox"
                  />
                  <span>Python raw string output</span>
                </label>
              </section>

              <section className="search-results-panel">
                <div className="search-results-header">
                  <span>
                    {searchResponse
                      ? `${searchResponse.results.length} results${
                          searchResponse.isLimited ? ` (limited to ${searchResponse.maxResults})` : ''
                        }`
                      : 'Results'}
                  </span>
                  <button
                    className="secondary-action compact-secondary"
                    disabled={!searchOutput}
                    onClick={copySearchOutput}
                    type="button"
                  >
                    <ClipboardCopy size={15} />
                    Copy
                  </button>
                </div>

                <textarea
                  className="search-output"
                  readOnly
                  value={searchError || searchOutput}
                />
              </section>
            </div>

            <div className="modal-actions">
              <button
                className="primary-action compact-action"
                disabled={
                  isSearching ||
                  (!searchOptions.query.trim() && parseSearchExtensions(draftSearchExtensions).length === 0)
                }
                type="submit"
              >
                <Search size={16} />
                {isSearching ? 'Searching' : 'Search'}
              </button>
              <button
                className="secondary-action"
                onClick={() => setIsSearchModalOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {settingsModal === 'textEditor' ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal settings-modal" onSubmit={saveTextEditorSettings}>
            <header className="modal-header">
              <h2>Default Text Editor</h2>
              <p>Enter the executable path for your preferred text editor.</p>
            </header>

            <label className="field-label" htmlFor="default-text-editor">
              Executable path
            </label>
            <input
              autoFocus
              className="text-input"
              id="default-text-editor"
              onChange={(event) => setDraftTextEditor(event.target.value)}
              placeholder={'C:\\Program Files\\Notepad++\\notepad++.exe'}
              value={draftTextEditor}
            />

            <div className="modal-actions">
              <button className="primary-action compact-action" type="submit">
                <Check size={16} />
                Save
              </button>
              <button className="secondary-action" onClick={() => setSettingsModal(null)} type="button">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {settingsModal === 'openWith' ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal settings-modal wide-modal" onSubmit={saveOpenWithSettings}>
            <header className="modal-header">
              <h2>Open With Options</h2>
              <p>Map file extensions to executable paths.</p>
            </header>

            <div className="settings-grid two-column-grid">
              <span className="field-label">Extension</span>
              <span className="field-label">Program path</span>
              {draftOpenWithRows.map((row, index) => (
                <div className="settings-row" key={index}>
                  <input
                    className="text-input compact-input"
                    onChange={(event) =>
                      setDraftOpenWithRows((current) =>
                        current.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? { ...candidate, extension: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                    placeholder=".pdf"
                    value={row.extension}
                  />
                  <input
                    className="text-input compact-input"
                    onChange={(event) =>
                      setDraftOpenWithRows((current) =>
                        current.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? { ...candidate, program: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                    placeholder={'C:\\Program Files\\App\\app.exe'}
                    value={row.program}
                  />
                  <button
                    className="secondary-action compact-secondary"
                    onClick={() =>
                      setDraftOpenWithRows((current) =>
                        current.filter((_, candidateIndex) => candidateIndex !== index),
                      )
                    }
                    type="button"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button
              className="secondary-action add-row-action"
              onClick={() =>
                setDraftOpenWithRows((current) => [...current, { extension: '', program: '' }])
              }
              type="button"
            >
              <Plus size={16} />
              Add extension
            </button>

            <div className="modal-actions">
              <button className="primary-action compact-action" type="submit">
                <Check size={16} />
                Save
              </button>
              <button className="secondary-action" onClick={() => setSettingsModal(null)} type="button">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {settingsModal === 'columns' ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal settings-modal" onSubmit={saveColumnSettings}>
            <header className="modal-header">
              <h2>File List Columns</h2>
              <p>Set default column widths in pixels.</p>
            </header>

            {(['name', 'type', 'modifiedAt', 'size'] as SortKey[]).map((column) => (
              <label className="column-width-row" key={column}>
                <span className="field-label">{getColumnLabel(column)}</span>
                <input
                  className="text-input number-input"
                  min={70}
                  onChange={(event) =>
                    setDraftColumnWidths((current) => ({
                      ...current,
                      [column]: Number(event.target.value) || 70,
                    }))
                  }
                  type="number"
                  value={draftColumnWidths[column]}
                />
              </label>
            ))}

            <div className="modal-actions">
              <button className="primary-action compact-action" type="submit">
                <Check size={16} />
                Save
              </button>
              <button className="secondary-action" onClick={() => setSettingsModal(null)} type="button">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  )
}

function SortableHeader({
  activeKey,
  direction,
  label,
  onResizeStart,
  sortKey,
  onSort,
}: {
  activeKey: SortKey
  direction: SortDirection
  label: string
  onResizeStart: (sortKey: SortKey, event: MouseEvent<HTMLSpanElement>) => void
  sortKey: SortKey
  onSort: (sortKey: SortKey) => void
}) {
  return (
    <th>
      <button className="sort-button" type="button" onClick={() => onSort(sortKey)}>
        {label}
        <ChevronsUpDown size={14} />
        {activeKey === sortKey ? <span className="sort-direction">{direction}</span> : null}
      </button>
      <span
        className="column-resizer"
        onMouseDown={(event) => onResizeStart(sortKey, event)}
        role="separator"
      />
    </th>
  )
}

function getKindLabel(entry: FileEntry) {
  if (entry.type === 'folder') {
    return 'Folder'
  }

  return entry.extension ? `${entry.extension.toUpperCase()} file` : 'File'
}

function getTabTitle(tab: TabState) {
  if (tab.isNameLocked && tab.customName) {
    return tab.customName
  }

  return getDefaultTabName(tab.explorer.currentPath)
}

function serializeTab(tab: TabState): SavedTab {
  return {
    id: tab.id,
    currentPath: tab.explorer.currentPath,
    history: tab.explorer.history,
    customName: tab.customName,
    isNameLocked: tab.isNameLocked,
    extensionFilter: tab.extensionFilter,
    isExtensionFilterLocked: tab.isExtensionFilterLocked,
  }
}

async function hydrateSavedTab(savedTab: SavedTab): Promise<TabState> {
  const explorer: ExplorerState = {
    ...initialExplorerState,
    currentPath: savedTab.currentPath,
    history: savedTab.history,
  }

  if (!savedTab.currentPath) {
    return createTabState({
      id: savedTab.id,
      explorer,
      customName: savedTab.customName,
      isNameLocked: savedTab.isNameLocked,
      extensionFilter: savedTab.extensionFilter,
      isExtensionFilterLocked: savedTab.isExtensionFilterLocked,
    })
  }

  try {
    const entries = await window.troven.readDirectory(savedTab.currentPath)
    explorer.entries = entries
  } catch (error) {
    explorer.error = error instanceof Error ? error.message : 'Unable to read this folder.'
  }

  return createTabState({
    id: savedTab.id,
    explorer,
    customName: savedTab.customName,
    isNameLocked: savedTab.isNameLocked,
    extensionFilter: savedTab.extensionFilter,
    isExtensionFilterLocked: savedTab.isExtensionFilterLocked,
  })
}

function upsertProject(projects: Project[], project: Project) {
  const existingIndex = projects.findIndex((candidate) => candidate.id === project.id)

  if (existingIndex === -1) {
    return [...projects, project]
  }

  return projects.map((candidate, index) => (index === existingIndex ? project : candidate))
}

function getProjectMeta(project: Project) {
  return [project.customer, project.projectNumber].filter(Boolean).join(' - ') ||
    'No customer or project number'
}

function getQuickAccessIcon(id: string) {
  if (id === 'downloads') {
    return <Download size={15} />
  }

  if (id === 'documents') {
    return <FileText size={15} />
  }

  if (id === 'desktop') {
    return <Monitor size={15} />
  }

  if (id === 'pictures') {
    return <Image size={15} />
  }

  return <Folder size={15} />
}

function getConfiguredOpenWithPrograms(entry: FileEntry, settings: TrovenSettings) {
  if (entry.type !== 'file' || !entry.extension) {
    return []
  }

  return getOpenWithProgramList(settings.openWith[`.${entry.extension.toLowerCase()}`])
}

function getDirectoryExtensions(entries: FileEntry[]) {
  return [...new Set(entries.filter((entry) => entry.type === 'file').map((entry) => entry.extension))]
    .sort((a, b) => a.localeCompare(b))
}

function getVisibleExtensionsForDraft(extensions: string[], filter: ExtensionFilter) {
  if (filter.mode === 'include') {
    return extensions.filter((extension) => filter.extensions.includes(extension))
  }

  if (filter.mode === 'hide') {
    return extensions.filter((extension) => extension !== filter.extension)
  }

  if (filter.mode === 'show') {
    return extensions.filter((extension) => extension === filter.extension)
  }

  return extensions
}

function getExtensionFilterLabel(extension: string) {
  return extension ? `.${extension}` : 'No extension'
}

function parseSearchExtensions(value: string) {
  return [
    ...new Set(
      value
        .split(/[\s,;]+/)
        .map((extension) => extension.trim().toLowerCase().replace(/^\./, ''))
        .filter(Boolean),
    ),
  ]
}

function formatSearchResults(results: SearchResult[], options: SearchOptions) {
  return results
    .map((result) => {
      const value = options.outputMode === 'path' ? result.path : result.name
      return options.pythonRaw ? `r"${value.replaceAll('"', '\\"')}"` : value
    })
    .join('\n')
}

function parsePdfPathList(value: string) {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^r?["']|["']$/g, ''))
    .filter(Boolean)
}

function isControlShortcut(event: globalThis.KeyboardEvent) {
  return (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey
}

function isEditableShortcutTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return Boolean(
    target.closest('input, textarea, select, [contenteditable="true"], [contenteditable=""]'),
  )
}

function NewEntryMenuIcon({
  fallback,
  iconDataUrl,
}: {
  fallback: ReactNode
  iconDataUrl: string | null | undefined
}) {
  if (iconDataUrl) {
    return <img alt="" className="menu-file-icon" src={iconDataUrl} />
  }

  return fallback
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
}

function getDefaultNewEntryName(type: NewEntryType) {
  if (type === 'folder') {
    return 'New Folder'
  }

  if (type === 'text') {
    return 'New Text File.txt'
  }

  if (type === 'excel') {
    return 'New Excel File.xlsx'
  }

  return 'New Word File.docx'
}

function getNewEntryModalTitle(type: NewEntryType) {
  if (type === 'folder') {
    return 'New Folder'
  }

  if (type === 'text') {
    return 'New Text File'
  }

  if (type === 'excel') {
    return 'New Excel File'
  }

  return 'New Word File'
}

function normalizeExtension(extension: string) {
  const trimmedExtension = extension.trim().toLowerCase()

  if (!trimmedExtension) {
    return ''
  }

  return trimmedExtension.startsWith('.') ? trimmedExtension : `.${trimmedExtension}`
}

function getColumnLabel(column: SortKey) {
  if (column === 'modifiedAt') {
    return 'Modified'
  }

  return column.charAt(0).toUpperCase() + column.slice(1)
}
