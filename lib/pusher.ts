import Pusher from 'pusher'
import PusherClient from 'pusher-js'

// Server-side Pusher instance (for triggering events)
let pusherServer: Pusher | null = null

export function getPusherServer(): Pusher {
  if (!pusherServer) {
    if (!process.env.PUSHER_APP_ID || !process.env.PUSHER_KEY || !process.env.PUSHER_SECRET || !process.env.PUSHER_CLUSTER) {
      throw new Error('Pusher server environment variables are not configured')
    }
    pusherServer = new Pusher({
      appId: process.env.PUSHER_APP_ID,
      key: process.env.PUSHER_KEY,
      secret: process.env.PUSHER_SECRET,
      cluster: process.env.PUSHER_CLUSTER,
      useTLS: true,
    })
  }
  return pusherServer
}

// Client-side Pusher instance (for subscribing to channels)
let pusherClient: PusherClient | null = null

export function getPusherClient(): PusherClient {
  if (!pusherClient) {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER

    if (!key || !cluster) {
      throw new Error('Pusher client environment variables are not configured')
    }

    pusherClient = new PusherClient(key, {
      cluster,
    })
  }
  return pusherClient
}

// Channel name helper
export function getCampaignChannelName(campaignId: string): string {
  return `campaign-${campaignId}`
}

// Event names
export const PUSHER_EVENTS = {
  NEW_MESSAGE: 'new-message',
  MESSAGE_DELETED: 'message-deleted',
  MEMBER_JOINED: 'member-joined',
  MEMBER_LEFT: 'member-left',
} as const
