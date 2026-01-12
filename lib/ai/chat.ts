import Anthropic from '@anthropic-ai/sdk'
import { searchSimilarChunks, buildContext } from './rag'
import { ChatMessage, SearchResult } from '@/lib/types'
import { getCampaignSettings, DEFAULT_SETTINGS } from '@/lib/campaign-settings'
import type { CampaignSettings } from '@/lib/db/schema'

// Lazy-initialize Anthropic client to avoid build errors
let anthropicClient: Anthropic | null = null

function getAnthropic(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }
  if (!anthropicClient) {
    anthropicClient = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })
  }
  return anthropicClient
}

const SYSTEM_PROMPT = `You are a helpful D&D campaign assistant. Your role is to answer questions about the campaign based on the provided context from the campaign knowledge base.

Guidelines:
- Answer questions based ONLY on the provided context
- If the answer isn't in the context, say you don't have that information in the campaign knowledge base
- Be concise but thorough
- When referencing information, mention which source it came from (entity name and type)
- Stay in character as a helpful campaign assistant
- If asked about rules or mechanics not in the knowledge base, you can provide general D&D knowledge but clarify it's not from the campaign
- Use wikilinks [[Entity Name]] when referring to entities that exist in the campaign`

export interface ChatOptions {
  isDM: boolean
  campaignName?: string
  settings?: CampaignSettings | null
}

export interface ChatResponse {
  content: string
  sources: SearchResult[]
}

/**
 * Generate a chat response using RAG with Claude
 */
export async function generateChatResponse(
  campaignId: string,
  userMessage: string,
  history: ChatMessage[],
  options: ChatOptions
): Promise<ChatResponse> {
  // Check if API key is configured
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      content: 'Chat is not configured. Please add ANTHROPIC_API_KEY to your environment variables.',
      sources: [],
    }
  }

  // Get campaign settings with defaults
  const settings = getCampaignSettings(options.settings)

  // Search for relevant chunks using campaign settings
  const chunks = await searchSimilarChunks(campaignId, userMessage, {
    limit: settings.search.resultLimit,
    threshold: settings.search.similarityThreshold,
    excludeDmOnly: !options.isDM,
  })

  // Build context from chunks
  const context = buildContext(chunks)

  // Build the system prompt with context
  const systemPrompt = `${SYSTEM_PROMPT}

Campaign: ${options.campaignName || 'Unknown Campaign'}

Context from campaign knowledge base:
${context}`

  // Prepare messages for Claude
  const messages: Anthropic.MessageParam[] = [
    // Include recent history
    ...history.slice(-10).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    {
      role: 'user',
      content: userMessage,
    },
  ]

  // Generate response with Claude
  const anthropic = getAnthropic()
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  })

  // Extract text from response
  const textContent = response.content.find((block) => block.type === 'text')
  const responseText = textContent?.type === 'text'
    ? textContent.text
    : 'I apologize, but I was unable to generate a response.'

  return {
    content: responseText,
    sources: chunks,
  }
}
