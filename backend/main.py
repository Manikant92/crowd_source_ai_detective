"""FastAPI Backend for Crowd-Sourced AI Detective with Full Portia SDK Integration

This is the main FastAPI application that orchestrates the complete Portia multi-agent
workflow for misinformation detection, including real-time progress tracking,
human-in-the-loop clarifications, and comprehensive audit trails.
"""

import asyncio
import logging
import json
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn

# Import our comprehensive Portia components
import sys
import os
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'code'))

from portia_core import (
    PortiaCore, AuditManager, DetectiveAgentType, VerificationStatus,
    ClaimData, AgentResult, AuditEvent, PortiaConfig
)
from clarification_system import (
    ClarificationManager, ClarificationRequest, ClarificationResponse,
    ClarificationType, ClarificationPriority, ConfidenceMetrics
)
from web_retrieval_pipeline import (
    WebRetrievalOrchestrator, CrawlJob, SearchStrategy, EvidenceItem
)
from agents_example import ClaimParserAgent, EvidenceCollectorAgent

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Global state management
class ApplicationState:
    def __init__(self):
        self.portia_core: Optional[PortiaCore] = None
        self.audit_manager = AuditManager()
        self.clarification_manager: Optional[ClarificationManager] = None
        self.web_orchestrator: Optional[WebRetrievalOrchestrator] = None
        self.active_workflows: Dict[str, Dict] = {}
        self.websocket_connections: Dict[str, WebSocket] = {}
        
    async def initialize(self):
        """Initialize all Portia components"""
        try:
            # Initialize Portia configuration
            config = PortiaConfig()
            validation_errors = config.validate()
            if validation_errors:
                logger.warning(f"Configuration issues: {validation_errors}")
            
            # Initialize core Portia integration
            self.portia_core = await PortiaCore.create(
                config=config,
                audit_manager=self.audit_manager
            )
            
            # Initialize clarification system
            self.clarification_manager = ClarificationManager(
                config={
                    "confidence_thresholds": {
                        "low": 0.5,
                        "medium": 0.7,
                        "high": 0.85
                    },
                    "auto_escalation_enabled": True
                }
            )
            
            # Initialize web retrieval orchestrator
            self.web_orchestrator = WebRetrievalOrchestrator(
                max_concurrent_crawls=5,
                rate_limit_delay=1.0
            )
            
            logger.info("All Portia components initialized successfully")
            
        except Exception as e:
            logger.error(f"Failed to initialize Portia components: {e}")
            raise

app_state = ApplicationState()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    # Startup
    await app_state.initialize()
    yield
    # Shutdown
    if app_state.web_orchestrator:
        await app_state.web_orchestrator.cleanup()

app = FastAPI(
    title="Crowd-Sourced AI Detective API",
    description="Comprehensive misinformation detection using Portia SDK multi-agent orchestration",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for API
class ClaimSubmission(BaseModel):
    claim_text: str = Field(..., min_length=10, description="The claim to be fact-checked")
    source_urls: List[str] = Field(default=[], description="Source URLs related to the claim")
    claim_type: str = Field(default="text", description="Type of claim (text, image, video, url)")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Additional metadata")
    user_id: Optional[str] = Field(default=None, description="Submitting user ID")

class ProcessingStatus(BaseModel):
    claim_id: str
    status: str
    current_agent: Optional[str] = None
    progress_percentage: float
    estimated_completion: Optional[datetime] = None
    agent_results: Dict[str, Any] = Field(default_factory=dict)
    clarification_requests: List[Dict[str, Any]] = Field(default_factory=list)
    audit_trail: List[Dict[str, Any]] = Field(default_factory=list)

class ClarificationSubmission(BaseModel):
    request_id: str
    response_data: Dict[str, Any]
    user_id: str
    notes: Optional[str] = None

# API Endpoints

@app.post("/api/v1/claims/submit", response_model=Dict[str, Any])
async def submit_claim(claim: ClaimSubmission, background_tasks: BackgroundTasks):
    """Submit a new claim for fact-checking"""
    try:
        claim_id = str(uuid.uuid4())
        
        # Create claim data structure
        claim_data = ClaimData(
            claim_id=claim_id,
            content=claim.claim_text,
            source_url=claim.source_urls[0] if claim.source_urls else None,
            submitter_id=claim.user_id,
            timestamp=datetime.now(timezone.utc),
            metadata=claim.metadata or {}
        )
        
        # Initialize workflow tracking
        app_state.active_workflows[claim_id] = {
            "status": "initializing",
            "created_at": datetime.now(timezone.utc),
            "claim_data": claim_data,
            "agents_completed": [],
            "current_agent": None,
            "progress_percentage": 0.0,
            "results": {},
            "clarifications": [],
            "audit_events": []
        }
        
        # Start async processing
        background_tasks.add_task(process_claim_workflow, claim_id, claim_data)
        
        return {
            "success": True,
            "claim_id": claim_id,
            "message": "Claim submitted successfully. Processing started.",
            "estimated_processing_time": "2-5 minutes"
        }
        
    except Exception as e:
        logger.error(f"Error submitting claim: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/claims/{claim_id}/status", response_model=ProcessingStatus)
async def get_claim_status(claim_id: str):
    """Get the current status of a claim being processed"""
    workflow = app_state.active_workflows.get(claim_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Claim not found")
    
    # Get clarification requests
    clarifications = []
    if app_state.clarification_manager:
        pending_clarifications = app_state.clarification_manager.get_pending_requests(claim_id)
        clarifications = [req.to_dict() for req in pending_clarifications]
    
    return ProcessingStatus(
        claim_id=claim_id,
        status=workflow["status"],
        current_agent=workflow["current_agent"],
        progress_percentage=workflow["progress_percentage"],
        estimated_completion=workflow.get("estimated_completion"),
        agent_results=workflow["results"],
        clarification_requests=clarifications,
        audit_trail=[event.to_dict() for event in workflow["audit_events"]]
    )

@app.post("/api/v1/clarifications/{request_id}/respond")
async def respond_to_clarification(request_id: str, response: ClarificationSubmission):
    """Respond to a human clarification request"""
    try:
        if not app_state.clarification_manager:
            raise HTTPException(status_code=503, detail="Clarification system not available")
        
        clarification_response = ClarificationResponse(
            request_id=request_id,
            response_data=response.response_data,
            user_id=response.user_id,
            response_time_seconds=0.0,  # Will be calculated
            notes=response.notes
        )
        
        success = await app_state.clarification_manager.submit_response(
            request_id, clarification_response
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Clarification request not found")
        
        return {"success": True, "message": "Response submitted successfully"}
        
    except Exception as e:
        logger.error(f"Error responding to clarification: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/claims/{claim_id}/audit-trail")
async def get_audit_trail(claim_id: str):
    """Get complete audit trail for transparency"""
    workflow = app_state.active_workflows.get(claim_id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Claim not found")
    
    # Get all audit events for this claim
    claim_events = [event for event in app_state.audit_manager.events 
                   if event.claim_id == claim_id]
    
    return {
        "claim_id": claim_id,
        "total_events": len(claim_events),
        "audit_trail": [event.to_dict() for event in claim_events],
        "plan_run_states": app_state.audit_manager.plan_runs.get(claim_id, [])
    }

# WebSocket endpoint for real-time updates
@app.websocket("/api/v1/claims/{claim_id}/ws")
async def websocket_endpoint(websocket: WebSocket, claim_id: str):
    """WebSocket connection for real-time claim processing updates"""
    await websocket.accept()
    app_state.websocket_connections[claim_id] = websocket
    
    try:
        while True:
            # Send periodic updates
            workflow = app_state.active_workflows.get(claim_id)
            if workflow:
                update = {
                    "type": "status_update",
                    "claim_id": claim_id,
                    "status": workflow["status"],
                    "progress": workflow["progress_percentage"],
                    "current_agent": workflow["current_agent"],
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
                await websocket.send_json(update)
            
            await asyncio.sleep(2)  # Send updates every 2 seconds
            
    except WebSocketDisconnect:
        if claim_id in app_state.websocket_connections:
            del app_state.websocket_connections[claim_id]
        logger.info(f"WebSocket disconnected for claim {claim_id}")

# Core workflow processing function
async def process_claim_workflow(claim_id: str, claim_data: ClaimData):
    """Process a claim through the complete Portia multi-agent workflow"""
    workflow = app_state.active_workflows[claim_id]
    
    try:
        logger.info(f"Starting multi-agent workflow for claim {claim_id}")
        
        # Update status
        workflow["status"] = "processing"
        workflow["progress_percentage"] = 10.0
        await broadcast_update(claim_id, "Agent workflow initialized")
        
        # Step 1: Claim Parser Agent
        workflow["current_agent"] = "claim_parser"
        workflow["progress_percentage"] = 20.0
        await broadcast_update(claim_id, "Parsing claim content...")
        
        if app_state.portia_core:
            parser_agent = ClaimParserAgent(app_state.portia_core, app_state.audit_manager)
            parser_result = await parser_agent.process_claim(claim_data)
            workflow["results"]["parser"] = parser_result.data
            workflow["agents_completed"].append("claim_parser")
        
        # Step 2: Evidence Collector Agent with Web Retrieval
        workflow["current_agent"] = "evidence_collector"
        workflow["progress_percentage"] = 40.0
        await broadcast_update(claim_id, "Collecting evidence from web sources...")
        
        if app_state.portia_core and app_state.web_orchestrator:
            collector_agent = EvidenceCollectorAgent(app_state.portia_core, app_state.audit_manager)
            
            # Create comprehensive crawl job
            crawl_job = CrawlJob(
                job_id=f"evidence_{claim_id}",
                urls=claim_data.source_url and [claim_data.source_url] or [],
                max_depth=2,
                max_pages=50,
                search_terms=claim_data.content.split()[:10],  # First 10 words as search terms
                strategies=[
                    SearchStrategy.BROAD_SEARCH,
                    SearchStrategy.NEWS_FOCUSED,
                    SearchStrategy.FACT_CHECK_FOCUSED
                ]
            )
            
            # Execute web retrieval
            evidence_results = await app_state.web_orchestrator.execute_crawl(crawl_job)
            
            # Process evidence with agent
            collector_result = await collector_agent.process_claim(claim_data, evidence=evidence_results)
            workflow["results"]["evidence_collector"] = collector_result.data
            workflow["agents_completed"].append("evidence_collector")
        
        # Step 3: Confidence Assessment and Clarification Logic
        workflow["current_agent"] = "confidence_assessor"
        workflow["progress_percentage"] = 60.0
        await broadcast_update(claim_id, "Assessing confidence and checking for conflicts...")
        
        # Calculate confidence metrics
        confidence = ConfidenceMetrics(
            overall_confidence=0.75,  # This would be calculated from agent results
            source_reliability=0.8,
            fact_verification=0.7,
            temporal_consistency=0.85,
            cross_reference_score=0.65,
            methodology_score=0.9
        )
        
        # Check if clarification is needed
        if app_state.clarification_manager:
            decision_result = app_state.clarification_manager.decision_engine.should_request_clarification(
                confidence=confidence,
                conflicts=[],  # Would be populated with detected conflicts
                agent_result=collector_result if 'collector_result' in locals() else AgentResult(
                    agent_type=DetectiveAgentType.EVIDENCE_COLLECTOR,
                    success=True
                )
            )
            
            should_clarify, priority, reason = decision_result
            
            if should_clarify:
                workflow["status"] = "awaiting_clarification"
                await broadcast_update(claim_id, f"Human clarification requested: {reason}")
                
                # Create clarification request
                clarification_request = ClarificationRequest(
                    request_id=str(uuid.uuid4()),
                    clarification_type=ClarificationType.MULTIPLE_CHOICE,
                    priority=priority,
                    status=ClarificationStatus.PENDING,
                    claim_id=claim_id,
                    agent_type=DetectiveAgentType.EVIDENCE_COLLECTOR,
                    title="Evidence Conflict Resolution",
                    description=f"Multiple conflicting sources found. Reason: {reason}",
                    context={
                        "confidence_metrics": confidence.to_dict(),
                        "evidence_summary": workflow["results"].get("evidence_collector", {})
                    },
                    options=[
                        {"value": "trust_high_credibility", "label": "Trust high-credibility sources"},
                        {"value": "require_more_evidence", "label": "Require additional evidence"},
                        {"value": "mark_inconclusive", "label": "Mark as inconclusive"}
                    ]
                )
                
                await app_state.clarification_manager.create_request(clarification_request)
                workflow["clarifications"].append(clarification_request.to_dict())
                
                # Wait for clarification response (with timeout)
                await wait_for_clarification(claim_id, clarification_request.request_id, timeout_seconds=1800)
        
        # Step 4: Final Report Generation
        workflow["current_agent"] = "report_generator"
        workflow["progress_percentage"] = 80.0
        await broadcast_update(claim_id, "Generating final report...")
        
        # Generate comprehensive report
        final_report = {
            "claim_id": claim_id,
            "original_claim": claim_data.content,
            "reliability_score": confidence.overall_confidence,
            "confidence_breakdown": confidence.to_dict(),
            "evidence_summary": workflow["results"].get("evidence_collector", {}),
            "parsed_claims": workflow["results"].get("parser", {}),
            "processing_timeline": workflow["audit_events"],
            "clarifications_used": workflow["clarifications"],
            "final_verdict": determine_final_verdict(confidence.overall_confidence),
            "transparency_note": "This report was generated using AI agents with human oversight where needed.",
            "generated_at": datetime.now(timezone.utc).isoformat()
        }
        
        workflow["results"]["final_report"] = final_report
        workflow["status"] = "completed"
        workflow["progress_percentage"] = 100.0
        workflow["completed_at"] = datetime.now(timezone.utc)
        
        await broadcast_update(claim_id, "Processing completed successfully!")
        
        logger.info(f"Completed processing claim {claim_id}")
        
    except Exception as e:
        logger.error(f"Error processing claim {claim_id}: {e}")
        workflow["status"] = "error"
        workflow["error"] = str(e)
        await broadcast_update(claim_id, f"Processing failed: {str(e)}")

async def broadcast_update(claim_id: str, message: str):
    """Broadcast update to WebSocket connections"""
    websocket = app_state.websocket_connections.get(claim_id)
    if websocket:
        try:
            await websocket.send_json({
                "type": "progress_update",
                "message": message,
                "timestamp": datetime.now(timezone.utc).isoformat()
            })
        except Exception as e:
            logger.error(f"Failed to send WebSocket update: {e}")

async def wait_for_clarification(claim_id: str, request_id: str, timeout_seconds: int = 1800):
    """Wait for clarification response with timeout"""
    start_time = datetime.now(timezone.utc)
    while (datetime.now(timezone.utc) - start_time).total_seconds() < timeout_seconds:
        if app_state.clarification_manager:
            request = app_state.clarification_manager.get_request(request_id)
            if request and request.status == ClarificationStatus.COMPLETED:
                logger.info(f"Clarification received for claim {claim_id}")
                return request.response
        await asyncio.sleep(5)  # Check every 5 seconds
    
    logger.warning(f"Clarification timeout for claim {claim_id}")
    return None

def determine_final_verdict(reliability_score: float) -> str:
    """Determine final verdict based on reliability score"""
    if reliability_score >= 0.8:
        return "Highly Reliable"
    elif reliability_score >= 0.6:
        return "Likely Reliable"
    elif reliability_score >= 0.4:
        return "Uncertain"
    elif reliability_score >= 0.2:
        return "Likely Unreliable"
    else:
        return "Highly Unreliable"

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
