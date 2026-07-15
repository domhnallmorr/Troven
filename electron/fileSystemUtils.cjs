function shouldHideDirectoryEntry(entryName) {
  return String(entryName).startsWith('~$')
}

function getVisibleDirectoryEntries(entries) {
  return entries.filter((entry) => !shouldHideDirectoryEntry(entry.name))
}

module.exports = {
  getVisibleDirectoryEntries,
  shouldHideDirectoryEntry,
}
