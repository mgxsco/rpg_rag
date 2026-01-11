# D&D Campaign Manager

A collaborative D&D campaign management app combining wiki structure, Obsidian-style `[[wikilinks]]`, and RAG-powered AI search.

## Features

- **Wiki-Style Notes**: Create interconnected notes for NPCs, locations, items, and lore with `[[wikilinks]]`
- **Knowledge Graph**: Visualize your campaign's connections with an interactive force-directed graph
- **AI-Powered Search**: Ask questions about your campaign and get answers with source citations using RAG
- **Collaborative**: DMs and players can work together with role-based permissions
- **DM-Only Notes**: Keep secrets hidden from players with DM-only visibility

## Tech Stack

- **Frontend**: Next.js 14 (App Router), React, Tailwind CSS, shadcn/ui
- **Backend**: Supabase (Postgres + pgvector + Auth)
- **AI**: OpenAI API (text-embedding-3-small, gpt-4o)
- **Visualization**: react-force-graph-2d

## Getting Started

### Prerequisites

- Node.js 18+
- Supabase account
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

3. Copy the environment file and fill in your values:
```bash
cp .env.example .env
```

4. Set up your Supabase database:
   - Create a new Supabase project
   - Run the SQL from `supabase/schema.sql` in the SQL editor
   - Copy your project URL and keys to `.env`

5. Run the development server:
```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
OPENAI_API_KEY=your-openai-api-key
```

## Project Structure

```
app/
  (auth)/              # Authentication pages
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
  layout/              # Layout components
  campaigns/           # Campaign components
  notes/               # Note components
  editor/              # Editor components
  graph/               # Graph visualization
  chat/                # Chat components

lib/
  supabase/            # Supabase client utilities
  wikilinks/           # Wikilink parsing and sync
  ai/                  # AI/RAG utilities
```

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

1. Search your campaign notes using vector similarity
2. Build context from relevant chunks
3. Generate responses with GPT-4
4. Display source citations

DMs see all notes; players only see non-DM-only content.

## License

MIT
