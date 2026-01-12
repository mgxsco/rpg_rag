import Anthropic from '@anthropic-ai/sdk'
import { searchSimilarChunks, buildContext } from './rag'
import { ChatMessage, SearchResult } from '@/lib/types'
import { getCampaignSettings, DEFAULT_SETTINGS, DEFAULT_PROMPTS } from '@/lib/campaign-settings'
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

  // Get the custom or default system prompt
  const baseSystemPrompt = settings.prompts.chatSystemPrompt || DEFAULT_PROMPTS.chatSystemPrompt

  // Build the system prompt with context
  const systemPrompt = `${baseSystemPrompt}

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
