# D&D Campaign Manager

A collaborative D&D campaign management app combining wiki structure, Obsidian-style `[[wikilinks]]`, and RAG-powered AI search. Built entirely on Vercel infrastructure.

## Features

- **Wiki-Style Notes**: Create interconnected notes for NPCs, locations, items, and lore with `[[wikilinks]]`
- **Knowledge Graph**: Visualize your campaign's connections with an interactive force-directed graph
- **AI-Powered Search**: Ask questions about your campaign and get answers with source citations using RAG
- **Collaborative**: DMs and players can work together with role-based permissions
- **DM-Only Notes**: Keep secrets hidden from players with DM-only visibility

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, Tailwind CSS, shadcn/ui
- **Database**: Vercel Postgres (Neon) with pgvector for embeddings
- **ORM**: Drizzle ORM
- **Auth**: NextAuth.js with credentials provider
- **AI**: OpenAI API (text-embedding-3-small, gpt-4o)
- **Visualization**: react-force-graph-2d
- **Deploy**: Vercel

## Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/yourusername/rpg-rag)

### Quick Setup

1. Click "Deploy with Vercel" above
2. Add the **Vercel Postgres** integration from the Vercel dashboard
3. Set the following environment variables:
   - `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
   - `NEXTAUTH_URL`: Your deployment URL (e.g., `https://your-app.vercel.app`)
   - `OPENAI_API_KEY`: Your OpenAI API key
4. Run database migrations: `npm run db:push`

## Local Development

### Prerequisites

- Node.js 18+
- Vercel CLI (`npm i -g vercel`)
- OpenAI API key

### Setup

1. Clone the repository:
```bash
git clone <repo-url>
cd rpg_rag
```

2. Install dependencies:
```bash
npm install
```

3. Link to your Vercel project:
```bash
vercel link
```

4. Pull environment variables:
```bash
vercel env pull .env.local
```

5. Add your OpenAI API key and NextAuth secret to `.env.local`

6. Push the database schema:
```bash
npm run db:push
```

7. Run the development server:
```bash
npm run dev
```

8. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

```
# Vercel Postgres (auto-set by Vercel integration)
POSTGRES_URL=
POSTGRES_PRISMA_URL=
POSTGRES_URL_NON_POOLING=

# NextAuth.js
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your-secret-here

# OpenAI
OPENAI_API_KEY=your-openai-api-key
```

## Project Structure

```
app/
  (auth)/              # Authentication pages (login, register)
  (dashboard)/         # Main app pages
    campaigns/         # Campaign management
      [campaignId]/    # Campaign detail pages
        notes/         # Note management
        graph/         # Knowledge graph
        chat/          # AI chat
        settings/      # Campaign settings
  api/                 # API routes

components/
  ui/                  # shadcn/ui components
  providers/           # Context providers
  layout/              # Layout components
  campaigns/           # Campaign components
  notes/               # Note components
  editor/              # Editor components
  graph/               # Graph visualization
  chat/                # Chat components

lib/
  db/                  # Drizzle schema and client
  auth.ts              # NextAuth configuration
  wikilinks/           # Wikilink parsing and sync
  ai/                  # AI/RAG utilities
```

## Database Schema

The app uses Drizzle ORM with Vercel Postgres. Key tables:

- `users` - User accounts (NextAuth.js)
- `campaigns` - D&D campaigns
- `campaign_members` - Campaign membership with roles (dm, player, viewer)
- `notes` - Wiki-style notes with types and tags
- `note_links` - Wikilink connections between notes
- `note_embeddings` - Vector embeddings for RAG search

## Note Types

- **Session**: Session logs and recaps
- **NPC**: Non-player characters
- **Location**: Places in your world
- **Item**: Weapons, artifacts, treasures
- **Lore**: World history and mythology
- **Quest**: Active and completed quests
- **Faction**: Organizations and groups
- **Player Character**: PC information
- **Freeform**: General notes

## Wikilinks

Link notes together using Obsidian-style wikilinks:

- `[[Note Title]]` - Link to a note by title
- `[[Note Title|Display Text]]` - Link with custom display text

The editor provides autocomplete suggestions as you type.

## AI Chat

The AI chat feature uses RAG (Retrieval-Augmented Generation) to:

1. Search your campaign notes using vector similarity (pgvector)
2. Build context from relevant chunks
3. Generate responses with GPT-4o
4. Display source citations

DMs see all notes; players only see non-DM-only content.

## License

MIT
