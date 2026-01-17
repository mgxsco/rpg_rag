import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { AIModel, getModelProvider } from '@/lib/db/schema'

// Map deprecated model names to current ones
const MODEL_ALIASES: Record<string, string> = {
  'gemini-2.5-flash-preview-05-20': 'gemini-3-flash-preview',
  'gemini-2.0-flash-exp': 'gemini-2.5-flash',
}

function normalizeModelName(model: string): string {
  return MODEL_ALIASES[model] || model
}

// Lazy-initialize clients
let anthropicClient: Anthropic | null = null
let googleClient: GoogleGenerativeAI | null = null

function getAnthropicClient(): Anthropic {
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

function getGoogleClient(): GoogleGenerativeAI {
  // Support both GEMINI_API_KEY and GOOGLE_API_KEY
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured')
  }
  if (!googleClient) {
    googleClient = new GoogleGenerativeAI(apiKey)
  }
  return googleClient
}

export interface GenerateOptions {
  model: AIModel
  systemPrompt: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens?: number
  temperature?: number
}

export interface GenerateResult {
  content: string
  model: AIModel
  provider: 'anthropic' | 'google'
}

/**
 * Generate a response using the specified AI model
 * Handles both Anthropic (Claude) and Google (Gemini) models
 */
export async function generateResponse(options: GenerateOptions): Promise<GenerateResult> {
  const provider = getModelProvider(options.model)

  if (provider === 'google') {
    return generateWithGemini(options)
  } else {
    return generateWithClaude(options)
  }
}

async function generateWithClaude(options: GenerateOptions): Promise<GenerateResult> {
  const anthropic = getAnthropicClient()

  const response = await anthropic.messages.create({
    model: options.model,
    max_tokens: options.maxTokens ?? 1024,
    temperature: options.temperature ?? 0.7,
    system: options.systemPrompt,
    messages: options.messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
  })

  const textContent = response.content.find((block) => block.type === 'text')
  const content = textContent?.type === 'text' ? textContent.text : ''

  return {
    content,
    model: options.model,
    provider: 'anthropic',
  }
}

async function generateWithGemini(options: GenerateOptions): Promise<GenerateResult> {
  const google = getGoogleClient()
  // Normalize model name to handle deprecated aliases
  const modelName = normalizeModelName(options.model)
  const model = google.getGenerativeModel({
    model: modelName,
    // System instruction must be a Content object
    systemInstruction: {
      role: 'user',
      parts: [{ text: options.systemPrompt }],
    },
    generationConfig: {
      maxOutputTokens: options.maxTokens ?? 1024,
      temperature: options.temperature ?? 0.7,
    },
  })

  // Build conversation history for Gemini
  // Gemini uses a different format: contents with parts
  const history = options.messages.slice(0, -1).map((msg) => ({
    role: msg.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: msg.content }],
  }))

  const lastMessage = options.messages[options.messages.length - 1]

  // Start chat with history
  const chat = model.startChat({
    history: history as any,
  })

  const result = await chat.sendMessage(lastMessage.content)
  const response = result.response
  const content = response.text()

  return {
    content,
    model: options.model,
    provider: 'google',
  }
}

/**
 * Simple single-turn generation (useful for extraction)
 */
export async function generateSimple(
  model: AIModel,
  systemPrompt: string,
  userMessage: string,
  maxTokens?: number
): Promise<string> {
  const result = await generateResponse({
    model,
    systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens,
  })
  return result.content
}
