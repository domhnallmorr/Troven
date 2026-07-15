import { describe, expect, it } from 'vitest'
import { getVisibleDirectoryEntries, shouldHideDirectoryEntry } from './fileSystemUtils.cjs'

describe('shouldHideDirectoryEntry', () => {
  it('hides Office temporary lock files', () => {
    expect(shouldHideDirectoryEntry('~$budget.xlsx')).toBe(true)
    expect(shouldHideDirectoryEntry('~$Report.docx')).toBe(true)
  })

  it('keeps normal files and folders visible', () => {
    expect(shouldHideDirectoryEntry('budget.xlsx')).toBe(false)
    expect(shouldHideDirectoryEntry('~archive')).toBe(false)
    expect(shouldHideDirectoryEntry('$data.csv')).toBe(false)
  })
})

describe('getVisibleDirectoryEntries', () => {
  it('filters hidden temporary entries while preserving order', () => {
    expect(
      getVisibleDirectoryEntries([
        { name: 'Documents' },
        { name: '~$report.docx' },
        { name: 'report.docx' },
      ]),
    ).toEqual([{ name: 'Documents' }, { name: 'report.docx' }])
  })
})
