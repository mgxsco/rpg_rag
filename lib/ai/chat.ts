import { searchSimilarChunks, buildContext } from './rag'
import { ChatMessage, SearchResult } from '@/lib/types'
import { getCampaignSettings, DEFAULT_PROMPTS } from '@/lib/campaign-settings'
import type { CampaignSettings } from '@/lib/db/schema'
import { generateResponse } from './client'

export interface ChatOptions {
  isDM: boolean
  campaignName?: string
  settings?: CampaignSettings | null
  systemPromptOverride?: string // Optional override for the system prompt
  skipRag?: boolean // Skip RAG search and use provided context directly
}

export interface ChatResponse {
  content: string
  sources: SearchResult[]
}

/**
 * Generate a chat response using RAG with the configured AI model
 */
export async function generateChatResponse(
  campaignId: string,
  userMessage: string,
  history: ChatMessage[],
  options: ChatOptions
): Promise<ChatResponse> {
  // Get campaign settings with defaults
  const settings = getCampaignSettings(options.settings)

  // Search for relevant chunks using campaign settings (unless skipRag is true)
  let chunks: SearchResult[] = []
  let context = ''

  if (!options.skipRag) {
    chunks = await searchSimilarChunks(campaignId, userMessage, {
      limit: settings.search.resultLimit,
      threshold: settings.search.similarityThreshold,
      excludeDmOnly: !options.isDM,
    })
    context = buildContext(chunks)
  }

  // Get the custom or default system prompt
  const baseSystemPrompt = options.systemPromptOverride ||
    settings.prompts.chatSystemPrompt ||
    DEFAULT_PROMPTS.chatSystemPrompt

  // Build the system prompt with context
  const systemPrompt = `${baseSystemPrompt}

Campaign: ${options.campaignName || 'Unknown Campaign'}
${context ? `\nContext from campaign knowledge base:\n${context}` : ''}`

  // Prepare messages
  const messages = [
    // Include recent history
    ...history.slice(-10).map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    {
      role: 'user' as const,
      content: userMessage,
    },
  ]

  // Generate response using the unified client
  const response = await generateResponse({
    model: settings.model.chatModel,
    systemPrompt,
    messages,
    maxTokens: settings.model.maxTokens,
    temperature: settings.model.temperature,
  })

  return {
    content: response.content || 'I apologize, but I was unable to generate a response.',
    sources: chunks,
  }
}
