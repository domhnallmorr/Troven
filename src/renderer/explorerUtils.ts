export type Breadcrumb = {
  label: string
  path: string
}

export type VisibleBreadcrumb = {
  breadcrumb: Breadcrumb
  index: number
}

export function getBreadcrumbs(currentPath: string): Breadcrumb[] {
  if (!currentPath) {
    return []
  }

  const normalizedPath = currentPath.replaceAll('/', '\\')

  if (normalizedPath.startsWith('\\\\')) {
    const parts = normalizedPath.split('\\').filter(Boolean)

    if (parts.length < 2) {
      return [{ label: normalizedPath, path: normalizedPath }]
    }

    const root = `\\\\${parts[0]}\\${parts[1]}`
    return [
      { label: root, path: root },
      ...parts.slice(2).map((part, index) => ({
        label: part,
        path: `${root}\\${parts.slice(2, index + 3).join('\\')}`,
      })),
    ]
  }

  const parts = normalizedPath.split('\\').filter(Boolean)

  if (parts.length === 0) {
    return [{ label: normalizedPath, path: normalizedPath }]
  }

  return parts.map((part, index) => {
    const isDrive = index === 0 && part.endsWith(':')
    const segmentPath = isDrive ? `${part}\\` : parts.slice(0, index + 1).join('\\')

    return {
      label: isDrive ? `${part}\\` : part,
      path: segmentPath,
    }
  })
}

export function getDefaultTabName(currentPath: string) {
  if (!currentPath) {
    return 'Explorer'
  }

  const normalizedPath = currentPath.replaceAll('/', '\\')
  const parts = normalizedPath.split('\\').filter(Boolean)
  const lastPart = parts.at(-1)

  if (lastPart?.endsWith(':')) {
    return `${lastPart}\\`
  }

  return lastPart ?? currentPath
}

export function truncateText(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value
  }

  return `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

export function getVisibleBreadcrumbs(
  breadcrumbs: Breadcrumb[],
  availableWidth: number,
): VisibleBreadcrumb[] {
  if (breadcrumbs.length === 0) {
    return []
  }

  if (availableWidth <= 0) {
    return breadcrumbs.map((breadcrumb, index) => ({ breadcrumb, index }))
  }

  const estimateWidth = (breadcrumb: Breadcrumb, index: number) => {
    const labelWidth = Math.min(260, Math.max(36, breadcrumb.label.length * 8 + 18))
    const separatorWidth = index > 0 ? 16 : 0
    return labelWidth + separatorWidth
  }

  const visible: VisibleBreadcrumb[] = []
  let usedWidth = 0

  for (let index = breadcrumbs.length - 1; index >= 0; index -= 1) {
    const breadcrumb = breadcrumbs[index]
    const nextWidth = estimateWidth(breadcrumb, index)

    if (visible.length > 0 && usedWidth + nextWidth > availableWidth) {
      break
    }

    visible.unshift({ breadcrumb, index })
    usedWidth += nextWidth
  }

  return visible
}

export function formatSize(size: number | null) {
  if (size === null) {
    return ''
  }

  if (size < 1024) {
    return `${size} B`
  }

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = size / 1024
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
}

export function clampMenuPosition({
  x,
  y,
  menuWidth,
  menuHeight,
  viewportWidth,
  viewportHeight,
  margin = 8,
}: {
  x: number
  y: number
  menuWidth: number
  menuHeight: number
  viewportWidth: number
  viewportHeight: number
  margin?: number
}) {
  const maxX = Math.max(margin, viewportWidth - menuWidth - margin)
  const maxY = Math.max(margin, viewportHeight - menuHeight - margin)

  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY),
  }
}

export type ExtensionFilter =
  | { mode: 'all' }
  | { mode: 'show'; extension: string }
  | { mode: 'hide'; extension: string }
  | { mode: 'include'; extensions: string[] }

export function applyExtensionFilter<T extends { extension: string; type: 'folder' | 'file' }>(
  entries: T[],
  filter: ExtensionFilter,
) {
  if (filter.mode === 'all') {
    return entries
  }

  return entries.filter((entry) => {
    if (entry.type === 'folder') {
      return true
    }

    if (filter.mode === 'show') {
      return entry.extension === filter.extension
    }

    if (filter.mode === 'include') {
      return filter.extensions.includes(entry.extension)
    }

    return entry.extension !== filter.extension
  })
}

export function getOpenWithProgramList(programs: string | string[] | undefined) {
  if (Array.isArray(programs)) {
    return programs.map((program) => program.trim()).filter(Boolean)
  }

  return programs ? [programs.trim()].filter(Boolean) : []
}

export function getProgramLabel(programPath: string) {
  const normalizedPath = programPath.trim().replace(/^["']|["']$/g, '')
  return normalizedPath.split(/[\\/]/).filter(Boolean).at(-1) ?? 'Configured program'
}
