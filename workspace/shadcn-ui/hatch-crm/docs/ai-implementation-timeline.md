# Hatch AI Implementation Timeline (Sequenced)

This document defines the recommended build order, quality gates, and manual QA scripts for Hatch AI features. All LLM calls should go through the central AI service and use Grok (xAI) as the provider.

## Recommended Order

### 1) Foundation Infrastructure
- 0.1 AI Service Architecture
- 0.2 Prompt Management
- 0.3 PII Redaction
- 0.5 Cost Tracking

### 2) Approval, Feedback, Observability
- 0.4 Human-in-the-Loop Approval
- 0.6 Feedback Collection
- 0.8 Logging & Observability

### 3) Evaluation + Onboarding Start
- 0.7 Basic Eval Set
- 0.9 Onboarding Assistant (start)

### 4) Onboarding + Help
- 0.9 Onboarding Assistant (complete)
- 0.10 Contextual Help Assistant

### 5) Training + Phase 1 Start
- 0.11 Training & Walkthrough Assistant
- 1.1 Listing Description Generator (start)

### 6) Phase 1 Complete
- 1.1 Listing Description Generator (complete)
- 1.2 Follow-Up Email/Text Generator
- 1.3 Conversation Summarizer

### 7) Phase 2 (Client Wow)
- 2.1 Document Q&A with Citations
- 2.2 Property Dossier Generator

### 8) Phase 3+
- 3.1 Natural Language Property Search
- Phase 4–5 planning

## Quality Gates

### After Phase 0
- [ ] All AI requests go through central service
- [ ] PII redacted from all prompts
- [ ] All requests logged
- [ ] Cost tracking working
- [ ] Basic eval suite passing
- [ ] Human approval flow tested end-to-end
- [ ] Onboarding assistant completes full brokerage setup
- [ ] Contextual help covers all critical fields
- [ ] At least 3 walkthroughs complete and tested

### After Phase 1
- [ ] Listing description generator >80% eval pass rate
- [ ] Follow-up generator >80% eval pass rate
- [ ] Conversation summarizer extracts accurate data
- [ ] All features have feedback collection
- [ ] No Fair Housing violations in generated content

### After Phase 2
- [ ] Document Q&A provides accurate citations
- [ ] Document Q&A correctly says "I couldn't find this information in the document."
- [ ] Property dossier exports are professional quality
- [ ] User feedback >70% thumbs up

## Manual QA Scripts (Conversation Examples)

### Onboarding Assistant

**Test 1: Commission parsing**
- User: `We do 70/30 split for new agents until they hit $12,000 cap, then it goes to 85/15. Experienced agents start at 80/20 with a $10,000 cap then 90/10.`
- Expected:
  - Correctly parses both plans
  - Shows confirmation with correct numbers
  - Asks about additional fees

**Test 2: Logo upload with color extraction**
- User: uploads logo
- Expected:
  - Acknowledges upload
  - Extracts and suggests brand colors
  - Offers to apply to branding settings

### Contextual Help

**Test 1: Field explanation**
- User clicks `?` on MLS ID field
- Expected:
  - What it is
  - Why it’s required
  - Where to find it

**Test 2: Legal requirement**
- User asks: `Why do I need flood zone disclosure?`
- Expected:
  - Mentions Florida Statute 689.261
  - Explains consequences
  - Mentions Hatch can auto-populate (when available)

### Training Assistant

**Test 1: Walkthrough completion**
- User starts “Create Listing” walkthrough
- Expected:
  - Spotlight highlights correct elements
  - User can complete all steps
  - Quiz works at end

**Test 2: Question during training**
- User asks: `Why do I need to enter MLS number here?`
- Expected:
  - AI answers in context
  - Walkthrough continues after

