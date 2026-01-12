// Re-export types from schema
export type {
  User,
  Campaign,
  CampaignMember,
  Note,
  NoteLink,
  NoteVersion,
  NoteEmbedding,
  NoteType,
  MemberRole,
} from './db/schema'

// Additional types for API/UI
export interface SearchResult {
  // Entity-based fields (new system)
  entity_id: string
  entity_name: string
  entity_type: string
  chunk_text: string
  similarity: number
  // Legacy aliases for backward compatibility
  note_id?: string
  note_title?: string
  note_slug?: string
  note_type?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: SearchResult[]
}

export interface GraphNode {
  id: string
  title: string
  slug: string
  note_type: string
}

export interface GraphLink {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}

export interface WikilinkMatch {
  target: string
  display: string
}
