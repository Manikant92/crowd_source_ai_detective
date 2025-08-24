import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Textarea } from '../components/ui/textarea'
import { Label } from '../components/ui/label'
import { Badge } from '../components/ui/badge'
import { AlertCircle, Plus, Link2, Upload, Brain, Zap, Shield } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toast } from '../hooks/use-toast'
import { useAuth } from '../contexts/AuthContext'

export function PortiaClaimSubmission() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [claimData, setClaimData] = useState({
    claim_text: '',
    source_urls: [''],
    claim_type: 'text',
    tags: [] as string[],
    enable_portia_workflow: true,
    enable_human_clarifications: true,
    enable_web_retrieval: true
  })

  const addSourceUrl = () => {
    setClaimData(prev => ({
      ...prev,
      source_urls: [...prev.source_urls, '']
    }))
  }

  const updateSourceUrl = (index: number, value: string) => {
    setClaimData(prev => ({
      ...prev,
      source_urls: prev.source_urls.map((url, i) => i === index ? value : url)
    }))
  }

  const removeSourceUrl = (index: number) => {
    setClaimData(prev => ({
      ...prev,
      source_urls: prev.source_urls.filter((_, i) => i !== index)
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!claimData.claim_text.trim()) {
      toast({
        title: "Error",
        description: "Please enter a claim to fact-check.",
        variant: "destructive"
      })
      return
    }

    if (claimData.claim_text.length < 10) {
      toast({
        title: "Error",
        description: "Claim must be at least 10 characters long.",
        variant: "destructive"
      })
      return
    }

    setIsSubmitting(true)

    try {
      // Submit claim to database first
      const { data: claimResult, error: claimError } = await supabase
        .from('claims')
        .insert({
          submitter_id: user?.id,
          claim_text: claimData.claim_text.trim(),
          claim_type: claimData.claim_type,
          source_urls: JSON.stringify(claimData.source_urls.filter(url => url.trim())),
          tags: JSON.stringify(claimData.tags),
          status: 'pending',
          submitted_at: new Date().toISOString(),
          last_updated: new Date().toISOString(),
          claim_metadata: {
            portia_enabled: claimData.enable_portia_workflow,
            human_clarifications_enabled: claimData.enable_human_clarifications,
            web_retrieval_enabled: claimData.enable_web_retrieval,
            submission_source: 'enhanced_ui'
          }
        })
        .select()
        .single()

      if (claimError) {
        throw new Error(claimError.message)
      }

      const claimId = claimResult.id

      // Trigger Portia processing
      const processingResponse = await fetch(
        `https://yyxwxdecgakktmdhbjiv.supabase.co/functions/v1/portia-process-claim`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5eHd4ZGVjZ2Fra3RtZGhiaml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU3MDU2MTIsImV4cCI6MjA3MTI4MTYxMn0.U84GvKEHwxMdiX5_8j-UiDmAXntBo7iOpFu_7zvZJuA`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            claim_id: claimId,
            claim_text: claimData.claim_text.trim(),
            source_urls: claimData.source_urls.filter(url => url.trim()),
            claim_type: claimData.claim_type,
            user_id: user?.id,
            trigger_full_workflow: claimData.enable_portia_workflow,
            portia_options: {
              enable_human_clarifications: claimData.enable_human_clarifications,
              enable_web_retrieval: claimData.enable_web_retrieval,
              max_evidence_items: 50,
              confidence_threshold: 0.7
            }
          })
        }
      )

      if (!processingResponse.ok) {
        const errorData = await processingResponse.json()
        throw new Error(errorData.error?.message || 'Failed to start processing')
      }

      const processingResult = await processingResponse.json()
      
      toast({
        title: "Claim Submitted Successfully!",
        description: `Processing started with Portia multi-agent workflow. Claim ID: ${claimId.slice(0, 8)}...`
      })

      // Navigate to real-time tracking page
      navigate(`/claim/${claimId}/processing`)

    } catch (error) {
      console.error('Submission error:', error)
      toast({
        title: "Submission Failed",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Submit Claim for AI Detective Analysis
        </h1>
        <p className="text-gray-600 mb-4">
          Submit your claim for comprehensive fact-checking using our Portia SDK-powered 
          multi-agent system with real-time processing and human-in-the-loop clarifications.
        </p>
        
        {/* Portia Features Highlight */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="h-5 w-5 text-blue-600" />
                <span className="font-medium text-blue-800">Multi-Agent AI</span>
              </div>
              <p className="text-sm text-blue-600">
                Claim Parser → Evidence Collector → Report Generator
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800">Human Oversight</span>
              </div>
              <p className="text-sm text-green-600">
                AI requests human clarification when conflicts detected
              </p>
            </CardContent>
          </Card>
          
          <Card className="border-purple-200 bg-purple-50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-5 w-5 text-purple-600" />
                <span className="font-medium text-purple-800">60+ Web Tools</span>
              </div>
              <p className="text-sm text-purple-600">
                Comprehensive evidence collection from multiple sources
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Main Claim Input */}
        <Card>
          <CardHeader>
            <CardTitle>Claim Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="claim-text">Claim to Fact-Check</Label>
              <Textarea
                id="claim-text"
                placeholder="Enter the claim you want to fact-check... (minimum 10 characters)"
                value={claimData.claim_text}
                onChange={(e) => setClaimData(prev => ({ ...prev, claim_text: e.target.value }))}
                className="min-h-32 mt-1"
                required
              />
              <div className="text-sm text-gray-500 mt-1">
                {claimData.claim_text.length} / 2000 characters
              </div>
            </div>

            <div>
              <Label htmlFor="claim-type">Claim Type</Label>
              <select
                id="claim-type"
                value={claimData.claim_type}
                onChange={(e) => setClaimData(prev => ({ ...prev, claim_type: e.target.value }))}
                className="w-full p-2 border border-gray-300 rounded-md mt-1"
              >
                <option value="text">Text Claim</option>
                <option value="url">URL/Link</option>
                <option value="image">Image Claim</option>
                <option value="video">Video Claim</option>
                <option value="mixed">Mixed Content</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Source URLs */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-5 w-5" />
              Source URLs (Optional)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {claimData.source_urls.map((url, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  type="url"
                  placeholder="https://example.com/source"
                  value={url}
                  onChange={(e) => updateSourceUrl(index, e.target.value)}
                  className="flex-1"
                />
                {claimData.source_urls.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeSourceUrl(index)}
                  >
                    Remove
                  </Button>
                )}
              </div>
            ))}
            
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSourceUrl}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Add Source URL
            </Button>
          </CardContent>
        </Card>

        {/* Portia Configuration */}
        <Card>
          <CardHeader>
            <CardTitle>AI Processing Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={claimData.enable_portia_workflow}
                  onChange={(e) => setClaimData(prev => ({ ...prev, enable_portia_workflow: e.target.checked }))}
                  className="w-4 h-4"
                />
                <div>
                  <span className="font-medium">Enable Portia Multi-Agent Workflow</span>
                  <p className="text-sm text-gray-600">
                    Use advanced AI agents for comprehensive claim analysis
                  </p>
                </div>
              </label>
              
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={claimData.enable_human_clarifications}
                  onChange={(e) => setClaimData(prev => ({ ...prev, enable_human_clarifications: e.target.checked }))}
                  className="w-4 h-4"
                />
                <div>
                  <span className="font-medium">Enable Human Clarifications</span>
                  <p className="text-sm text-gray-600">
                    Request human input when AI detects conflicts or low confidence
                  </p>
                </div>
              </label>
              
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={claimData.enable_web_retrieval}
                  onChange={(e) => setClaimData(prev => ({ ...prev, enable_web_retrieval: e.target.checked }))}
                  className="w-4 h-4"
                />
                <div>
                  <span className="font-medium">Enable Web Evidence Collection</span>
                  <p className="text-sm text-gray-600">
                    Use 60+ web browsing tools to gather supporting/contradicting evidence
                  </p>
                </div>
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Processing Notice */}
        {claimData.enable_portia_workflow && (
          <Card className="border-blue-200 bg-blue-50">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-medium text-blue-800 mb-1">
                    Enhanced Processing Enabled
                  </h4>
                  <p className="text-sm text-blue-600 mb-2">
                    Your claim will be processed through our complete Portia SDK workflow:
                  </p>
                  <ul className="text-sm text-blue-600 space-y-1 ml-4">
                    <li>• Claim parsing and entity extraction</li>
                    <li>• Multi-source evidence collection</li>
                    <li>• Confidence assessment and conflict detection</li>
                    <li>• Human clarification requests (if needed)</li>
                    <li>• Comprehensive report generation</li>
                  </ul>
                  <p className="text-sm text-blue-600 mt-2">
                    <strong>Estimated processing time:</strong> 2-5 minutes
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit Button */}
        <div className="flex justify-center">
          <Button
            type="submit"
            disabled={isSubmitting || !claimData.claim_text.trim()}
            size="lg"
            className="px-8 py-3"
          >
            {isSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Processing...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Submit for AI Analysis
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
