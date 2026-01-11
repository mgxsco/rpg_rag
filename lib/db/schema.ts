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

// Campaign tables
export const campaigns = pgTable('campaigns', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
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
  },
  (table) => ({
    uniqueMember: unique().on(table.campaignId, table.userId),
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

// Types
export type User = typeof users.$inferSelect
export type Campaign = typeof campaigns.$inferSelect
export type CampaignMember = typeof campaignMembers.$inferSelect
export type Note = typeof notes.$inferSelect
export type NoteLink = typeof noteLinks.$inferSelect
export type NoteVersion = typeof noteVersions.$inferSelect
export type NoteEmbedding = typeof noteEmbeddings.$inferSelect
export type NoteType = Note['noteType']
export type MemberRole = CampaignMember['role']
