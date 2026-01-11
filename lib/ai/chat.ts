import OpenAI from 'openai'
import { searchSimilarChunks, buildContext } from './rag'
import { ChatMessage, SearchResult } from '@/lib/types'

// Lazy-initialize OpenAI client to avoid build errors
let openaiClient: OpenAI | null = null

function getOpenAI(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openaiClient
}

const SYSTEM_PROMPT = `You are a helpful D&D campaign assistant. Your role is to answer questions about the campaign based on the provided context from campaign notes.

Guidelines:
- Answer questions based ONLY on the provided context
- If the answer isn't in the context, say you don't have that information in the campaign notes
- Be concise but thorough
- When referencing information, mention which source it came from
- Stay in character as a helpful campaign assistant
- If asked about rules or mechanics not in the notes, you can provide general D&D knowledge but clarify it's not from the campaign notes`

export interface ChatOptions {
  isDM: boolean
  campaignName?: string
}

export interface ChatResponse {
  content: string
  sources: SearchResult[]
}

/**
 * Generate a chat response using RAG
 */
export async function generateChatResponse(
  campaignId: string,
  userMessage: string,
  history: ChatMessage[],
  options: ChatOptions
): Promise<ChatResponse> {
  // Search for relevant chunks
  const chunks = await searchSimilarChunks(campaignId, userMessage, {
    limit: 8,
    excludeDmOnly: !options.isDM,
  })

  // Build context from chunks
  const context = buildContext(chunks)

  // Prepare messages for OpenAI
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: `${SYSTEM_PROMPT}

Campaign: ${options.campaignName || 'Unknown Campaign'}

Context from campaign notes:
${context}`,
    },
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

  // Generate response
  const openai = getOpenAI()
  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    temperature: 0.7,
    max_tokens: 1000,
  })

  return {
    content: response.choices[0].message.content || 'I apologize, but I was unable to generate a response.',
    sources: chunks,
  }
}
