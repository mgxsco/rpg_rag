import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  primaryKey,
  unique,
  index,
  customType,
  jsonb,
} from 'drizzle-orm/pg-core'
import { relations, sql } from 'drizzle-orm'

// Custom vector type for pgvector
const vector = customType<{ data: number[]; driverData: string }>({
  dataType(config) {
    return `vector(${(config as any)?.dimensions ?? 1536})`
  },
  fromDriver(value: string): number[] {
    return value
      .slice(1, -1)
      .split(',')
      .map((v) => parseFloat(v))
  },
  toDriver(value: number[]): string {
    return `[${value.join(',')}]`
  },
})

// NextAuth.js tables
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  password: text('password'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const accounts = pgTable(
  'accounts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
)

export const sessions = pgTable('sessions', {
  sessionToken: text('session_token').notNull().primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
)

// Supported languages
export const languageEnum = [
  'en', 'pt-BR', 'pt', 'es', 'fr', 'de', 'it', 'nl', 'pl', 'ru', 'ja', 'ko', 'zh'
] as const

// Campaign settings type
export interface CampaignSettings {
  extraction?: {
    aggressiveness?: 'conservative' | 'balanced' | 'obsessive'
    chunkSize?: number
    confidenceThreshold?: number
    enableAutoMerge?: boolean
    enableRelationships?: boolean
  }
  visibility?: {
    defaultDmOnly?: boolean
    dmOnlyEntityTypes?: string[]
  }
  search?: {
    similarityThreshold?: number
    resultLimit?: number
    enablePlayerChat?: boolean
  }
  graph?: {
    maxNodes?: number
    showLinkLabels?: 'always' | 'on-hover' | 'never'
  }
  prompts?: {
    chatSystemPrompt?: string
    extractionConservativePrompt?: string
    extractionBalancedPrompt?: string
    extractionObsessivePrompt?: string
  }
}

// Campaign tables
export const campaigns = pgTable('campaigns', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  language: text('language').default('pt-BR').notNull(),
  settings: jsonb('settings').$type<CampaignSettings>().default({}),
  ownerId: uuid('owner_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const campaignMembers = pgTable(
  'campaign_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: ['dm', 'player', 'viewer'] }).notNull(),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueMember: unique().on(table.campaignId, table.userId),
  })
)

// Campaign invites for sharing access
export const campaignInvites = pgTable(
  'campaign_invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    code: text('code').notNull().unique(), // 8-char invite code (e.g., "ABC12345")
    role: text('role', { enum: ['player', 'viewer'] }).notNull().default('player'),
    usesRemaining: integer('uses_remaining'), // NULL = unlimited
    expiresAt: timestamp('expires_at'), // NULL = never expires
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    codeIdx: index('campaign_invites_code_idx').on(table.code),
    campaignIdx: index('campaign_invites_campaign_idx').on(table.campaignId),
  })
)

export const notes = pgTable(
  'notes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    content: text('content').default(''),
    noteType: text('note_type', {
      enum: [
        'session',
        'npc',
        'location',
        'item',
        'lore',
        'quest',
        'faction',
        'player_character',
        'freeform',
      ],
    }).notNull(),
    tags: text('tags').array().default(sql`'{}'::text[]`),
    isDmOnly: boolean('is_dm_only').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueSlug: unique().on(table.campaignId, table.slug),
    campaignIdx: index('notes_campaign_idx').on(table.campaignId),
    campaignDmUpdatedIdx: index('notes_campaign_dm_updated_idx').on(table.campaignId, table.isDmOnly, table.updatedAt),
    campaignTypeIdx: index('notes_campaign_type_idx').on(table.campaignId, table.noteType),
  })
)

export const noteLinks = pgTable(
  'note_links',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    sourceNoteId: uuid('source_note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    targetNoteId: uuid('target_note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
  },
  (table) => ({
    uniqueLink: unique().on(table.sourceNoteId, table.targetNoteId),
  })
)

export const noteVersions = pgTable('note_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  noteId: uuid('note_id')
    .notNull()
    .references(() => notes.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  content: text('content').notNull(),
  editedBy: uuid('edited_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const noteEmbeddings = pgTable(
  'note_embeddings',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    noteId: uuid('note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    chunkIndex: integer('chunk_index').notNull(),
    chunkText: text('chunk_text').notNull(),
    embedding: vector('embedding', { dimensions: 1024 }),
  },
  (table) => ({
    campaignIdx: index('embeddings_campaign_idx').on(table.campaignId),
    noteIdx: index('embeddings_note_idx').on(table.noteId),
  })
)

// Relations
export const usersRelations = relations(users, ({ many }) => ({
  campaigns: many(campaigns),
  memberships: many(campaignMembers),
  notes: many(notes),
}))

export const campaignsRelations = relations(campaigns, ({ one, many }) => ({
  owner: one(users, {
    fields: [campaigns.ownerId],
    references: [users.id],
  }),
  members: many(campaignMembers),
  invites: many(campaignInvites),
  messages: many(messages),
  notes: many(notes),
}))

export const campaignMembersRelations = relations(campaignMembers, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignMembers.campaignId],
    references: [campaigns.id],
  }),
  user: one(users, {
    fields: [campaignMembers.userId],
    references: [users.id],
  }),
}))

export const campaignInvitesRelations = relations(campaignInvites, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [campaignInvites.campaignId],
    references: [campaigns.id],
  }),
  creator: one(users, {
    fields: [campaignInvites.createdBy],
    references: [users.id],
  }),
}))

// ============================================
// Chat Messages
// ============================================

export const messageTypeEnum = ['ooc', 'ic', 'system'] as const

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    messageType: text('message_type', { enum: ['ooc', 'ic', 'system'] }).notNull().default('ooc'),
    characterName: text('character_name'), // For IC messages
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    campaignTimeIdx: index('messages_campaign_time_idx').on(table.campaignId, table.createdAt),
  })
)

export const messagesRelations = relations(messages, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [messages.campaignId],
    references: [campaigns.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
}))

export const notesRelations = relations(notes, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [notes.campaignId],
    references: [campaigns.id],
  }),
  author: one(users, {
    fields: [notes.authorId],
    references: [users.id],
  }),
  versions: many(noteVersions),
  embeddings: many(noteEmbeddings),
  outgoingLinks: many(noteLinks, { relationName: 'sourceNote' }),
  incomingLinks: many(noteLinks, { relationName: 'targetNote' }),
}))

export const noteLinksRelations = relations(noteLinks, ({ one }) => ({
  sourceNote: one(notes, {
    fields: [noteLinks.sourceNoteId],
    references: [notes.id],
    relationName: 'sourceNote',
  }),
  targetNote: one(notes, {
    fields: [noteLinks.targetNoteId],
    references: [notes.id],
    relationName: 'targetNote',
  }),
  campaign: one(campaigns, {
    fields: [noteLinks.campaignId],
    references: [campaigns.id],
  }),
}))

export const noteVersionsRelations = relations(noteVersions, ({ one }) => ({
  note: one(notes, {
    fields: [noteVersions.noteId],
    references: [notes.id],
  }),
  editor: one(users, {
    fields: [noteVersions.editedBy],
    references: [users.id],
  }),
}))

export const noteEmbeddingsRelations = relations(noteEmbeddings, ({ one }) => ({
  note: one(notes, {
    fields: [noteEmbeddings.noteId],
    references: [notes.id],
  }),
  campaign: one(campaigns, {
    fields: [noteEmbeddings.campaignId],
    references: [campaigns.id],
  }),
}))

// ============================================
// NEW: Obsidian-style Knowledge Graph Tables
// ============================================

// Source documents (uploaded files)
export const documents = pgTable(
  'documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    content: text('content').notNull(),
    fileType: text('file_type'),
    uploadedBy: uuid('uploaded_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    campaignIdx: index('documents_campaign_idx').on(table.campaignId),
  })
)

// Common entity types (not enforced - AI can create any type)
export const commonEntityTypes = [
  'npc',
  'location',
  'item',
  'lore',
  'quest',
  'faction',
  'session',
  'player_character',
  'creature',
  'spell',
  'event',
  'organization',
  'artifact',
  'region',
  'deity',
  'race',
  'class',
  'ability',
  'condition',
  'material',
] as const

// Legacy alias for backward compatibility
export const entityTypeEnum = commonEntityTypes

// Entities (wiki pages)
export const entities = pgTable(
  'entities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),

    // Content
    name: text('name').notNull(),
    canonicalName: text('canonical_name').notNull(), // For deduplication
    entityType: text('entity_type').notNull(), // Free-form type decided by AI
    content: text('content').default(''),

    // Metadata
    aliases: text('aliases').array().default(sql`'{}'::text[]`),
    tags: text('tags').array().default(sql`'{}'::text[]`),
    isDmOnly: boolean('is_dm_only').default(false),

    // Original note reference (for migration)
    sourceNoteId: uuid('source_note_id').references(() => notes.id),

    // Session-specific fields (only used when entityType = 'session')
    sessionNumber: integer('session_number'),
    sessionDate: timestamp('session_date', { mode: 'date' }),
    inGameDate: text('in_game_date'),
    sessionStatus: text('session_status'), // 'planned' | 'completed' | 'cancelled'

    // Player character ownership (only used when entityType = 'player_character')
    playerId: uuid('player_id').references(() => campaignMembers.id, { onDelete: 'set null' }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueCanonical: unique().on(table.campaignId, table.canonicalName),
    campaignIdx: index('entities_campaign_idx').on(table.campaignId),
    typeIdx: index('entities_type_idx').on(table.campaignId, table.entityType),
    campaignDmIdx: index('entities_campaign_dm_idx').on(table.campaignId, table.isDmOnly),
    campaignUpdatedIdx: index('entities_campaign_updated_idx').on(table.campaignId, table.updatedAt),
  })
)

// Source references (where entity was mentioned)
export const entitySources = pgTable(
  'entity_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    excerpt: text('excerpt'),
    confidence: text('confidence').default('1.0'), // Using text to avoid float issues
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueSource: unique().on(table.entityId, table.documentId),
    entityIdx: index('entity_sources_entity_idx').on(table.entityId),
  })
)

// Relationship types
export const relationshipTypeEnum = [
  'lives_in',
  'member_of',
  'owns',
  'created',
  'enemy_of',
  'ally_of',
  'located_in',
  'participated_in',
  'mentioned_in',
  'related_to',
] as const

// Relationships (graph edges)
export const relationships = pgTable(
  'relationships',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),

    sourceEntityId: uuid('source_entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    targetEntityId: uuid('target_entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),

    relationshipType: text('relationship_type').notNull(),
    reverseLabel: text('reverse_label'), // e.g., "residents" for "lives_in"

    // Source tracking
    documentId: uuid('document_id').references(() => documents.id),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    uniqueRelation: unique().on(table.sourceEntityId, table.targetEntityId, table.relationshipType),
    sourceIdx: index('relationships_source_idx').on(table.sourceEntityId),
    targetIdx: index('relationships_target_idx').on(table.targetEntityId),
    campaignIdx: index('relationships_campaign_idx').on(table.campaignId),
    campaignSourceIdx: index('relationships_campaign_source_idx').on(table.campaignId, table.sourceEntityId),
    campaignTargetIdx: index('relationships_campaign_target_idx').on(table.campaignId, table.targetEntityId),
  })
)

// Chunks for RAG (semantic search on entities)
export const chunks = pgTable(
  'chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),

    content: text('content').notNull(),
    chunkIndex: integer('chunk_index').notNull(),

    // Context metadata
    headerPath: text('header_path').array().default(sql`'{}'::text[]`),
    entityMentions: text('entity_mentions').array().default(sql`'{}'::text[]`),

    embedding: vector('embedding', { dimensions: 1024 }),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    entityIdx: index('chunks_entity_idx').on(table.entityId),
    campaignIdx: index('chunks_campaign_idx').on(table.campaignId),
  })
)

// Entity versions (history)
export const entityVersions = pgTable('entity_versions', {
  id: uuid('id').defaultRandom().primaryKey(),
  entityId: uuid('entity_id')
    .notNull()
    .references(() => entities.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  content: text('content').notNull(),
  editedBy: uuid('edited_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

// ============================================
// NEW: Relations for Knowledge Graph
// ============================================

export const documentsRelations = relations(documents, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [documents.campaignId],
    references: [campaigns.id],
  }),
  uploader: one(users, {
    fields: [documents.uploadedBy],
    references: [users.id],
  }),
  entitySources: many(entitySources),
}))

export const entitiesRelations = relations(entities, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [entities.campaignId],
    references: [campaigns.id],
  }),
  sourceNote: one(notes, {
    fields: [entities.sourceNoteId],
    references: [notes.id],
  }),
  player: one(campaignMembers, {
    fields: [entities.playerId],
    references: [campaignMembers.id],
  }),
  sources: many(entitySources),
  chunks: many(chunks),
  versions: many(entityVersions),
  comments: many(entityComments),
  outgoingRelationships: many(relationships, { relationName: 'sourceEntity' }),
  incomingRelationships: many(relationships, { relationName: 'targetEntity' }),
}))

export const entitySourcesRelations = relations(entitySources, ({ one }) => ({
  entity: one(entities, {
    fields: [entitySources.entityId],
    references: [entities.id],
  }),
  document: one(documents, {
    fields: [entitySources.documentId],
    references: [documents.id],
  }),
}))

export const relationshipsRelations = relations(relationships, ({ one }) => ({
  campaign: one(campaigns, {
    fields: [relationships.campaignId],
    references: [campaigns.id],
  }),
  sourceEntity: one(entities, {
    fields: [relationships.sourceEntityId],
    references: [entities.id],
    relationName: 'sourceEntity',
  }),
  targetEntity: one(entities, {
    fields: [relationships.targetEntityId],
    references: [entities.id],
    relationName: 'targetEntity',
  }),
  document: one(documents, {
    fields: [relationships.documentId],
    references: [documents.id],
  }),
}))

export const chunksRelations = relations(chunks, ({ one }) => ({
  entity: one(entities, {
    fields: [chunks.entityId],
    references: [entities.id],
  }),
  campaign: one(campaigns, {
    fields: [chunks.campaignId],
    references: [campaigns.id],
  }),
}))

export const entityVersionsRelations = relations(entityVersions, ({ one }) => ({
  entity: one(entities, {
    fields: [entityVersions.entityId],
    references: [entities.id],
  }),
  editor: one(users, {
    fields: [entityVersions.editedBy],
    references: [users.id],
  }),
}))

// ============================================
// Types
// ============================================

export type User = typeof users.$inferSelect
export type Campaign = typeof campaigns.$inferSelect
export type CampaignMember = typeof campaignMembers.$inferSelect
export type CampaignInvite = typeof campaignInvites.$inferSelect
export type Note = typeof notes.$inferSelect
export type NoteLink = typeof noteLinks.$inferSelect
export type NoteVersion = typeof noteVersions.$inferSelect
export type NoteEmbedding = typeof noteEmbeddings.$inferSelect
export type NoteType = Note['noteType']
export type MemberRole = CampaignMember['role']

// New types for knowledge graph
export type Document = typeof documents.$inferSelect
export type Entity = typeof entities.$inferSelect
export type EntitySource = typeof entitySources.$inferSelect
export type Relationship = typeof relationships.$inferSelect
export type Chunk = typeof chunks.$inferSelect
export type EntityVersion = typeof entityVersions.$inferSelect
export type EntityType = Entity['entityType']
export type RelationshipType = (typeof relationshipTypeEnum)[number]
export type SessionStatus = 'planned' | 'completed' | 'cancelled'

// Chat types
export type Message = typeof messages.$inferSelect
export type MessageType = (typeof messageTypeEnum)[number]

// ============================================
// Entity Comments
// ============================================

export const entityComments = pgTable(
  'entity_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    entityId: uuid('entity_id')
      .notNull()
      .references(() => entities.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    entityIdx: index('entity_comments_entity_idx').on(table.entityId),
    createdIdx: index('entity_comments_created_idx').on(table.entityId, table.createdAt),
  })
)

export const entityCommentsRelations = relations(entityComments, ({ one }) => ({
  entity: one(entities, {
    fields: [entityComments.entityId],
    references: [entities.id],
  }),
  user: one(users, {
    fields: [entityComments.userId],
    references: [users.id],
  }),
}))

export type EntityComment = typeof entityComments.$inferSelect
