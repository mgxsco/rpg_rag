import type { CampaignSettings } from '@/lib/db/schema'

/**
 * Default campaign settings
 * These values are used when settings are not explicitly configured
 */
export const DEFAULT_SETTINGS: Required<{
  extraction: Required<NonNullable<CampaignSettings['extraction']>>
  visibility: Required<NonNullable<CampaignSettings['visibility']>>
  search: Required<NonNullable<CampaignSettings['search']>>
  graph: Required<NonNullable<CampaignSettings['graph']>>
}> = {
  extraction: {
    aggressiveness: 'obsessive',
    chunkSize: 6000,
    confidenceThreshold: 0.5,
    enableAutoMerge: false,
    enableRelationships: true,
  },
  visibility: {
    defaultDmOnly: false,
    dmOnlyEntityTypes: [],
  },
  search: {
    similarityThreshold: 0.3,
    resultLimit: 8,
    enablePlayerChat: false,
  },
  graph: {
    maxNodes: 500,
    showLinkLabels: 'on-hover',
  },
}

/**
 * Get campaign settings with defaults merged in
 */
export function getCampaignSettings(settings?: CampaignSettings | null): typeof DEFAULT_SETTINGS {
  if (!settings) return DEFAULT_SETTINGS

  return {
    extraction: {
      ...DEFAULT_SETTINGS.extraction,
      ...(settings.extraction || {}),
    },
    visibility: {
      ...DEFAULT_SETTINGS.visibility,
      ...(settings.visibility || {}),
    },
    search: {
      ...DEFAULT_SETTINGS.search,
      ...(settings.search || {}),
    },
    graph: {
      ...DEFAULT_SETTINGS.graph,
      ...(settings.graph || {}),
    },
  }
}

/**
 * Extraction aggressiveness descriptions
 */
export const AGGRESSIVENESS_OPTIONS = [
  {
    value: 'conservative' as const,
    label: 'Conservative',
    description: 'Fewer entities, only confident extractions. Best for focused campaigns.',
  },
  {
    value: 'balanced' as const,
    label: 'Balanced',
    description: 'Moderate extraction. Good balance of coverage and accuracy.',
  },
  {
    value: 'obsessive' as const,
    label: 'Obsessive',
    description: 'Extract everything possible. Best for world-building and lore-heavy campaigns.',
  },
]

/**
 * Chunk size options
 */
export const CHUNK_SIZE_OPTIONS = [
  {
    value: 3000,
    label: 'Small (3000 chars)',
    description: 'More detailed extraction, slower processing',
  },
  {
    value: 6000,
    label: 'Medium (6000 chars)',
    description: 'Recommended balance of detail and speed',
  },
  {
    value: 10000,
    label: 'Large (10000 chars)',
    description: 'Faster processing, may miss subtle connections',
  },
]

/**
 * Link label visibility options
 */
export const LINK_LABEL_OPTIONS = [
  { value: 'always' as const, label: 'Always visible' },
  { value: 'on-hover' as const, label: 'Show on hover' },
  { value: 'never' as const, label: 'Never show' },
]
