"""
Example implementation of the three main AI Detective agents using Portia SDK Core

This module demonstrates how to implement the specialized agents for the
AI Detective system: Claim Parser, Evidence Collector, and Report Generator.
"""

import asyncio
import json
from datetime import datetime, timezone
from typing import Dict, Any, List
import sys
import os

# Add the current directory to Python path
sys.path.insert(0, os.path.dirname(__file__))

from portia_core import (
    DetectiveAgentBase, DetectiveAgentType, ClaimData, AgentResult,
    create_detective_core, PortiaCore
)


class ClaimParserAgent(DetectiveAgentBase):
    """
    Agent responsible for parsing and extracting verifiable claims from content
    """
    
    def __init__(self, portia_client: PortiaCore, audit_manager):
        super().__init__(DetectiveAgentType.CLAIM_PARSER, portia_client, audit_manager)
        
    async def process_claim(self, claim: ClaimData, **kwargs) -> AgentResult:
        """
        Parse claim content and extract verifiable statements
        """
        start_time = datetime.now(timezone.utc)
        self._log_start(claim.claim_id, "claim_parsing")
        
        try:
            # Use Portia to analyze and parse the claim
            parsing_query = f"""
            Analyze the following content and extract all verifiable factual claims.
            For each claim, determine if it can be fact-checked and provide structured output.
            
            Content: {claim.content}
            Source URL: {claim.source_url or 'Not provided'}
            
            Extract:
            1. Individual factual claims that can be verified
            2. Opinion statements (not verifiable)
            3. Predictions or future statements
            4. Key entities mentioned (people, places, organizations, dates)
            5. Overall claim type and complexity
            """
            
            if self.portia.portia_client:
                plan_result = await self.portia.run_portia_plan(
                    query=parsing_query,
                    end_user="claim_parser_agent"
                )
                
                parsed_data = {
                    "original_content": claim.content,
                    "extracted_claims": plan_result.get("final_output", "No output"),
                    "verifiable_claims_count": 3,  # This would be extracted from LLM response
                    "claim_complexity": "medium",
                    "processing_method": "llm_analysis"
                }
            else:
                # Fallback processing without LLM
                parsed_data = {
                    "original_content": claim.content,
                    "extracted_claims": [
                        {
                            "text": claim.content[:200] + "..." if len(claim.content) > 200 else claim.content,
                            "type": "factual",
                            "verifiable": True,
                            "confidence": 0.8
                        }
                    ],
                    "verifiable_claims_count": 1,
                    "claim_complexity": "simple",
                    "processing_method": "fallback"
                }
            
            execution_time = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
            
            result = AgentResult(
                agent_type=self.agent_type,
                success=True,
                data=parsed_data,
                confidence=0.85,
                execution_time_ms=int(execution_time)
            )
            
            self._log_success(claim.claim_id, "claim_parsing", parsed_data)
            return result
            
        except Exception as e:
            error_msg = f"Claim parsing failed: {str(e)}"
            self.logger.error(error_msg, exc_info=True)
            self._log_error(claim.claim_id, "claim_parsing", error_msg)
            
            return AgentResult(
                agent_type=self.agent_type,
                success=False,
                error=error_msg,
                execution_time_ms=int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
            )


class EvidenceCollectorAgent(DetectiveAgentBase):
    """
    Agent responsible for collecting evidence and cross-referencing claims
    """
    
    def __init__(self, portia_client: PortiaCore, audit_manager):
        super().__init__(DetectiveAgentType.EVIDENCE_COLLECTOR, portia_client, audit_manager)
        
    async def process_claim(self, claim: ClaimData, **kwargs) -> AgentResult:
        """
        Collect evidence for or against the claim from multiple sources
        """
        start_time = datetime.now(timezone.utc)
        self._log_start(claim.claim_id, "evidence_collection")
        
        try:
            # Use Portia to search for evidence
            evidence_query = f"""
            Research and gather evidence about this claim from reliable sources:
            
            Claim: {claim.content}
            
            Tasks:
            1. Search for authoritative sources that support or contradict this claim
            2. Find scientific studies, news articles, or official statements relevant to this claim
            3. Identify the credibility of sources found
            4. Summarize the evidence for and against the claim
            5. Assess the overall weight of evidence
            
            Provide a structured analysis of the evidence found.
            """
            
            if self.portia.portia_client:
                plan_result = await self.portia.run_portia_plan(
                    query=evidence_query,
                    end_user="evidence_collector_agent"
                )
                
                evidence_data = {
                    "evidence_sources": plan_result.get("final_output", "No evidence found"),
                    "supporting_sources": 2,  # Would be extracted from LLM response
                    "contradicting_sources": 1,
                    "neutral_sources": 1,
                    "source_credibility_avg": 0.75,
                    "evidence_strength": "moderate",
                    "collection_method": "llm_research"
                }
            else:
                # Fallback evidence collection
                evidence_data = {
                    "evidence_sources": [
                        {
                            "url": "https://example.com/source1",
                            "title": "Example Source 1",
                            "credibility": 0.8,
                            "stance": "supporting"
                        },
                        {
                            "url": "https://example.com/source2", 
                            "title": "Example Source 2",
                            "credibility": 0.7,
                            "stance": "neutral"
                        }
                    ],
                    "supporting_sources": 1,
                    "contradicting_sources": 0,
                    "neutral_sources": 1,
                    "source_credibility_avg": 0.75,
                    "evidence_strength": "limited",
                    "collection_method": "fallback"
                }
            
            execution_time = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
            
            result = AgentResult(
                agent_type=self.agent_type,
                success=True,
                data=evidence_data,
                confidence=0.78,
                execution_time_ms=int(execution_time)
            )
            
            self._log_success(claim.claim_id, "evidence_collection", evidence_data)
            return result
            
        except Exception as e:
            error_msg = f"Evidence collection failed: {str(e)}"
            self.logger.error(error_msg, exc_info=True)
            self._log_error(claim.claim_id, "evidence_collection", error_msg)
            
            return AgentResult(
                agent_type=self.agent_type,
                success=False,
                error=error_msg,
                execution_time_ms=int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
            )


class ReportGeneratorAgent(DetectiveAgentBase):
    """
    Agent responsible for generating comprehensive verification reports
    """
    
    def __init__(self, portia_client: PortiaCore, audit_manager):
        super().__init__(DetectiveAgentType.REPORT_GENERATOR, portia_client, audit_manager)
        
    async def process_claim(self, claim: ClaimData, 
                          parsed_data: Dict[str, Any] = None,
                          evidence_data: Dict[str, Any] = None,
                          **kwargs) -> AgentResult:
        """
        Generate a comprehensive verification report based on parsing and evidence
        """
        start_time = datetime.now(timezone.utc)
        self._log_start(claim.claim_id, "report_generation")
        
        try:
            # Prepare context for report generation
            context = {
                "claim": claim.content,
                "source_url": claim.source_url,
                "parsed_data": parsed_data,
                "evidence_data": evidence_data
            }
            
            report_query = f"""
            Generate a comprehensive fact-checking report based on the following information:
            
            Original Claim: {claim.content}
            Source: {claim.source_url or 'Not provided'}
            
            Parsed Data: {json.dumps(parsed_data, indent=2) if parsed_data else 'Not available'}
            
            Evidence Data: {json.dumps(evidence_data, indent=2) if evidence_data else 'Not available'}
            
            Create a structured report that includes:
            1. Executive summary of the verification
            2. Detailed analysis of each verifiable claim
            3. Evidence assessment (sources, credibility, relevance)
            4. Final verdict (True, False, Partially True, Insufficient Evidence)
            5. Confidence score and explanation
            6. Recommendations for readers
            
            Format as a professional fact-checking report.
            """
            
            if self.portia.portia_client:
                plan_result = await self.portia.run_portia_plan(
                    query=report_query,
                    end_user="report_generator_agent"
                )
                
                report_data = {
                    "report_content": plan_result.get("final_output", "Report generation failed"),
                    "verdict": "PARTIALLY_TRUE",  # Would be extracted from LLM response
                    "confidence_score": 0.72,
                    "evidence_quality": "moderate",
                    "verification_status": "completed",
                    "generation_method": "llm_synthesis"
                }
            else:
                # Fallback report generation
                report_data = {
                    "report_content": f"""
FACT-CHECK REPORT

Claim: {claim.content}
Source: {claim.source_url or 'Not provided'}

SUMMARY:
This claim has been analyzed using available information. 

VERDICT: REQUIRES_FURTHER_INVESTIGATION
The available evidence is insufficient for a definitive conclusion.

CONFIDENCE: 60%

RECOMMENDATION:
Additional verification from authoritative sources is recommended.
                    """.strip(),
                    "verdict": "REQUIRES_FURTHER_INVESTIGATION",
                    "confidence_score": 0.60,
                    "evidence_quality": "limited",
                    "verification_status": "completed",
                    "generation_method": "fallback"
                }
            
            execution_time = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000
            
            result = AgentResult(
                agent_type=self.agent_type,
                success=True,
                data=report_data,
                confidence=0.80,
                execution_time_ms=int(execution_time)
            )
            
            self._log_success(claim.claim_id, "report_generation", report_data)
            return result
            
        except Exception as e:
            error_msg = f"Report generation failed: {str(e)}"
            self.logger.error(error_msg, exc_info=True)
            self._log_error(claim.claim_id, "report_generation", error_msg)
            
            return AgentResult(
                agent_type=self.agent_type,
                success=False,
                error=error_msg,
                execution_time_ms=int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
            )


async def demonstrate_full_workflow():
    """
    Demonstrate the complete AI Detective workflow with all three agents
    """
    print("🔍 AI Detective - Full Workflow Demonstration")
    print("=" * 60)
    
    # Initialize the core system
    print("\n1. Initializing Portia Core...")
    core = create_detective_core()
    
    # Create and register agents
    print("2. Creating and registering agents...")
    
    claim_parser = ClaimParserAgent(core, core.audit_manager)
    evidence_collector = EvidenceCollectorAgent(core, core.audit_manager)
    report_generator = ReportGeneratorAgent(core, core.audit_manager)
    
    core.register_agent(claim_parser)
    core.register_agent(evidence_collector)
    core.register_agent(report_generator)
    
    print(f"   ✓ Registered {len(core.agents)} agents")
    
    # Create a test claim
    print("\n3. Creating test claim...")
    test_claim = ClaimData(
        claim_id="demo-claim-001",
        content="Vaccines cause autism in children",
        source_url="https://example.com/vaccine-article",
        timestamp=datetime.now(timezone.utc)
    )
    print(f"   Claim: {test_claim.content}")
    
    # Execute the full workflow
    print("\n4. Executing full verification workflow...")
    
    try:
        # Use the built-in workflow orchestration
        workflow_result = await core.process_claim_workflow(
            claim=test_claim,
            user_id="demo_user"
        )
        
        print("\n✅ Workflow completed successfully!")
        print(f"   Execution time: {workflow_result['execution_time_seconds']:.2f}s")
        print(f"   Success: {workflow_result['success']}")
        
        # Display results from each agent
        for agent_type, result in workflow_result['agent_results'].items():
            print(f"\n📊 {agent_type.upper()} RESULTS:")
            print(f"   Success: {result['success']}")
            print(f"   Confidence: {result.get('confidence', 'N/A')}")
            print(f"   Execution time: {result.get('execution_time_ms', 'N/A')}ms")
            
            if result['success'] and result['data']:
                if agent_type == 'claim_parser':
                    print(f"   Verifiable claims: {result['data'].get('verifiable_claims_count', 'N/A')}")
                elif agent_type == 'evidence_collector':
                    print(f"   Evidence sources: {result['data'].get('supporting_sources', 0)} supporting, {result['data'].get('contradicting_sources', 0)} contradicting")
                elif agent_type == 'report_generator':
                    print(f"   Verdict: {result['data'].get('verdict', 'N/A')}")
                    print(f"   Report confidence: {result['data'].get('confidence_score', 'N/A')}")
        
        # Show audit trail
        print("\n📝 AUDIT TRAIL:")
        audit_events = core.get_audit_trail(claim_id=test_claim.claim_id)
        for event in audit_events[-5:]:  # Show last 5 events
            print(f"   {event['timestamp'][:19]}: {event['event_type']} by {event['agent_type']}")
        
        # Show final report if available
        report_result = workflow_result['agent_results'].get('report_generator')
        if report_result and report_result['success']:
            print("\n📄 GENERATED REPORT:")
            report_content = report_result['data'].get('report_content', '')
            if isinstance(report_content, str):
                # Show first 300 characters of the report
                preview = report_content[:300] + "..." if len(report_content) > 300 else report_content
                print(f"   {preview}")
            else:
                print(f"   Report type: {type(report_content)}")
        
    except Exception as e:
        print(f"\n❌ Workflow failed: {e}")
        return False
    
    print("\n🎉 Demonstration completed successfully!")
    return True


async def main():
    """Main function to run the demonstration"""
    try:
        success = await demonstrate_full_workflow()
        return 0 if success else 1
    except Exception as e:
        print(f"\n💥 Fatal error: {e}")
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))
