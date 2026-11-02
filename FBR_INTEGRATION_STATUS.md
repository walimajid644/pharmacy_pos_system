# FBR Integration Status — November 1, 2026

## Summary Status: 🟡 SPIKE COMPLETE, PRODUCTION BLOCKED

**Required by the user; onboarding route not yet confirmed. Production integration is NOT complete.** 

This build includes a DI sandbox validation spike, not invoice submission, a Tier-1 POS adapter, production fiscalization, an FBR-certified product or a tested compliance claim.

### What IS Implemented ✅
- Admin sandbox validation screen (manual JSON test)
- Native HTTPS validation with Windows TLS
- Memory-only token handling (never persisted)
- Request/response validation logic
- Error handling and redaction
- Native tests for validation flow

### What is NOT Implemented ❌
- Production invoice posting
- Automatic checkout integration
- FBR invoice number generation
- QR code generation
- Invoice reconciliation
- Durable request history
- Production credential storage
- Offline queue and retry logic
- Return/debit note handling
- Official onboarding completion

## Official references checked

- [FBR Digital Invoicing technical assistance](https://fbr.gov.pk/di-technical-assistance/173967/173970) currently links the [DI API specification v1.12](https://download1.fbr.gov.pk/Docs/20257301172130815TechnicalDocumentationforDIAPIV1.12.pdf).
- The linked specification identifies the sandbox validation method as `https://gw.fbr.gov.pk/di_data/v1/di/validateinvoicedata_sb`. It defines seller/buyer, scenario and item tax/HS/UOM data. Its invalid-response example can have header code `00` with invalid item statuses, so header code alone is not acceptance.
- FBR separately publishes [POS integration technical material](https://www.fbr.gov.pk/technical-documentation-di/163085/173959). The shop's actual onboarding route must be established from its portal; the DI spike is not assumed to implement a different POS protocol.

## Implemented spike

**Admin → FBR DI Sandbox Check** is admin/manager-only. It requires explicit confirmation that the portal uses DI sandbox and that the supplied JSON is synthetic sandbox data authorized for transmission. The user enters the sandbox token locally, never in chat.

The native command validates required JSON shape, date, scenario, identifiers, quantities and core numeric fields. It uses one fixed HTTPS validation URL with Windows native TLS/certificate verification, redirects disabled, connect/overall timeouts and bounded request/response sizes. The token is memory-only, is not written to SQLite/localStorage, and is cleared from the UI after every attempt and on exit. Error messages do not echo it; formatted responses redact its exact value.

There is no automatic network call on entry, no production endpoint, no invoice-post method and no integration into checkout. The application does not derive unreviewed tax classifications from catalog prices or its global checkout tax setting. The screen accepts reviewed scenario JSON copied from the assigned portal; it does not invent seller credentials, tax rates, HS codes, UOMs or FBR invoice numbers.

Only an explicitly valid header with a valid response for every expected item receives a `valid` result. Invalid items remain invalid even with header code `00`; incomplete item confirmation is `review`. Sandbox validation does not issue an invoice or complete the portal's scenario-submission/onboarding process.

## Blocked On (Cannot Proceed Without)

### 🚫 Critical Blockers

1. **Shop Onboarding Route Confirmation**
   - Need: Official portal confirmation of DI vs Tier-1 POS
   - Need: Business nature/sector classification
   - Need: Taxpayer identity and address from portal
   - Status: **User has not provided portal screenshots or route**

2. **Official Credentials**
   - Need: Assigned sandbox token from FBR portal
   - Need: Exact scenario payloads for testing
   - Need: Test timeline and success criteria
   - Status: **No credentials provided to development team**

3. **Real API Testing**
   - Need: Permission to call actual FBR sandbox endpoint
   - Need: Network access to `https://gw.fbr.gov.pk`
   - Status: **No real API calls made, only code validation**

4. **Product Mapping Requirements**
   - Need: HS code classification for pharmacy products
   - Need: UOM (Unit of Measure) standards
   - Need: Tax rate/SRO mapping rules
   - Need: Controlled substance special handling
   - Status: **Generic tax model only, no FBR product mapping**

5. **Integration Partner Requirements**
   - Need: Clarification if integrator/partner approval required
   - Need: Certification or approval process details
   - Status: **Unknown if third-party involvement needed**

### ⚠️ Engineering Dependencies

Once above blockers resolved, these engineering tasks remain:

1. **Scenario Submission Protocol** (~2-3 days)
   - Implement official scenario submission flow
   - Not just validation, but complete onboarding protocol
   - Test with all assigned scenarios

2. **Production Invoice Integration** (~3-5 days)
   - Integrate validation into checkout flow
   - Generate FBR invoice numbers
   - QR code generation and verification
   - Receipt printing with FBR details

3. **Reconciliation System** (~2-3 days)
   - Invoice status tracking
   - Durable request/response history
   - Failed submission recovery
   - Duplicate prevention

4. **Product Catalog Enhancement** (~1-2 days)
   - Add HS code field to products table
   - Add UOM field to products table
   - UI for managing tax classifications
   - Bulk import of HS/UOM data

5. **Credential Management** (~1 day)
   - Secure production credential storage
   - Credential rotation support
   - Token refresh logic (if applicable)

6. **Return/Debit Note Support** (~2-3 days)
   - Map sales returns to FBR debit notes
   - Submission protocol for returns
   - Reconciliation with original invoices

**Total Engineering Estimate**: 11-17 additional days after blockers resolved

---

## Testing Evidence

### ✅ Completed (Development)
- Native Rust tests verify input gates and validation logic
- UI tests use mocked command with synthetic token
- Request structure validation passes
- Response parsing (valid/invalid/mixed) passes
- Token redaction verified
- Timeout and error handling tested

### ❌ NOT Completed
- **No request was made to actual FBR validation API**
- **No real credentials were provided or tested**
- **No real shop data submitted**
- **No official scenarios completed**
- **No production endpoint tested**

Public documentation was read; that is not sandbox acceptance.

---

## Remaining Work Before Production

Before the real integration can be completed:

1. **Confirm onboarding route and requirements** 🚫 BLOCKED
   - Action: User must check shop's FBR portal
   - Identify: DI vs Tier-1 POS route
   - Document: Business nature/sector, taxpayer details
   - Clarify: Any integrator/partner requirements
   - Status: **Waiting on user**

2. **Obtain official credentials and scenarios** 🚫 BLOCKED
   - Action: User must provide sandbox token from portal
   - Action: User must provide exact scenario payloads
   - Security: Enter credentials only in local app or approved flow
   - Status: **Waiting on user**

3. **Run real sandbox validation** 🚫 BLOCKED (depends on #1, #2)
   - Action: Execute validation against actual FBR endpoint
   - Action: Record response for all assigned scenarios
   - Action: Implement scenario-submission protocol separately
   - Note: Validation alone is not sufficient for onboarding
   - Status: **Cannot proceed without credentials**

4. **Review product-specific mappings** ⚠️ PARTIAL BLOCKER
   - Action: Define HS code classification for pharmacy products
   - Action: Define UOM standards for packs vs loose units
   - Action: Map tax rates/SRO exemptions
   - Action: Handle controlled substances specially
   - Note: Current global checkout tax model is not a completed DI mapping engine
   - Status: **Requires domain knowledge + FBR guidance**

5. **Implement production integration** ⏳ ENGINEERING WORK (after #1-#4)
   - Durable request snapshots/status history
   - Secure credential storage with rotation
   - Recovery for uncertain/timeout responses
   - Duplicate prevention logic
   - Reconciliation with official invoice numbers
   - QR code generation and printing
   - Official accepted invoice-number/receipt behavior
   - Status: **Ready to engineer once path is clear**

6. **Complete official onboarding/test process** 🚫 BLOCKED
   - Action: Follow FBR's official onboarding steps
   - Action: Submit and get approval for test scenarios
   - Action: Verify actual accepted invoices and returns
   - Action: Confirm operational behavior during outages
   - Note: Do not use production credentials before this is complete
   - Status: **Waiting on user to start process**

7. **Operational requirements clarification** ⚠️ NEEDS DEFINITION
   - What happens during FBR API downtime?
   - Can sale proceed if validation fails/times out?
   - How are queued submissions reconciled?
   - What is pharmacy's legal obligation vs technical capability?
   - Status: **Needs official guidance, not guesses**

---

## Current Capability vs Requirements

| Capability | Status | Notes |
|------------|--------|-------|
| Manual sandbox validation | ✅ | Admin screen with synthetic JSON |
| Production invoice posting | ❌ | Not implemented |
| Automatic checkout integration | ❌ | Not implemented |
| FBR invoice number generation | ❌ | Not implemented |
| QR code generation | ❌ | Not implemented |
| Receipt with FBR details | ❌ | Not implemented |
| HS/UOM product mapping | ❌ | Not implemented |
| Real API calls | ❌ | Never executed |
| Official credentials tested | ❌ | No credentials provided |
| Onboarding scenarios complete | ❌ | No portal access |
| Production endpoint validated | ❌ | Sandbox only |
| Offline queue/retry | ❌ | Not implemented |
| Return/debit note submission | ❌ | Not implemented |
| Invoice reconciliation | ❌ | Not implemented |

---

## Next Steps (In Order)

### User Actions Required First:
1. Access shop's FBR portal and document onboarding route
2. Provide sandbox token and scenario requirements
3. Clarify operational requirements (downtime handling, etc.)
4. Begin official onboarding process with FBR

### Development Actions (After User Provides Above):
1. Test real sandbox validation with official credentials
2. Implement production invoice integration
3. Add HS/UOM fields to product catalog
4. Build reconciliation system
5. Complete official onboarding scenarios
6. Get production credentials and final certification

---

## Important Disclaimers

### ⚠️ Do NOT Claim:
- ❌ "FBR integrated"
- ❌ "Fiscally compliant"
- ❌ "Production ready for FBR"
- ❌ "Official certification complete"
- ❌ "Meets FBR requirements"

### ✅ DO Say:
- ✅ "FBR sandbox validation spike implemented"
- ✅ "Awaiting shop onboarding route confirmation"
- ✅ "Production integration planned, not complete"
- ✅ "Requires official credentials and testing"
- ✅ "Core sales system offline-capable (FBR separate concern)"

### Core Guarantee:
**Core sales/stock/accounting remain offline-capable; this does not mean fiscal reporting has occurred.** 

A completed POS sale is recorded in the local database. It is NOT automatically reported to FBR. Do not advertise production FBR integration from this spike. 

The dependency/build and ordinary application release gates are separate from FBR onboarding acceptance.

---

**Last Updated**: November 1, 2026  
**Status Owner**: Development team  
**Blocked On**: User (portal access, credentials, route confirmation)  
**Engineering Estimate**: 11-17 days after blockers resolved
