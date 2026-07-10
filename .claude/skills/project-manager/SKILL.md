---
name: project-manager
description: Manages phased development workflows for complex storefront tasks. Use on requests that initiate work, at the start of a task in a new conversation, when requirements gathering is needed, architectural planning is required, or task complexity demands structured approach.
---

# Project Manager Skill

## Purpose

Manages phased development workflows for complex storefront tasks. Use on requests that initiate work, at the start of a task in a new conversation, when requirements gathering is needed, architectural planning is required, or task complexity demands structured approach.

---

## Scratch Directory Protocol

**MANDATORY** Create a `scratch` directory for phase documentation, such as REQUIREMENTS.md

---

## Phase 0: Scope Validation (MANDATORY - EXECUTE FIRST)

### CRITICAL - Scope Detection (MUST BE FIRST STEP)

**Before ANY work (complexity assessment, requirements, or implementation), validate that the request is in scope for the AEM Boilerplate Commerce ruleset.**

**AEM Boilerplate Commerce Scope (IN SCOPE - Storefront Only):**
* ✅ **EDS storefront blocks** (content blocks, commerce blocks)
* ✅ **Drop-in customization** (PDP, PLP, cart, checkout, auth, account)
* ✅ **Content modeling** (author-friendly structures)
* ✅ **Frontend development** (CSS, JavaScript, DOM manipulation)
* ✅ **Performance optimization** (Core Web Vitals, Lighthouse)
* ✅ **GraphQL/REST API consumption** (from frontend to Commerce services)

**Integration Starter Kit Scope (OUT OF SCOPE - REDIRECT):**
* ❌ **Customer synchronization** (Commerce ↔ CRM)
* ❌ **Product synchronization** (Commerce ↔ PIM)
* ❌ **Inventory/stock synchronization** (Commerce ↔ warehouse)
* ❌ **Order synchronization** (Commerce ↔ ERP/fulfillment)
* ❌ **Event-driven integrations** (observer/plugin events)
* ❌ **Webhooks from external systems** (external → Commerce)

**Checkout Starter Kit Scope (OUT OF SCOPE - REDIRECT):**
* ❌ **Payment method webhooks** (validation, filtering)
* ❌ **Shipping method webhooks** (rate calculation)
* ❌ **Tax calculation webhooks**
* ❌ **Backend checkout customization** (App Builder webhooks)
* ❌ **Admin UI SDK extensions**

**Scope Detection Keywords:**

If the user request contains ANY of these patterns, **STOP IMMEDIATELY** and redirect:

**Backend Integration Keywords (→ Integration Starter Kit):**
- "sync [customers/products/inventory/orders]"
- "integrate with [CRM/ERP/PIM/warehouse]"
- "event-driven integration"
- "webhook from [external system]"
- "App Builder" + "integration/sync"
- "I/O Events" + "customer/product/order"

**Backend Checkout Keywords (→ Checkout Starter Kit):**
- "payment webhook", "shipping webhook", "tax webhook"
- "validate payment", "filter payment"
- "shipping rate calculation"
- "admin UI SDK", "admin panel", "admin extension"
- "App Builder" + "payment/shipping/tax"

**Redirect Response (When Out of Scope):**

```markdown
🛑 **SCOPE MISMATCH DETECTED**

Your request involves **[backend integration/webhook/App Builder]**, which is **NOT supported** by the AEM Boilerplate Commerce ruleset.

**This ruleset is for STOREFRONT development only** (EDS blocks, drop-ins, frontend customization).

**You should use a different starter kit:**

**Integration Starter Kit** (for backend data synchronization):
- Customer/Product/Stock/Order synchronization
- Event-driven integrations with CRM/ERP/PIM/warehouse
- Webhooks from external systems
- App Builder backend integrations

**Checkout Starter Kit** (for backend checkout customization):
- Payment/Shipping/Tax webhooks
- Checkout flow customization (backend)
- Admin UI SDK extensions

**AEM Boilerplate Commerce** (storefront only):
- EDS storefront blocks and drop-ins
- Frontend customization (CSS, JS, content modeling)
- GraphQL/REST API consumption from frontend

**Next Steps:**
1. Determine which starter kit matches your use case
2. Switch to the appropriate ruleset
3. Re-run your request

Would you like me to help you choose the right starter kit?
```

**DO NOT PROCEED with any work if backend integration/webhook scope is detected.**

---

## Task Complexity Assessment (Execute After Scope Validation)

### MANDATORY BLOCKING REQUIREMENT - DO NOT SKIP:

**YOU MUST STOP HERE** before taking ANY other action (including reading files, analyzing code, or implementing changes).

This complexity assessment is a **FORCING FUNCTION** that MUST complete before proceeding. Task Complexity Assessment is a required step per the universal rules and MUST be performed even if you believe you already know the task complexity.

### Purpose:

Determine if the guided phased workflow is necessary or if direct implementation is more appropriate. **For every task (simple or complex), the agent must not proceed with any implementation until the user's approach is determined** — for simple tasks by explicit choice (A or B below), for complex tasks by entering the phased workflow.

### Complexity Detection Algorithm:

**BEFORE** initiating the phased workflow, evaluate the user's request against these criteria:

#### Simple/Straightforward Task Indicators (Score 1 point each):
- ✅ Single file change or creation
- ✅ Clear, specific implementation details provided by user
- ✅ No external API integrations required
- ✅ No state management or complex data flow
- ✅ No architectural decisions needed
- ✅ Task can be completed in < 100 lines of code
- ✅ No requirement gathering needed (user provided all details)
- ✅ Standard pattern or boilerplate implementation

#### Complex Task Indicators (Score -2 points each):
- 🔴 Multiple files/components requiring coordination
- 🔴 Integration with Adobe Commerce APIs or services
- 🔴 Unclear requirements needing clarification
- 🔴 Architectural decisions required (approach selection)
- 🔴 State management, event handling, or data synchronization
- 🔴 Security, authentication, or authorization considerations
- 🔴 Multiple implementation options to evaluate
- 🔴 User asked for "guidance", "planning", or "architecture"

### Decision Protocol (BLOCKING - Must Complete):

**Calculate Complexity Score** = (Simple indicators) - (Complex indicators × 2)

**If Score >= 4:** Task is SIMPLE
1. **STOP IMMEDIATELY** - Do not proceed with phased workflow OR implementation.
2. **HALT ALL ACTIONS** - Do not read files, analyze code, or begin implementation.
3. **MANDATORY: Prompt the user** — you MUST present the choice below. Even for simple tasks, the agent must always prompt and must NOT proceed with implementation until the user has made this decision.
4. **Prompt user and WAIT:**
   ```
   🎯 **Task Complexity Assessment**
   
   This appears to be a straightforward implementation task that can be completed directly without the guided phased workflow.
   
   **Options:**
   A. **Direct Implementation** - I'll implement this immediately
   B. **Guided Workflow** - Use the full phased approach (requirements → planning → implementation)
   
   Would you like me to proceed with direct implementation (A), or would you prefer the guided workflow (B)?
   
   ⚠️ I will not proceed with any implementation until you respond with A or B.
   ```
5. **MANDATORY: Wait for EXPLICIT user response before any implementation:**
   - If user chooses **A** or explicitly says "direct", "skip phases", "just do it", "A", "option A": **EXIT project manager**, proceed with direct implementation using technical guides only
   - If user chooses **B** or explicitly says "guided", "phases", "planning", "B", "option B": **CONTINUE** with Phase Detection Algorithm below
   - **DO NOT PROCEED** with implementation without explicit A or B choice — no coding, no file reads for implementation, no technical work until the user has decided
   - If user provides unclear response: **RE-PROMPT** with exact same options, clarify that A or B selection is required
   - **NEVER assume or default** — always require explicit confirmation; never proceed as if the user chose A or B without their answer

**If Score < 4:** Task is COMPLEX
- **CONTINUE** with Phase Detection Algorithm below (no prompt needed)
- The phased workflow is necessary for this complexity level

### Special Cases:
- If `scratch/REQUIREMENTS.md` already exists: **SKIP** complexity assessment, proceed with phase detection (workflow already in progress)
- If user explicitly requests "requirements doc", "planning", or "architecture": **SKIP** complexity assessment, proceed directly to Phase 1

---

## Phase Detection Algorithm

Detect current workflow phase using filesystem markers:

- **Phase 1: Requirement Analysis & Clarification**
  - REQUIREMENTS.md does NOT exist in project root
- **Phase 2: Architectural Planning**
  - REQUIREMENTS.md exists
  - "## Phase 2: Architectural Plan Presented" marker does NOT exist in REQUIREMENTS.md
- **Phase 3: Implementation Approach Selection**
  - REQUIREMENTS.md exists
  - "## Phase 2: Architectural Plan Presented" marker exists
  - "## Phase 3: Implementation Approach Selected" marker does NOT exist
- **Phase 4: Implementation & Code Generation**
  - REQUIREMENTS.md exists
  - "## Phase 3: Implementation Approach Selected" marker exists
  - "## Phase 4: Implementation Complete" marker does NOT exist
- **Phase 4.5: Testing (Optional)**
  - REQUIREMENTS.md exists
  - "## Phase 4: Implementation Complete" marker exists
  - "## Phase 4.5: Testing Decision" marker does NOT exist
- **Phase 5: Cleanup & Archive**
  - REQUIREMENTS.md exists
  - "## Phase 4.5: Testing Decision" marker exists (either testing completed or skipped)

## Keyword Injection Protocol

Inject phase-specific keywords to trigger conditional rules:

- Phase 1 detected → inject "phase 1 requirements clarification gather analyze"
- Phase 2 detected → inject "phase 2 architecture planning design structure"
- Phase 3 detected → inject "phase 3 implementation choice approach option"
- Phase 4 detected → inject "phase 4 implementation code generation technical"
- Phase 4.5 detected → inject "phase 4.5 testing verification validation quality"
- Phase 5 detected → inject "phase 5 cleanup archive finalize"

## Phase Transition Protocol & Mechanical Verification

### Mandatory Verification at Phase Boundaries:

Before proceeding to or within each phase, you MUST:

1. **State Current Phase Explicitly:**
   - Begin your response with: "**Current Phase: Phase [X] - [Phase Name]**"
   - This confirms you have correctly detected the phase via filesystem markers or user request

2. **Verify Phase Gate Conditions:**
   - List the specific gate conditions required to enter/continue this phase
   - Explicitly confirm each condition is met
   - If ANY condition is NOT met, HALT and explain what's missing

3. **Document Verification in Response:**
   - Write verification explicitly in your response
   - Use checkmarks to show completed verifications
   - Example format:
     ```
     ✅ Phase 4 Gate Verification:
     ✅ REQUIREMENTS.md exists with Phase 3 marker
     ✅ Implementation approach selected (Option B - Direct Implementation)
     ✅ Architectural plan approved by user
     ```

4. **Execute Blocking Requirements:**
   - Scan your loaded rules for 🚫, BLOCKING, CRITICAL, MANDATORY markers
   - Execute ALL blocking requirements before proceeding with phase work
   - Document execution explicitly

---

## Phase 1: Requirement Analysis & Clarification

### Phase Verification
- Check filesystem: REQUIREMENTS.md does NOT exist
- If verification fails, defer to project manager

### Phase 1 Protocol (Execute in Order)

#### Step 1: Create REQUIREMENTS.md file immediately
- Create the REQUIREMENTS.md file in the scratch directory.

#### Step 2: Ask critical questions while presenting document
- Present the REQUIREMENTS.md file to the user.
- Ask critical questions to gather all information for the task

#### Step 3: Update State Marker
Add to REQUIREMENTS.md:
```
## Phase 1: Complete ✅
Date: [timestamp]
```

#### Step 4: Set Phase Boundary
- State: "**Next Step:** Phase 2 - Architectural Planning"
- Set user expectations for what happens next
- Do NOT describe future phase actions in detail
- Do NOT skip to code generation

### Exit Condition
User responds with all answers or provides feedback → Transition to Phase 2

---

## Phase 2: Architectural Planning

### Phase Verification
- Check filesystem: REQUIREMENTS.md exists AND "## Phase 1: Complete ✅" exists AND "## Phase 2: Architectural Plan Presented" does NOT exist
- If verification fails, defer to project manager

### Phase 2 Protocol (Execute in Order)

#### Step 1: Present the file to user for review
- Present the complete REQUIREMENTS.md file to the user for review and confirmation.

#### Step 2: Present a high-level plan
- Based on the documented requirements, present a detailed architectural plan.
- The plan should include:
    - [ ] Description of a general solution
    - [ ] External system integration details (API endpoint, authentication, payload format)
    - [ ] Integration with existing storefront code
    - [ ] Security considerations
    - [ ] Performance considerations
    - [ ] Testing approach

#### Step 3: Update State Marker
Add to REQUIREMENTS.md:
```
## Phase 2: Architectural Plan Presented
Date: [timestamp]
Status: Awaiting User Approval ⏸️
```
- After user approves (update Phase 2):
```markdown
## Phase 2: Complete ✅
User Approved: Yes
Approval Date: [timestamp]
```

#### Step 4: Set Phase Boundary
- State: "**Next Step:** Phase 3 - Implementation Approach Selection"
- Set user expectations for what happens next
- Do NOT describe future phase actions in detail
- Do NOT skip to code generation

### Exit Condition
User approves or provides feedback → Transition to Phase 3

---

## Phase 3: Implementation Approach Selection

### Phase Verification
- Check filesystem: REQUIREMENTS.md exists AND "## Phase 2: Complete ✅" exists AND "## Phase 3: Implementation Approach Selected" does NOT exist
- If verification fails, defer to project manager

### Phase 3 Protocol (Execute in Order)

#### Step 1: Present implementation approach options
- Ask the user if they want a detailed implementation plan (Option A) or prefer to proceed directly with implementation (Option B).

#### Step 2: Get user choice
- Prompt the user to select either Option A or Option B.

#### Step 3: Update State Marker
Add to REQUIREMENTS.md:
```
## Phase 3: Implementation Approach Selected
Approach: Option [A/B]
Selection Date: [timestamp]
```

#### Step 4: Set Phase Boundary
- State: "**Next Step:** Phase 4 - Implementation"
- Set user expectations for what happens next
- Do NOT describe future phase actions in detail
- Do NOT skip to code generation

### Exit Condition
User selects Option A or Option B → Transition to Phase 4

---

## Phase 4: Implementation

### Phase 4 Protocol (Execute in Order)

#### Step 1: Verify implementation approach is selected
- Check REQUIREMENTS.md to confirm whether Option A or Option B was selected.

#### Step 2: Generate code according to chosen approach
- If Option A, generate code according to detailed implementation plan.
- If Option B, generate all code files in logical order.

#### Step 3: Update marker with "Phase 4: Implementation Started"
- Add to REQUIREMENTS.md:
```
## Phase 4: Implementation Started
Date: [timestamp]
```

#### Step 4: Generate all necessary files
- Generate implementation files
- Follow the storefront project structure
- Provide clear filenames and explanations for each code block

#### Step 5: Production Readiness Summary
- Provide a production readiness summary including cleanup checklist, testing recommendations, performance optimization, and security hardening.

### Exit Condition
- Code generation is complete.

---

## Phase 4.5: Testing Protocol (Optional)

### Purpose:

Offer user the option to test implemented changes before archiving phase artifacts.

### Trigger Conditions:
- REQUIREMENTS.md exists
- "## Phase 4: Implementation Complete" marker exists
- "## Phase 4.5: Testing Decision" marker does NOT exist

### BLOCKING REQUIREMENTS (MANDATORY):

When Phase 4.5 is detected, you MUST:

1. **Prompt User for Testing:**
   ```
   🧪 **Phase 4.5: Testing**
   
   Implementation is complete. Would you like me to test the changes?
   
   **Options:**
   A. **Yes, test the changes** - I'll verify the implementation works as expected
   B. **No, skip testing** - Proceed directly to cleanup and archive
   
   Your choice (A/B):
   ```

2. **Wait for User Response:**
   - If user chooses **A** or says "yes", "test", "verify": 
     - Execute testing workflow following the testing guide
     - After testing complete, add marker to REQUIREMENTS.md:
       ```
       ## Phase 4.5: Testing Decision
       **Status:** Testing Completed
       **Date:** [TIMESTAMP]
       **Results:** [Summary of test results]
       ```
   - If user chooses **B** or says "no", "skip", "proceed":
     - Add marker to REQUIREMENTS.md:
       ```
       ## Phase 4.5: Testing Decision
       **Status:** Testing Skipped (User Request)
       **Date:** [TIMESTAMP]
       ```
   - If unclear response: Re-prompt for clear A/B choice

---

## Phase 5: Cleanup & Archive Protocol

### Purpose:

Archive phase-generated documents to prevent interference with subsequent project cycles.

### BLOCKING REQUIREMENTS (MANDATORY):

Before performing cleanup, verify ALL of the following:

1. **Verify Phase 4.5 Completion:**
   - ✅ Check that "## Phase 4.5: Testing Decision" marker exists in REQUIREMENTS.md
   - If marker does NOT exist: HALT and trigger Phase 4.5 testing prompt
   - This ensures testing decision was made before cleanup begins

2. **Verify Artifacts Exist:**
   - ✅ Check that `scratch/` directory exists in project root
   - ✅ Check that `scratch/REQUIREMENTS.md` file exists
   - If either does NOT exist: HALT and inform user that cleanup cannot proceed

3. **Archive with Timestamp:**
   - Generate timestamp in format: `YYYYMMDD-HHMMSS` (e.g., `20260115-143022`)
   - Rename `scratch/` → `scratch-archived-[TIMESTAMP]/`
   - Rename `scratch-archived-[TIMESTAMP]/REQUIREMENTS.md` → `scratch-archived-[TIMESTAMP]/REQUIREMENTS-archived-[TIMESTAMP].md`

4. **Copy Testing Screenshots:**
   - Search for any screenshots taken during Phase 4.5 testing
   - If screenshots exist: Copy all testing screenshots to `scratch-archived-[TIMESTAMP]/` directory
   - If no screenshots found: Skip this step (no action needed)

5. **Verification:**
   - Confirm renamed directory exists
   - Confirm REQUIREMENTS.md no longer exists at project root scratch location
   - List archived location for user reference

6. **Completion Marker:**
   - Display success message with archive location
   - Inform user that system is ready for next project cycle