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
  // Source type (entity or note)
  source_type?: 'entity' | 'note'
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

// ============================================
// Entity Staging/Review Types
// ============================================

export type StagedEntityStatus = 'pending' | 'approved' | 'rejected' | 'edited'

export interface StagedEntity {
  tempId: string
  name: string
  canonicalName: string
  entityType: string
  content: string
  aliases: string[]
  tags: string[]
  confidence: number
  excerpt: string
  status: StagedEntityStatus
  mergeTargetId?: string
}

export interface StagedRelationship {
  tempId: string
  sourceEntityTempId: string
  targetEntityTempId: string
  sourceEntityName: string
  targetEntityName: string
  relationshipType: string
  reverseLabel?: string
  excerpt: string
  status: 'pending' | 'approved' | 'rejected'
}

export interface EntityMatch {
  stagedTempId: string
  existingEntity: {
    id: string
    name: string
    entityType: string
    aliases: string[]
    canonicalName: string
  }
  matchType: 'exact' | 'alias' | 'fuzzy'
  confidence: number
}

export interface ExtractPreviewResponse {
  success: boolean
  documentId: string
  fileName: string
  extractedEntities: StagedEntity[]
  extractedRelationships: StagedRelationship[]
  existingEntityMatches: EntityMatch[]
}

export interface ApprovedEntity {
  tempId: string
  name: string
  canonicalName: string
  entityType: string
  content: string
  aliases: string[]
  tags: string[]
  isDmOnly: boolean
  mergeTargetId?: string
}

export interface ApprovedRelationship {
  sourceEntityTempId: string
  targetEntityTempId: string
  relationshipType: string
  reverseLabel?: string
}

export interface BatchCommitRequest {
  documentName: string
  documentContent: string
  entities: ApprovedEntity[]
  relationships: ApprovedRelationship[]
}

export interface BatchCommitResponse {
  success: boolean
  documentId: string
  createdEntities: Array<{ tempId: string; id: string; name: string }>
  mergedEntities: Array<{ tempId: string; id: string; name: string }>
  createdRelationships: number
  embeddingsStatus?: {
    total: number
    succeeded: number
    failed: number
  }
}
