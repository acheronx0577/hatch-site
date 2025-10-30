const fs = require('fs')
const path = require('path')

const mode = process.argv.includes('--ui-only') ? 'ui' : 'all'

const ifacePath = path.join(__dirname, 'shadcn-ui/src/types/MLSProperty.ts')
const draftPath = path.join(__dirname, 'shadcn-ui/src/pages/broker/DraftListings.tsx')

const ifaceContent = fs.readFileSync(ifacePath, 'utf8')

const extractMLSInterface = (source) => {
  const start = source.indexOf('export interface MLSProperty')
  if (start === -1) {
    throw new Error('Could not locate MLSProperty interface in MLSProperty.ts')
  }
  const braceStart = source.indexOf('{', start)
  if (braceStart === -1) {
    throw new Error('MLSProperty interface body not found')
  }
  let depth = 0
  for (let i = braceStart; i < source.length; i++) {
    const char = source[i]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return source.slice(braceStart + 1, i)
      }
    }
  }
  throw new Error('MLSProperty interface closing brace not found')
}

const iface = extractMLSInterface(ifaceContent)
const draft = fs.readFileSync(draftPath, 'utf8')

const interfaceProps = new Set(
  Array.from(iface.matchAll(/^  (\w+)\??:/gm), (match) => match[1])
)

const wired = new Set()

const collect = (regexList) => {
  regexList.forEach((regex) => {
    for (const match of draft.matchAll(regex)) {
      wired.add(match[1])
    }
  })
}

if (mode === 'ui') {
  collect([
    /updateEditingProperty\(\s*'([^']+)'/g,
  ])
} else {
  collect([
    /updateEditingProperty\(\s*'([^']+)'/g,
    /ensureString\('([^']+)'/g,
    /ensureNumber\('([^']+)'/g,
    /ensureStringArray\('([^']+)'/g,
    /assignStringFromAdditional\('([^']+)'/g,
    /assignNumberFromAdditional\('([^']+)'/g,
    /mappedProperty\.([A-Za-z0-9_]+)\s*=/g,
    /([A-Za-z0-9_]+): mappedProperty\./g,
  ])
}

;[
  'id',
  'status',
  'workflowState',
  'photos',
  'additionalFields',
  'validationErrors',
  'validationWarnings',
  'completionPercentage',
  'createdAt',
  'lastModified',
  'publishedAt',
  'closedAt',
  'viewCount',
  'leadCount',
  'favoriteCount',
  'mlsCompliant',
  'fileName',
  'fieldMatches',
  'isFeatured',
  'sourceExtractedFields',
  'sourceMatches',
].forEach((key) => wired.add(key))

const missing = Array.from(interfaceProps)
  .filter((name) => !wired.has(name))
  .sort()

if (missing.length === 0) {
  console.log(
    mode === 'ui'
      ? 'All MLSProperty fields are exposed in the Draft Listings editor.'
      : 'All MLSProperty fields are referenced somewhere in DraftListings (editor or importer).'
  )
} else {
  console.log(
    mode === 'ui'
      ? 'MLSProperty fields missing editor controls:'
      : 'Interface fields not referenced in DraftListings:',
    missing
  )
}
