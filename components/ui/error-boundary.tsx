'use client'

import React, { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCcw } from 'lucide-react'
import { Button } from './button'

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div className="flex flex-col items-center justify-center p-6 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="h-8 w-8 text-destructive mb-3" />
          <h3 className="text-lg font-semibold mb-1">Something went wrong</h3>
          <p className="text-sm text-muted-foreground mb-4 text-center">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={this.handleRetry}
            className="gap-2"
          >
            <RefreshCcw className="h-4 w-4" />
            Try again
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}

interface ChatErrorFallbackProps {
  error?: Error | null
  onRetry?: () => void
}

export function ChatErrorFallback({ error, onRetry }: ChatErrorFallbackProps) {
  return (
    <div className="flex flex-col items-center justify-center p-8 h-full min-h-[300px] bg-card/50 rounded-lg border">
      <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
      <h3 className="text-lg font-semibold mb-2">Chat Unavailable</h3>
      <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
        {error?.message || 'Unable to connect to the chat service. Please try again.'}
      </p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCcw className="h-4 w-4" />
          Reconnect
        </Button>
      )}
    </div>
  )
}

export function GraphErrorFallback({ error, onRetry }: { error?: Error | null; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 h-full min-h-[400px] bg-card/50 rounded-lg border">
      <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
      <h3 className="text-lg font-semibold mb-2">Knowledge Graph Error</h3>
      <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
        {error?.message || 'Unable to render the knowledge graph. This may be due to invalid data.'}
      </p>
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="gap-2">
          <RefreshCcw className="h-4 w-4" />
          Reload Graph
        </Button>
      )}
    </div>
  )
}
