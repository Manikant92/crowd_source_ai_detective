import React from 'react'
import { useParams } from 'react-router-dom'
import { RealtimeProgressTracker } from '../components/RealtimeProgressTracker'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { ArrowLeft, Brain, Users, Eye, Zap } from 'lucide-react'
import { Link } from 'react-router-dom'

export function ClaimProcessingPage() {
  const { claimId } = useParams<{ claimId: string }>()

  if (!claimId) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Invalid Claim ID</h1>
          <Link to="/submit" className="text-blue-600 hover:underline">
            Submit a new claim
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link 
          to="/dashboard" 
          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dashboard
        </Link>
        
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Live Portia Processing
        </h1>
        <p className="text-gray-600 mb-4">
          Watch as our AI agents analyze your claim in real-time using the Portia SDK 
          multi-agent orchestration system.
        </p>
        
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            Claim ID: {claimId.slice(0, 8)}...
          </Badge>
        </div>
      </div>

      {/* Feature Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <Card className="border-blue-200">
          <CardContent className="pt-4 text-center">
            <Brain className="h-8 w-8 text-blue-600 mx-auto mb-2" />
            <h3 className="font-medium text-blue-800">Multi-Agent AI</h3>
            <p className="text-xs text-blue-600 mt-1">
              Sequential agent workflow with real-time tracking
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-green-200">
          <CardContent className="pt-4 text-center">
            <Users className="h-8 w-8 text-green-600 mx-auto mb-2" />
            <h3 className="font-medium text-green-800">Human Oversight</h3>
            <p className="text-xs text-green-600 mt-1">
              Clarifications requested when AI needs guidance
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-purple-200">
          <CardContent className="pt-4 text-center">
            <Zap className="h-8 w-8 text-purple-600 mx-auto mb-2" />
            <h3 className="font-medium text-purple-800">Web Retrieval</h3>
            <p className="text-xs text-purple-600 mt-1">
              60+ tools for comprehensive evidence collection
            </p>
          </CardContent>
        </Card>
        
        <Card className="border-orange-200">
          <CardContent className="pt-4 text-center">
            <Eye className="h-8 w-8 text-orange-600 mx-auto mb-2" />
            <h3 className="font-medium text-orange-800">Full Transparency</h3>
            <p className="text-xs text-orange-600 mt-1">
              Complete audit trail and PlanRunState visibility
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Real-time Progress Tracker */}
      <RealtimeProgressTracker 
        claimId={claimId} 
        onComplete={(result) => {
          console.log('Processing completed:', result)
        }}
      />

      {/* Footer Information */}
      <Card className="mt-8 border-gray-200 bg-gray-50">
        <CardContent className="pt-4">
          <h3 className="font-medium text-gray-800 mb-2">About Portia SDK Processing</h3>
          <p className="text-sm text-gray-600 mb-3">
            This demonstration showcases the full capabilities of the Portia SDK for building 
            transparent, auditable AI systems. The multi-agent workflow includes:
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium text-gray-700 mb-1">Agent Workflow:</h4>
              <ul className="space-y-1 text-gray-600">
                <li>1. Claim Parser - Extract verifiable claims</li>
                <li>2. Evidence Collector - Gather supporting data</li>
                <li>3. Confidence Assessor - Detect conflicts</li>
                <li>4. Report Generator - Create final analysis</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-medium text-gray-700 mb-1">Key Features:</h4>
              <ul className="space-y-1 text-gray-600">
                <li>• Real-time progress tracking</li>
                <li>• Human-in-the-loop clarifications</li>
                <li>• Complete audit trail transparency</li>
                <li>• Multi-source evidence validation</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
