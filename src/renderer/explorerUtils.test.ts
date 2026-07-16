import { describe, expect, it } from 'vitest'
import {
  applyExtensionFilter,
  clampMenuPosition,
  formatSize,
  getBreadcrumbs,
  getDefaultTabName,
  getVisibleBreadcrumbs,
  getOpenWithProgramList,
  getProgramLabel,
  truncateText,
} from './explorerUtils'

describe('getBreadcrumbs', () => {
  it('returns no breadcrumbs when no path is selected', () => {
    expect(getBreadcrumbs('')).toEqual([])
  })

  it('builds Windows drive breadcrumbs', () => {
    expect(getBreadcrumbs('C:\\Users\\domhn\\Documents')).toEqual([
      { label: 'C:\\', path: 'C:\\' },
      { label: 'Users', path: 'C:\\Users' },
      { label: 'domhn', path: 'C:\\Users\\domhn' },
      { label: 'Documents', path: 'C:\\Users\\domhn\\Documents' },
    ])
  })

  it('normalizes forward slashes in paths', () => {
    expect(getBreadcrumbs('C:/Projects/troven')).toEqual([
      { label: 'C:\\', path: 'C:\\' },
      { label: 'Projects', path: 'C:\\Projects' },
      { label: 'troven', path: 'C:\\Projects\\troven' },
    ])
  })

  it('builds UNC breadcrumbs', () => {
    expect(getBreadcrumbs('\\\\server\\share\\folder')).toEqual([
      { label: '\\\\server\\share', path: '\\\\server\\share' },
      { label: 'folder', path: '\\\\server\\share\\folder' },
    ])
  })
})

describe('getDefaultTabName', () => {
  it('uses Explorer before a folder is selected', () => {
    expect(getDefaultTabName('')).toBe('Explorer')
  })

  it('uses the final folder name', () => {
    expect(getDefaultTabName('C:\\Users\\domhn\\Documents\\troven')).toBe('troven')
  })

  it('keeps drive root labels readable', () => {
    expect(getDefaultTabName('C:\\')).toBe('C:\\')
  })
})

describe('getVisibleBreadcrumbs', () => {
  const breadcrumbs = getBreadcrumbs('C:\\Users\\domhn\\Documents\\troven')

  it('keeps all breadcrumbs when the bar is wide enough', () => {
    expect(getVisibleBreadcrumbs(breadcrumbs, 1200).map((item) => item.breadcrumb.label)).toEqual([
      'C:\\',
      'Users',
      'domhn',
      'Documents',
      'troven',
    ])
  })

  it('drops high-level breadcrumbs first when space is tight', () => {
    expect(getVisibleBreadcrumbs(breadcrumbs, 200).map((item) => item.breadcrumb.label)).toEqual([
      'Documents',
      'troven',
    ])
  })

  it('always keeps the final breadcrumb even in very narrow space', () => {
    expect(getVisibleBreadcrumbs(breadcrumbs, 20).map((item) => item.breadcrumb.label)).toEqual([
      'troven',
    ])
  })
})

describe('truncateText', () => {
  it('leaves short text alone', () => {
    expect(truncateText('Documents', 20)).toBe('Documents')
  })

  it('truncates long text within the requested length', () => {
    const value = truncateText('a-very-long-folder-name', 20)

    expect(value).toBe('a-very-long-folde...')
    expect(value).toHaveLength(20)
  })
})

describe('formatSize', () => {
  it('returns an empty value for folders', () => {
    expect(formatSize(null)).toBe('')
  })

  it('formats bytes and larger units', () => {
    expect(formatSize(512)).toBe('512 B')
    expect(formatSize(1024)).toBe('1.0 KB')
    expect(formatSize(10 * 1024 * 1024)).toBe('10 MB')
  })
})

describe('clampMenuPosition', () => {
  it('keeps a menu inside the viewport near the bottom right', () => {
    expect(
      clampMenuPosition({
        x: 980,
        y: 760,
        menuWidth: 230,
        menuHeight: 124,
        viewportWidth: 1000,
        viewportHeight: 800,
      }),
    ).toEqual({ x: 762, y: 668 })
  })

  it('keeps a menu inside the viewport near the top left', () => {
    expect(
      clampMenuPosition({
        x: 0,
        y: 2,
        menuWidth: 150,
        menuHeight: 44,
        viewportWidth: 1000,
        viewportHeight: 800,
      }),
    ).toEqual({ x: 8, y: 8 })
  })
})

describe('applyExtensionFilter', () => {
  const entries = [
    { name: 'docs', type: 'folder' as const, extension: '' },
    { name: 'a.pdf', type: 'file' as const, extension: 'pdf' },
    { name: 'b.pdf', type: 'file' as const, extension: 'pdf' },
    { name: 'notes.txt', type: 'file' as const, extension: 'txt' },
  ]

  it('shows all entries when no filter is active', () => {
    expect(applyExtensionFilter(entries, { mode: 'all' }).map((entry) => entry.name)).toEqual([
      'docs',
      'a.pdf',
      'b.pdf',
      'notes.txt',
    ])
  })

  it('shows only matching file extensions while keeping folders visible', () => {
    expect(applyExtensionFilter(entries, { mode: 'show', extension: 'pdf' }).map((entry) => entry.name)).toEqual([
      'docs',
      'a.pdf',
      'b.pdf',
    ])
  })

  it('hides matching file extensions while keeping folders visible', () => {
    expect(applyExtensionFilter(entries, { mode: 'hide', extension: 'pdf' }).map((entry) => entry.name)).toEqual([
      'docs',
      'notes.txt',
    ])
  })

  it('shows only included file extensions while keeping folders visible', () => {
    expect(
      applyExtensionFilter(entries, { mode: 'include', extensions: ['txt'] }).map(
        (entry) => entry.name,
      ),
    ).toEqual(['docs', 'notes.txt'])
  })
})

describe('open with helpers', () => {
  it('normalizes legacy and multi-program settings values', () => {
    expect(getOpenWithProgramList(' C:\\Program Files\\Chrome\\chrome.exe ')).toEqual([
      'C:\\Program Files\\Chrome\\chrome.exe',
    ])
    expect(getOpenWithProgramList(['', ' C:\\Apps\\Reader.exe ', 'C:\\Apps\\Chrome.exe'])).toEqual([
      'C:\\Apps\\Reader.exe',
      'C:\\Apps\\Chrome.exe',
    ])
  })

  it('uses the executable filename as the menu label', () => {
    expect(getProgramLabel('"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"')).toBe(
      'chrome.exe',
    )
  })
})
