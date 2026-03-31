import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as AntdApp } from 'antd'
import { QueryClientProvider } from '@tanstack/react-query'
import './styles/index.css'
import { AppRouter } from './app/router'
import { ThemeProvider } from './ThemeProvider'
import { queryClient } from './lib/query-client'

interface RootErrorBoundaryProps {
  children: ReactNode
}

interface RootErrorBoundaryState {
  hasError: boolean
  message: string
}

class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
  state: RootErrorBoundaryState = {
    hasError: false,
    message: '',
  }

  static getDerivedStateFromError(error: unknown): RootErrorBoundaryState {
    const message = error instanceof Error ? error.stack ?? error.message : String(error)
    return {
      hasError: true,
      message,
    }
  }

  componentDidCatch(error: unknown, errorInfo: ErrorInfo) {
    console.error('Root render crashed', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main style={{ padding: 24, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
          <h1 style={{ color: '#b91c1c', marginBottom: 12 }}>App boot failed</h1>
          <p style={{ marginBottom: 12 }}>Open DevTools Console for full details.</p>
          <pre
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              background: '#111827',
              color: '#fecaca',
              borderRadius: 8,
              padding: 12,
            }}
          >
            {this.state.message || 'Unknown root error'}
          </pre>
        </main>
      )
    }
    return this.props.children
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AntdApp>
            <AppRouter />
          </AntdApp>
        </ThemeProvider>
      </QueryClientProvider>
    </RootErrorBoundary>
  </StrictMode>,
)
