---
name: design-documentation
description: Transform approved requirements into comprehensive technical designs. Define system architecture, component interactions, data models, and interfaces to create a blueprint for implementation.
license: MIT
compatibility: Claude Code, Cursor, VS Code, Kiro
metadata:
  category: methodology
  complexity: intermediate
  author: jasonkneen/kiro
  source: https://github.com/jasonkneen/kiro
---

# Design Documentation

Create technical blueprints that bridge requirements and implementation. This skill teaches how to document architecture decisions, component design, and system interactions.

## When to Use This Skill

Use design documentation when:
- Requirements phase is complete and approved
- You need to plan technical implementation
- Multiple developers will work on the feature
- Architecture decisions need documentation
- The feature involves complex integrations

## Design Document Structure

### Standard Template

```markdown
# Design Document: [Feature Name]

## Overview
[High-level summary of the feature and approach]

## Architecture
[System architecture and component overview]

## Components and Interfaces
[Detailed component descriptions and interactions]

## Data Models
[Data structures and relationships]

## Error Handling
[Error scenarios and response strategies]

## Testing Strategy
[Testing approach and quality assurance]
```

## Step-by-Step Process

### Step 1: Requirements Analysis

Before designing, ensure you understand:
- All functional requirements
- Non-functional requirements (performance, security, scalability)
- Constraints (technology stack, timeline, resources)
- Integration points with existing systems

**Analysis Questions:**
- What does the system need to do?
- What are the performance expectations?
- What existing code/systems does this touch?
- What are the security requirements?
- What could go wrong?

### Step 2: Research and Context Building

Identify areas needing research:
- Technology choices and alternatives
- Third-party integrations and APIs
- Best practices for similar systems
- Security and compliance considerations

### Step 3: Define System Architecture

Document the high-level structure:
- How the overall system works
- Major components and their responsibilities
- How information moves through the system
- Key technology choices and rationale

### Step 4: Design Components and Interfaces

For each major component define:
- **Purpose**: What this component does
- **Responsibilities**: What it owns
- **Interfaces**: Input, Output, Dependencies
- **API Definition**: TypeScript interfaces or equivalent

### Step 5: Define Data Models

Document all data structures:
- Entity purpose and properties
- Field types, required/optional, validation rules
- Relationships between entities
- Example data

### Step 6: Plan Error Handling

Document error scenarios:
- Error categories (validation, auth, external service, system)
- Response strategy per category
- Recovery mechanisms (retry, fallback, circuit breaker)

### Step 7: Define Testing Strategy

- **Unit Testing**: Coverage target, focus areas, mocking strategy
- **Integration Testing**: Scope, environment, data strategy
- **End-to-End Testing**: Critical paths, tools
- **Performance Testing**: Load targets, benchmarks

## Decision Documentation

Document key decisions using this template:

```markdown
### Decision: [Brief Title]

**Context:** [Situation requiring a decision]

**Options Considered:**

**Option 1: [Name]**
- Pros: [Benefits]
- Cons: [Drawbacks]
- Effort: [Low/Medium/High]

**Option 2: [Name]**
- Pros: [Benefits]
- Cons: [Drawbacks]
- Effort: [Low/Medium/High]

**Decision:** [Chosen option]
**Rationale:** [Why this option was selected]
**Implications:** [What this means for implementation]
```

## Quality Checklist

Before finalizing design:

**Completeness:**
- [ ] All requirements addressed in design
- [ ] Major system components defined
- [ ] Data models cover all entities
- [ ] Error handling covers expected failures
- [ ] Testing strategy addresses all layers

**Clarity:**
- [ ] Design decisions clearly explained
- [ ] Component responsibilities well-defined
- [ ] Interfaces between components specified
- [ ] Technical choices include rationale

**Feasibility:**
- [ ] Design is technically achievable
- [ ] Performance requirements can be met
- [ ] Security requirements addressed
- [ ] Implementation complexity reasonable

**Traceability:**
- [ ] Design elements map to requirements
- [ ] All requirements covered by design
- [ ] Testing validates requirement fulfillment

## Common Pitfalls

1. **Over-Engineering:** Design for current requirements, not hypothetical futures
2. **Under-Specified Interfaces:** Define clear component boundaries
3. **Ignoring Non-Functional Requirements:** Address performance, security, scalability
4. **Technology-First Design:** Let requirements drive technology choices
5. **Insufficient Error Handling:** Plan for failures, not just happy paths

## Next Steps

After completing design:
1. Get design review and approval
2. Move to Task Planning phase
3. Break design into implementation tasks
4. Begin systematic implementation
