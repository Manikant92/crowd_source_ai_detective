import React from 'react'
import { Routes, Route } from 'react-router-dom'
import { Header } from './components/layout/Header'
import { Home } from './pages/Home'
import { Dashboard } from './pages/Dashboard'
import { ClaimDetails } from './pages/ClaimDetails'
import { PortiaClaimSubmission } from './pages/PortiaClaimSubmission'
import { ClaimProcessingPage } from './pages/ClaimProcessingPage'
import { AuthPage } from './pages/AuthPage'
import { Reports } from './pages/Reports'
import { SubmitClaim } from './pages/SubmitClaim'
import { AuthProvider } from './contexts/AuthContext'
import { ErrorBoundary } from './components/ErrorBoundary'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 3,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
})

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <div className="min-h-screen bg-gray-50">
            <Header />
            <main>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/submit" element={<SubmitClaim />} />
                <Route path="/portia-submit" element={<PortiaClaimSubmission />} />
                <Route path="/claim/:claimId" element={<ClaimDetails />} />
                <Route path="/claim/:claimId/processing" element={<ClaimProcessingPage />} />
                <Route path="/reports" element={<Reports />} />
              </Routes>
            </main>
          </div>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

export default App
