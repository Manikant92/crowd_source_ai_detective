import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Progress } from '../components/ui/progress'
import { AlertTriangle, CheckCircle, Clock, Brain, Search, FileText, Users, Eye } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toast } from '../hooks/use-toast'

interface AgentStep {
  step_name: string
  agent_type: string
  status: string
  confidence_score?: number
  execution_time_ms?: number
  started_at?: string
  completed_at?: string
}

interface ClarificationRequest {
  request_id: string
  title: string
  description: string
  priority: string
  options?: Array<{ value: string; label: string }>
  context_data?: any
  expires_at: string
}

interface RealtimeProgressProps {
  claimId: string
  onComplete?: (result: any) => void
}

export function RealtimeProgressTracker({ claimId, onComplete }: RealtimeProgressProps) {
  const [progress, setProgress] = useState(0)
  const [currentStatus, setCurrentStatus] = useState('initializing')
  const [currentAgent, setCurrentAgent] = useState<string | null>(null)
  const [agentSteps, setAgentSteps] = useState<AgentStep[]>([])
  const [clarifications, setClarifications] = useState<ClarificationRequest[]>([])
  const [auditTrail, setAuditTrail] = useState<any[]>([])
  const [evidenceCount, setEvidenceCount] = useState(0)
  const [confidenceMetrics, setConfidenceMetrics] = useState<any>({})
  const [isComplete, setIsComplete] = useState(false)

  useEffect(() => {
    let progressInterval: NodeJS.Timeout
    
    const fetchProgress = async () => {
      try {
        const response = await fetch(
          `https://yyxwxdecgakktmdhbjiv.supabase.co/functions/v1/realtime-progress?claim_id=${claimId}&action=status`,
          {
            headers: {
              'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5eHd4ZGVjZ2Fra3RtZGhiaml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU3MDU2MTIsImV4cCI6MjA3MTI4MTYxMn0.U84GvKEHwxMdiX5_8j-UiDmAXntBo7iOpFu_7zvZJuA`,
              'Content-Type': 'application/json'
            }
          }
        )

        if (response.ok) {
          const data = await response.json()
          
          setProgress(data.status.progress_percentage || 0)
          setCurrentStatus(data.status.current_status || 'processing')
          setCurrentAgent(data.status.current_agent)
          setClarifications(data.clarifications.pending_requests || [])
          setEvidenceCount(data.evidence_summary?.total_items || 0)
          setConfidenceMetrics(data.confidence_metrics || {})
          
          if (data.status.current_status === 'completed') {
            setIsComplete(true)
            clearInterval(progressInterval)
            onComplete?.(data)
          }
        }
      } catch (error) {
        console.error('Error fetching progress:', error)
      }
    }

    const fetchWorkflowSteps = async () => {
      try {
        const { data, error } = await supabase
          .from('agent_workflows')
          .select('*')
          .eq('claim_id', claimId)
          .order('step_index', { ascending: true })

        if (!error && data) {
          setAgentSteps(data)
        }
      } catch (error) {
        console.error('Error fetching workflow steps:', error)
      }
    }

    const fetchAuditTrail = async () => {
      try {
        const { data, error } = await supabase
          .from('audit_events')
          .select('*')
          .eq('claim_id', claimId)
          .order('timestamp', { ascending: false })
          .limit(10)

        if (!error && data) {
          setAuditTrail(data)
        }
      } catch (error) {
        console.error('Error fetching audit trail:', error)
      }
    }

    // Initial fetch
    fetchProgress()
    fetchWorkflowSteps()
    fetchAuditTrail()

    // Set up real-time polling
    progressInterval = setInterval(fetchProgress, 2000) // Poll every 2 seconds

    // Set up real-time subscriptions for database changes
    const workflowSubscription = supabase
      .channel(`workflow_${claimId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'agent_workflows',
          filter: `claim_id=eq.${claimId}`
        },
        () => {
          fetchWorkflowSteps()
        }
      )
      .subscribe()

    const auditSubscription = supabase
      .channel(`audit_${claimId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_events',
          filter: `claim_id=eq.${claimId}`
        },
        () => {
          fetchAuditTrail()
        }
      )
      .subscribe()

    return () => {
      clearInterval(progressInterval)
      workflowSubscription.unsubscribe()
      auditSubscription.unsubscribe()
    }
  }, [claimId, onComplete])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-500" />
      case 'running':
        return <Brain className="h-5 w-5 text-blue-500 animate-pulse" />
      case 'awaiting_clarification':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />
      default:
        return <Clock className="h-5 w-5 text-gray-400" />
    }
  }

  const getAgentIcon = (agentType: string) => {
    switch (agentType) {
      case 'claim_parser':
        return <FileText className="h-4 w-4" />
      case 'evidence_collector':
        return <Search className="h-4 w-4" />
      case 'confidence_assessor':
        return <Brain className="h-4 w-4" />
      case 'report_generator':
        return <FileText className="h-4 w-4" />
      default:
        return <Brain className="h-4 w-4" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-500'
      case 'running':
        return 'bg-blue-500'
      case 'awaiting_clarification':
        return 'bg-yellow-500'
      case 'failed':
        return 'bg-red-500'
      default:
        return 'bg-gray-300'
    }
  }

  return (
    <div className="space-y-6">
      {/* Overall Progress */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {getStatusIcon(currentStatus)}
            Portia Multi-Agent Processing
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Status:</span>
                <Badge variant="outline" className="ml-2">
                  {currentStatus.replace('_', ' ')}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Current Agent:</span>
                <div className="ml-2 font-medium">{currentAgent || 'None'}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Evidence Items:</span>
                <div className="ml-2 font-medium">{evidenceCount}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Clarifications:</span>
                <div className="ml-2 font-medium">{clarifications.length}</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agent Workflow Steps */}
      <Card>
        <CardHeader>
          <CardTitle>Agent Workflow Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {agentSteps.map((step, index) => (
              <div key={step.step_name} className="flex items-center gap-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-gray-200">
                  <span className="text-sm font-medium">{index + 1}</span>
                </div>
                
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    {getAgentIcon(step.agent_type)}
                    <span className="font-medium">{step.step_name.replace('_', ' ')}</span>
                    <Badge 
                      variant={step.status === 'completed' ? 'default' : 'outline'}
                      className={`${step.status === 'running' ? 'animate-pulse' : ''}`}
                    >
                      {step.status}
                    </Badge>
                  </div>
                  
                  {step.status === 'running' && (
                    <div className="w-full bg-gray-200 rounded-full h-1.5">
                      <div className="bg-blue-500 h-1.5 rounded-full animate-pulse" style={{width: '60%'}} />
                    </div>
                  )}
                  
                  {step.confidence_score && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Confidence: {(step.confidence_score * 100).toFixed(1)}%
                    </div>
                  )}
                </div>
                
                <div className={`w-3 h-3 rounded-full ${getStatusColor(step.status)}`} />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Active Clarifications */}
      {clarifications.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Human Clarification Required
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {clarifications.map((clarification) => (
                <div key={clarification.request_id} className="p-4 border rounded-lg">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium">{clarification.title}</h4>
                    <Badge 
                      variant={clarification.priority === 'high' ? 'destructive' : 'secondary'}
                    >
                      {clarification.priority}
                    </Badge>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mb-3">
                    {clarification.description}
                  </p>
                  
                  {clarification.options && (
                    <div className="space-y-2">
                      {clarification.options.map((option, idx) => (
                        <Button 
                          key={idx}
                          variant="outline" 
                          size="sm" 
                          className="mr-2 mb-2"
                          onClick={() => {
                            // Handle clarification response
                            toast({
                              title: "Clarification Submitted",
                              description: `Selected: ${option.label}`
                            })
                          }}
                        >
                          {option.label}
                        </Button>
                      ))}
                    </div>
                  )}
                  
                  <div className="text-xs text-muted-foreground mt-2">
                    Expires: {new Date(clarification.expires_at).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Confidence Metrics */}
      {Object.keys(confidenceMetrics).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>AI Confidence Assessment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {Object.entries(confidenceMetrics).map(([metric, value]) => (
                <div key={metric} className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {typeof value === 'number' ? (value * 100).toFixed(1) + '%' : String(value)}
                  </div>
                  <div className="text-sm text-muted-foreground capitalize">
                    {metric.replace('_', ' ')}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Audit Trail */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Live Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {auditTrail.map((event, index) => (
              <div key={event.id} className="flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-blue-500 mt-2 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{event.event_type.replace('_', ' ')}</span>
                    {event.agent_type && (
                      <Badge variant="outline" className="text-xs">
                        {event.agent_type}
                      </Badge>
                    )}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {new Date(event.timestamp).toLocaleString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Completion State */}
      {isComplete && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-green-800 mb-2">
                Multi-Agent Processing Complete!
              </h3>
              <p className="text-green-600 mb-4">
                The Portia SDK has successfully analyzed your claim through all agent workflows.
              </p>
              <Button 
                onClick={() => window.location.href = `/claim/${claimId}`}
                className="bg-green-600 hover:bg-green-700"
              >
                View Detailed Report
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
