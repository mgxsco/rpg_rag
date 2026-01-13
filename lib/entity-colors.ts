import {
  Swords,
  Castle,
  Gem,
  ScrollText,
  Flag,
  BookOpen,
  Crown,
  Layers,
  Skull,
  Wand2,
  Sun,
  Calendar,
  Scroll,
} from 'lucide-react'

/**
 * Centralized entity type color definitions
 * Single source of truth for all entity type styling
 */
export const ENTITY_TYPE_COLORS: Record<string, {
  bg: string
  text: string
  border: string
  hex: string
}> = {
  npc: {
    bg: 'bg-blue-500/10',
    text: 'text-blue-500',
    border: 'border-blue-500/20',
    hex: '#3b82f6',
  },
  location: {
    bg: 'bg-green-500/10',
    text: 'text-green-500',
    border: 'border-green-500/20',
    hex: '#22c55e',
  },
  item: {
    bg: 'bg-amber-500/10',
    text: 'text-amber-500',
    border: 'border-amber-500/20',
    hex: '#f59e0b',
  },
  quest: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-500',
    border: 'border-purple-500/20',
    hex: '#a855f7',
  },
  faction: {
    bg: 'bg-red-500/10',
    text: 'text-red-500',
    border: 'border-red-500/20',
    hex: '#ef4444',
  },
  lore: {
    bg: 'bg-cyan-500/10',
    text: 'text-cyan-500',
    border: 'border-cyan-500/20',
    hex: '#06b6d4',
  },
  session: {
    bg: 'bg-pink-500/10',
    text: 'text-pink-500',
    border: 'border-pink-500/20',
    hex: '#ec4899',
  },
  player_character: {
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-500',
    border: 'border-yellow-500/20',
    hex: '#eab308',
  },
  freeform: {
    bg: 'bg-gray-500/10',
    text: 'text-gray-500',
    border: 'border-gray-500/20',
    hex: '#6b7280',
  },
  creature: {
    bg: 'bg-lime-500/10',
    text: 'text-lime-500',
    border: 'border-lime-500/20',
    hex: '#84cc16',
  },
  spell: {
    bg: 'bg-violet-500/10',
    text: 'text-violet-500',
    border: 'border-violet-500/20',
    hex: '#8b5cf6',
  },
  deity: {
    bg: 'bg-amber-400/10',
    text: 'text-amber-400',
    border: 'border-amber-400/20',
    hex: '#fbbf24',
  },
  event: {
    bg: 'bg-sky-500/10',
    text: 'text-sky-500',
    border: 'border-sky-500/20',
    hex: '#0ea5e9',
  },
}

/**
 * Entity type icons mapping - Fantasy themed
 */
export const ENTITY_TYPE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  all: Layers,
  npc: Swords,           // Combat/adventure themed
  location: Castle,       // Medieval castle
  item: Gem,             // Treasure/artifact
  quest: ScrollText,     // Quest scroll
  faction: Flag,         // Political banner
  lore: BookOpen,        // Ancient tome
  session: BookOpen,     // Session notes
  player_character: Crown, // Heroic crown
  freeform: Scroll,      // Generic scroll
  creature: Skull,       // Monster/creature
  spell: Wand2,          // Magic wand
  deity: Sun,            // Divine radiance
  event: Calendar,       // Timeline event
}

/**
 * Entity type display labels
 */
export const ENTITY_TYPE_LABELS: Record<string, string> = {
  all: 'All',
  npc: 'NPCs',
  location: 'Locations',
  item: 'Items',
  quest: 'Quests',
  faction: 'Factions',
  lore: 'Lore',
  session: 'Sessions',
  player_character: 'PCs',
  freeform: 'Other',
  creature: 'Creatures',
  spell: 'Spells',
  deity: 'Deities',
  event: 'Events',
}

/**
 * Get color classes for an entity type
 */
export function getEntityTypeColor(type: string) {
  return ENTITY_TYPE_COLORS[type] || ENTITY_TYPE_COLORS.freeform
}

/**
 * Get icon component for an entity type
 */
export function getEntityTypeIcon(type: string) {
  return ENTITY_TYPE_ICONS[type] || ENTITY_TYPE_ICONS.freeform
}

/**
 * Get display label for an entity type
 */
export function getEntityTypeLabel(type: string) {
  return ENTITY_TYPE_LABELS[type] || type.replace('_', ' ')
}

/**
 * Get combined class string for entity type badge
 */
export function getEntityTypeBadgeClasses(type: string) {
  const colors = getEntityTypeColor(type)
  return `${colors.bg} ${colors.text} ${colors.border}`
}
