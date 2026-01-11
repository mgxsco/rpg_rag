export type NoteType =
  | 'session'
  | 'npc'
  | 'location'
  | 'item'
  | 'lore'
  | 'quest'
  | 'faction'
  | 'player_character'
  | 'freeform'

export type MemberRole = 'dm' | 'player' | 'viewer'

export interface Profile {
  id: string
  username: string
  display_name: string | null
  created_at: string
}

export interface Campaign {
  id: string
  name: string
  description: string | null
  owner_id: string
  created_at: string
  updated_at: string
}

export interface CampaignMember {
  id: string
  campaign_id: string
  user_id: string
  role: MemberRole
}

export interface Note {
  id: string
  campaign_id: string
  author_id: string
  title: string
  slug: string
  content: string
  note_type: NoteType
  tags: string[]
  is_dm_only: boolean
  created_at: string
  updated_at: string
}

export interface NoteLink {
  id: string
  source_note_id: string
  target_note_id: string
  campaign_id: string
}

export interface NoteVersion {
  id: string
  note_id: string
  title: string
  content: string
  edited_by: string
  created_at: string
}

export interface NoteEmbedding {
  id: string
  note_id: string
  campaign_id: string
  chunk_index: number
  chunk_text: string
  embedding: number[]
}

export interface WikilinkMatch {
  target: string
  display: string
}

export interface SearchResult {
  note_id: string
  note_title: string
  note_slug: string
  note_type: NoteType
  chunk_text: string
  similarity: number
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
  note_type: NoteType
}

export interface GraphLink {
  source: string
  target: string
}

export interface GraphData {
  nodes: GraphNode[]
  links: GraphLink[]
}
