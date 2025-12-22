# Progressive Canonicalization

A specification for finding the optimal canonical feed URL through progressive normalization testing.

## Problem Statement

Current feed URL canonicalization makes a binary choice between the input URL and the feed's declared self URL. This approach misses opportunities to find cleaner, more canonical URLs that work identically.

**Current approach:**
```
inputUrl vs selfUrl → pick one
```

**Proposed approach:**
```
Generate normalized variants → test progressively → find cleanest working URL
```

### Why This Matters

Users often subscribe to feeds with suboptimal URLs:

| User Subscribes To | Optimal Canonical |
|--------------------|-------------------|
| `https://www.example.com/feed/?utm_source=twitter` | `https://example.com/feed` |
| `http://example.com/rss.xml` | `https://example.com/rss.xml` |
| `https://www.blog.example.com/feed/` | `https://blog.example.com/feed` |

A cleaner canonical URL:
- Reduces duplicate subscriptions across users
- Improves cache hit rates
- Provides better URLs for display and sharing
- Removes tracking pollution from feed databases

---

## URL Sources

The algorithm uses two URL sources for variant generation:

| Source | Description | Role |
|--------|-------------|------|
| **responseUrl** | Final URL after following redirects | Verified working, fallback source |
| **selfUrl** | URL declared in feed's `<link rel="self">` | Publisher's canonical, preferred if valid |

**Note:** `inputUrl` (what the user typed) is used only for the initial fetch. After that, we work with `responseUrl` (where the server responded) and `selfUrl` (what the feed declares). The `inputUrl` is preserved by the caller (feedstand) for alias tracking, not by feedcanon.

### Source Selection

```
1. Fetch inputUrl → responseUrl (after redirects)
2. Parse feed → selfUrl
3. Validate selfUrl (fetch, compare hash)
4. If valid: use selfUrl as variant source
   If invalid: use responseUrl as variant source
5. Generate cleanliness variants from chosen source
```

Only ONE source is used for variant generation - this simplifies the logic and reduces requests.

---

## Normalization Presets

Instead of abstract "levels", we use explicit `NormalizeOptions` presets. Each preset is a complete configuration object - no magic numbers.

### Preset: Aggressive

Most aggressive normalization. Strip www, trailing slash, tracking params.

| Option | Value | Effect |
|--------|-------|--------|
| `www` | `true` | Strip www prefix |
| `trailingSlash` | `true` | Strip trailing slash |
| `strippedParams` | tracking list | Strip tracking params |
| `port` | `true` | Strip default ports |
| `hash` | `true` | Strip fragment |
| `slashes` | `true` | Collapse `//` → `/` |
| `case` | `true` | Lowercase hostname |
| `encoding` | `true` | Normalize `%XX` |

**Never strips**: Functional query params like `?id=123`, `?format=rss`.

### Preset: Moderate

Keep www, strip other cosmetic differences.

| Option | Value | Effect |
|--------|-------|--------|
| `www` | `false` | Keep www prefix |
| `trailingSlash` | `true` | Strip trailing slash |
| `strippedParams` | tracking list | Strip tracking params |
| (other options same as Aggressive) | | |

### Preset: Conservative

Keep www and trailing slash.

| Option | Value | Effect |
|--------|-------|--------|
| `www` | `false` | Keep www prefix |
| `trailingSlash` | `false` | Keep trailing slash |
| `strippedParams` | tracking list | Strip tracking params |
| (other options same as Aggressive) | | |

### Design Decision: No "Strip All Params"

We explicitly do NOT have a preset that strips all query parameters. Functional params like `?id=123` or `?format=rss` would break feeds. Only explicitly listed tracking params are stripped.

---

## Cleanliness Score

URLs are ranked by a cleanliness score to determine testing order:

```typescript
function calculateCleanliness(url: string): number {
  let score = 0
  const parsed = new URL(url)

  // Protocol (HTTPS strongly preferred)
  if (parsed.protocol === 'https:') score += 100

  // No www prefix
  if (!parsed.hostname.startsWith('www.')) score += 50

  // No trailing slash (except for root path)
  if (!parsed.pathname.endsWith('/') || parsed.pathname === '/') score += 20

  // Fewer query parameters is better
  score += Math.max(0, 30 - parsed.searchParams.size * 5)

  // No tracking parameters
  if (!hasTrackingParams(url)) score += 25

  // No authentication
  if (!parsed.username && !parsed.password) score += 15

  // No hash fragment
  if (!parsed.hash) score += 10

  // Shorter URL (tie-breaker)
  score += Math.max(0, (200 - url.length) / 10)

  return score
}
```

### Score Examples

| URL | Score | Breakdown |
|-----|-------|-----------|
| `https://example.com/feed` | ~225 | HTTPS(100) + no-www(50) + no-slash(20) + no-params(30) + no-tracking(25) |
| `https://www.example.com/feed` | ~175 | HTTPS(100) + no-slash(20) + no-params(30) + no-tracking(25) |
| `https://example.com/feed/` | ~205 | HTTPS(100) + no-www(50) + no-params(30) + no-tracking(25) |
| `https://example.com/feed?id=1` | ~200 | HTTPS(100) + no-www(50) + no-slash(20) + params(-5) + no-tracking(25) |
| `http://www.example.com/feed/?utm_source=x` | ~45 | no-slash(20) + params(-5) |

---

## Self URL States

The feed's declared self URL can be in various states:

### Valid States

| State | Example | Handling |
|-------|---------|----------|
| **Exact match** | selfUrl === responseUrl | Use responseUrl, skip fetch |
| **Match after normalization** | Differ only in case/encoding | Use cleaner version |
| **Absolute, valid** | `https://example.com/feed` | Include in candidates |
| **Relative** | `/feed.xml` or `feed.xml` | Resolve against responseUrl |

### Invalid States

| State | Example | Handling |
|-------|---------|----------|
| **Missing/null** | No `<link rel="self">` | Proceed without selfUrl |
| **Empty string** | `<link rel="self" href="">` | Treat as missing |
| **Malformed** | `not a url` | Attempt to resolve, else ignore |
| **Non-HTTP scheme** | `feed://example.com/rss` | Convert to HTTPS |
| **SSRF risk** | `http://169.254.169.254/` | Reject, use responseUrl |
| **Private IP** | `http://192.168.1.1/feed` | Reject, use responseUrl |

### Protocol Conversion

Non-standard feed protocols are converted before processing:

| Input | Output |
|-------|--------|
| `feed://example.com/rss` | `https://example.com/rss` |
| `feed:https://example.com/rss` | `https://example.com/rss` |
| `rss://example.com/feed` | `https://example.com/feed` |
| `pcast://example.com/podcast` | `https://example.com/podcast` |
| `itpc://example.com/podcast` | `https://example.com/podcast` |

---

## Response Behaviors

### Redirect Relationships

| Scenario | Diagram | Best Canonical |
|----------|---------|----------------|
| **No redirects** | `input = response` | Test normalized variants |
| **Input redirects to selfUrl** | `input → selfUrl` | selfUrl (or cleaner) |
| **selfUrl redirects to input** | `selfUrl → input` | input (or cleaner) |
| **Both redirect to third URL** | `input → X ← selfUrl` | X (or cleaner) |
| **Redirect chain** | `input → A → B → response` | response (or cleaner) |

### Content Comparison

| Scenario | Action |
|----------|--------|
| **Same content hash** | URLs are equivalent, use cleanest |
| **Different content hash** | URLs serve different feeds |
| **Same feed signature** | Same feed, different encoding/timestamps |
| **One returns error** | Use the working URL |
| **Both return errors** | Fail canonicalization |

### HTTP Status Handling

| Status | Interpretation |
|--------|----------------|
| 200-299 | Success, can compare content |
| 301, 308 | Permanent redirect, follow |
| 302, 307 | Temporary redirect, follow but note |
| 304 | Not modified, use cached |
| 400-499 | Client error, URL doesn't work |
| 500-599 | Server error, retry or skip |

---

## The Algorithm

### Overview

The algorithm uses two URL sources:
- **responseUrl**: Where the server responded (after redirects) - verified working
- **selfUrl**: Publisher's declared canonical URL - needs validation

Only ONE source is used for variant generation. selfUrl is preferred if it validates successfully.

### Phase 1: Initial Fetch

```typescript
const response = await fetch(inputUrl)
const responseUrl = response.url  // After redirects
const responseBody = response.body
const responseHash = hash(responseBody)
```

### Phase 2: Extract and Normalize Self URL

```typescript
const parsed = parse(responseBody)
const rawSelfUrl = parsed.selfUrl

// Basic normalization only: resolve relative, add protocol, convert feed://
const selfUrl = resolveUrl(rawSelfUrl, responseUrl)

// Validate for SSRF
if (selfUrl && !isSafeUrl(selfUrl)) {
  selfUrl = null
}
```

### Phase 3: Validate Self URL

```typescript
let variantSource: string

if (selfUrl && selfUrl !== responseUrl) {
  // Fetch selfUrl as-is (no cleanliness normalization yet)
  const selfResponse = await fetch(selfUrl)

  if (selfResponse.ok) {
    const selfHash = hash(selfResponse.body)

    if (selfHash === responseHash) {
      // selfUrl is valid - use it as source for variants
      variantSource = selfUrl
    } else {
      // Different content - use responseUrl
      variantSource = responseUrl
    }
  } else {
    // selfUrl doesn't work - use responseUrl
    variantSource = responseUrl
  }
} else {
  // No selfUrl or same as responseUrl
  variantSource = responseUrl
}
```

### Phase 4: Generate Cleanliness Variants

```typescript
// Apply normalization presets to generate variants
const variants = normalizePresets.map(preset => ({
  url: normalizeUrl(variantSource, preset),
  cleanliness: calculateCleanliness(normalizeUrl(variantSource, preset)),
}))

// Deduplicate (same URL from different presets)
const unique = deduplicateByUrl(variants)

// Sort by cleanliness (highest first)
const sorted = unique.sort((a, b) => b.cleanliness - a.cleanliness)
```

### Phase 5: Test Variants (Cleanest First)

```typescript
for (const variant of sorted) {
  // Skip if same as variantSource (already verified via selfUrl validation)
  if (variant.url === variantSource) {
    continue
  }

  // Skip if same as responseUrl (already known to work)
  if (variant.url === responseUrl) {
    return { url: responseUrl, reason: 'response_url' }
  }

  // Test this variant
  const variantResponse = await fetch(variant.url)

  // Skip on error (fail fast)
  if (!variantResponse.ok) {
    continue
  }

  // Verify content matches
  const variantHash = hash(variantResponse.body)
  if (variantHash === responseHash) {
    return { url: variant.url, reason: 'content_verified' }
  }

  // Content differs - skip this variant
}

// No cleaner variant worked - use variantSource
return { url: variantSource, reason: 'fallback' }
```

### Phase 6: HTTPS Upgrade (Final Step)

```typescript
if (result.url.startsWith('http://')) {
  const httpsUrl = result.url.replace('http://', 'https://')

  const httpsResponse = await fetch(httpsUrl)

  if (httpsResponse.ok) {
    const httpsHash = hash(httpsResponse.body)
    if (httpsHash === responseHash) {
      return { url: httpsUrl, reason: 'upgrade_https' }
    }
  }
}

return result
```

---

## Normalization Presets

Instead of abstract "levels", we use explicit option presets:

```typescript
export const normalizePresets: NormalizeOptions[] = [
  // Most aggressive: strip www, trailing slash, tracking params
  {
    www: true,
    trailingSlash: true,
    strippedParams: defaultStrippedParams,
    port: true,
    hash: true,
    slashes: true,
    // ... other options
  },
  // Moderate: keep www
  {
    www: false,
    trailingSlash: true,
    strippedParams: defaultStrippedParams,
    // ...
  },
  // Conservative: keep www and trailing slash
  {
    www: false,
    trailingSlash: false,
    strippedParams: defaultStrippedParams,
    // ...
  },
]
```

Each preset produces one variant. Variants are deduplicated and scored.

---

## Request Budget

| Phase | Requests | Notes |
|-------|----------|-------|
| Initial fetch | 1 | Required |
| Validate selfUrl | 0-1 | Only if selfUrl exists and differs |
| Test variants | 0-N | Until match found or budget exhausted |
| HTTPS upgrade | 0-1 | Only if result is HTTP |

**Typical scenarios:**
- Already clean URL: 1 request
- selfUrl valid, cleanest works: 2-3 requests
- selfUrl invalid, fallback to responseUrl: 2-4 requests
- HTTPS upgrade needed: +1 request

---

## Edge Cases

### Case 1: Tracking Parameters Only Difference

```
Input:    https://example.com/feed?utm_source=twitter
Response: https://example.com/feed?utm_source=twitter
Self:     https://example.com/feed?utm_source=rss

Candidates (sorted by cleanliness):
  1. https://example.com/feed           (L4 normalization)
  2. https://example.com/feed?utm_source=rss
  3. https://example.com/feed?utm_source=twitter

Test #1: https://example.com/feed → 200, same hash
Result:  https://example.com/feed ✓
```

### Case 2: WWW Mismatch

```
Input:    https://www.example.com/feed
Response: https://www.example.com/feed
Self:     https://example.com/feed

Candidates:
  1. https://example.com/feed           (L4 from self)
  2. https://www.example.com/feed       (original)

Test #1: https://example.com/feed → 200, same hash
Result:  https://example.com/feed ✓
```

### Case 3: HTTP to HTTPS Upgrade

```
Input:    http://example.com/feed
Response: http://example.com/feed
Self:     http://example.com/feed

Phase 3: selfUrl === responseUrl, use responseUrl as source
Phase 4: Generate variants from http://example.com/feed
Phase 5: Test variants (all HTTP)
Phase 6: HTTPS upgrade
  Try https://example.com/feed → 200, same hash

Result:  https://example.com/feed ✓
```

### Case 4: Functional Query Parameters

```
Input:    https://example.com/feed.php?id=123&utm_source=twitter
Response: https://example.com/feed.php?id=123&utm_source=twitter
Self:     https://example.com/feed.php?id=123

Phase 3: Validate selfUrl
  Fetch https://example.com/feed.php?id=123 → 200, same hash
  selfUrl is valid, use as variant source

Phase 4: Generate variants (tracking params already stripped in selfUrl)
  Aggressive preset: https://example.com/feed.php?id=123 (no www to strip)

Phase 5: Variant matches source, no additional tests needed

Result:  https://example.com/feed.php?id=123 ✓
```

### Case 5: Self URL is Wrong

```
Input:    https://example.com/feed
Response: https://example.com/feed
Self:     https://example.com/old-feed  (incorrect self URL)

Phase 3: Validate selfUrl
  Fetch https://example.com/old-feed → 200, different hash
  selfUrl invalid, use responseUrl as source

Phase 4-5: Generate and test variants from responseUrl

Result:  https://example.com/feed ✓ (fallback to responseUrl)
```

### Case 6: Redirect Chain

```
Input:    https://old.example.com/rss
  → 301 → https://new.example.com/rss
  → 301 → https://example.com/feed
Response: https://example.com/feed
Self:     https://example.com/feed

Phase 3: selfUrl === responseUrl, use responseUrl as source
Phase 4-5: Variants all resolve to same URL, no tests needed

Result: https://example.com/feed ✓ (1 request total)
```

### Case 7: CDN Mirror

```
Input:    https://cdn.example.com/feed
Response: https://cdn.example.com/feed
Self:     https://example.com/feed

Phase 3: Validate selfUrl
  Fetch https://example.com/feed → 200, same hash
  selfUrl is valid, use as variant source

Phase 4: Generate variants from https://example.com/feed
  Already clean (no www, no trailing slash)

Result:  https://example.com/feed ✓ (prefers publisher's canonical)
```

### Case 8: Same Feed, Different Encoding

```
Input:    https://example.com/feed
Response: https://example.com/feed (hash: abc123)
Self:     https://www.example.com/feed

Test #1: https://example.com/feed (already response, cleaner)
Test #2: https://www.example.com/feed → 200, hash: def456 (different!)

Use signature comparison:
  Response signature: {title: "Blog", items: [...]}
  Self signature:     {title: "Blog", items: [...]}
  Signatures match!

Result: https://example.com/feed ✓ (cleaner, same feed)
```

### Case 9: Multiple Slashes

```
Input:    https://example.com//feed
Response: https://example.com//feed
Self:     https://example.com/feed

Candidates:
  1. https://example.com/feed           (L4 collapses slashes)
  2. https://example.com//feed          (original)

Test #1: https://example.com/feed → 200, same hash
Result:  https://example.com/feed ✓
```

### Case 10: Punycode Domain

```
Input:    https://münchen.example.com/feed
Response: https://xn--mnchen-3ya.example.com/feed
Self:     https://münchen.example.com/feed

Both normalize to: https://xn--mnchen-3ya.example.com/feed
Result: https://xn--mnchen-3ya.example.com/feed ✓
```

---

## Database Integration: existsFn

A key optimization is checking whether candidate URLs already exist in the database **before making HTTP requests**. This allows early termination when a known URL is found.

### The Problem

Without database awareness:
```
User subscribes to: https://www.example.com/feed/
We normalize to:    https://example.com/feed
We fetch both, compare hashes, return cleanest.

But wait - https://example.com/feed already exists in DB!
We wasted a network request.
```

### The Solution: existsFn Callback

```typescript
interface ExistsFnResult {
  url: string        // The URL that exists
  data?: unknown     // Optional: associated data (feed ID, etc.)
}

type ExistsFn = (urls: string[]) => Promise<ExistsFnResult | null>
```

The caller provides `existsFn` which checks if any of the given URLs exist in the database. Returns the first match or `null`.

### Integration Points

`existsFn` is called at two points:

**1. Before any fetch (cheapest)**
```typescript
const allCandidates = generateCandidates(inputUrl)
const existing = await existsFn(allCandidates.map(c => c.url))
if (existing) {
  return { url: existing.url, reason: 'exists_in_db', requests: 0 }
}
```

**2. After initial fetch, before testing**
```typescript
const inputResponse = await fetch(inputUrl)
const responseUrl = inputResponse.url
const selfUrl = extractSelfUrl(inputResponse.body)

const allCandidates = generateCandidates(inputUrl, responseUrl, selfUrl)
const existing = await existsFn(allCandidates.map(c => c.url))
if (existing) {
  return { url: existing.url, reason: 'exists_in_db', requests: 1 }
}
```

### Algorithm with existsFn

```typescript
async function canonicalize(inputUrl, options) {
  const { existsFn, fetchFn } = options

  // Phase 1: Pre-fetch existence check (optional, saves network call)
  if (existsFn && options.checkBeforeFetch) {
    const inputCandidates = generateCandidates(inputUrl)
    const existing = await existsFn(inputCandidates.map(c => c.url))
    if (existing) {
      return { url: existing.url, reason: 'exists_in_db', requests: 0 }
    }
  }

  // Phase 2: Initial fetch
  const inputResponse = await fetchFn(inputUrl)
  const responseUrl = inputResponse.url
  const responseHash = hash(inputResponse.body)
  const selfUrl = extractSelfUrl(inputResponse.body, responseUrl)

  // Phase 3: Post-fetch existence check (with full candidate list)
  if (existsFn) {
    const allCandidates = generateCandidates(inputUrl, responseUrl, selfUrl)
    const existing = await existsFn(allCandidates.map(c => c.url))
    if (existing) {
      return { url: existing.url, reason: 'exists_in_db', requests: 1 }
    }
  }

  // Phase 4: Progressive testing (no existing URL found)
  // ... continue with normal algorithm
}
```

### Feedstand Integration Example

```typescript
// In Feedstand's upsertChannel or similar:
const result = await canonicalize(userInputUrl, {
  existsFn: async (urls) => {
    // Check channels table
    const channel = await db.query.channels.findFirst({
      where: inArray(channels.url, urls),
    })
    if (channel) {
      return { url: channel.url, data: { channelId: channel.id } }
    }

    // Check aliases table
    const alias = await db.query.channelAliases.findFirst({
      where: inArray(channelAliases.url, urls),
    })
    if (alias) {
      const channel = await db.query.channels.findFirst({
        where: eq(channels.id, alias.channelId),
      })
      return { url: channel.url, data: { channelId: channel.id } }
    }

    return null
  },
})

if (result.reason === 'exists_in_db') {
  // Feed already exists, just add subscription
  return { channelId: result.data.channelId, isNew: false }
}
```

### Request Savings

| Scenario | Without existsFn | With existsFn |
|----------|------------------|---------------|
| URL exists in DB (exact) | 1-3 requests | 0 requests |
| Normalized variant exists | 2-3 requests | 1 request |
| New feed (no match) | 2-3 requests | 2-3 requests |

### Edge Cases

**existsFn returns URL not in candidate list**
- Shouldn't happen if existsFn only checks provided URLs
- If it does, trust the result (DB is authoritative)

**existsFn is slow**
- Consider caching in the caller
- Batch queries where possible
- May still be faster than HTTP requests

**Race condition: URL inserted between check and insert**
- Caller's responsibility (feedstand handles with upsert)
- feedcanon just returns the best URL, doesn't insert

---

## Configuration Options

```typescript
interface ProgressiveCanonicalizeOptions {
  // Maximum HTTP requests to make (excluding initial fetch)
  maxRequests?: number  // Default: 3

  // Normalization levels to test
  levels?: number[]  // Default: [5, 4, 3, 2, 1, 0]

  // Use feed signature comparison (slower but handles encoding differences)
  useSignature?: boolean  // Default: false

  // Check if URLs exist in database (early termination)
  existsFn?: (urls: string[]) => Promise<ExistsFnResult | null>

  // Check existence before initial fetch (saves network call if match found)
  checkBeforeFetch?: boolean  // Default: false

  // Custom verification function (SSRF protection)
  verifyFn?: (url: string) => boolean | Promise<boolean>

  // Custom fetch function
  fetchFn?: (url: string) => Promise<FetchResponse>

  // Custom hash function
  hashFn?: (content: string) => string | Promise<string>

  // Tracking parameters to strip at L3/L4
  trackingParams?: string[]

  // Prefer HTTPS even if HTTP works
  preferHttps?: boolean  // Default: true

  // Prefer no-www even if www works
  preferNoWww?: boolean  // Default: true
}
```

---

## Result Structure

```typescript
interface CanonicalizeResult {
  // The chosen canonical URL
  url: string

  // How the URL was determined
  reason:
    | 'response_url'       // Used responseUrl directly
    | 'redirect_verified'  // Normalized URL redirects to responseUrl
    | 'content_verified'   // Normalized URL has same content hash
    | 'signature_verified' // Normalized URL has same feed signature
    | 'fallback'           // No better URL found, using responseUrl

  // Number of HTTP requests made (excluding initial fetch)
  requests: number

  // Normalization level of the result
  level: number

  // Original source of the winning URL
  source: 'input' | 'response' | 'self'

  // All candidates that were considered
  candidates?: Candidate[]

  // Debug information
  debug?: {
    inputUrl: string
    responseUrl: string
    selfUrl: string | null
    testedUrls: string[]
  }
}
```

---

## Performance Characteristics

### Time Complexity

| Phase | Complexity |
|-------|------------|
| Generate candidates | O(sources × levels) = O(18) max |
| Deduplicate | O(candidates) |
| Sort | O(candidates × log(candidates)) |
| Test | O(maxRequests) HTTP round-trips |

### Space Complexity

O(unique candidates) ≈ O(18) maximum

### Network Cost

| Budget | Min Requests | Max Requests | Typical |
|--------|--------------|--------------|---------|
| 1 | 1 | 2 | 1-2 |
| 3 | 1 | 4 | 2-3 |
| 5 | 1 | 6 | 3-4 |

---

## Comparison with Current Implementation

| Aspect | Current (feedcanon) | Progressive |
|--------|---------------------|-------------|
| Candidates | 2 (input, self) | Up to 18 (deduplicated) |
| Normalization | Single level | 6 levels |
| Testing | Fixed order | Cleanliness-ranked |
| Requests | 1-3 | 1-N (configurable) |
| Result info | URL + reason | URL + reason + metadata |
| HTTPS upgrade | Separate method | Integrated in L4/L5 |
| WWW removal | Normalization only | Tested variant |

---

## Migration Path

### Phase 1: Add Progressive Mode

Add as opt-in feature alongside existing `canonicalize()`:

```typescript
import { canonicalize, progressiveCanonicalize } from 'feedcanon'

// Existing behavior
const result = await canonicalize(url, options)

// New progressive behavior
const result = await progressiveCanonicalize(url, {
  maxRequests: 3,
  levels: [4, 3, 2],
})
```

### Phase 2: Integrate into Default

Make progressive the default with conservative settings:

```typescript
const result = await canonicalize(url, {
  progressive: true,  // or { maxRequests: 2 }
})
```

### Phase 3: Deprecate Non-Progressive

Eventually make progressive the only mode.

---

## Design Decisions (Resolved)

### 1. No L5 (strip all params) by default

**Decision:** Only strip parameters explicitly listed in `strippedParams`. Never strip all params.

**Rationale:**
- L4 (tracking-only stripping) is aggressive enough
- Functional params like `?id=123`, `?format=rss` would break with L5
- Users can opt-in via `levels: [5, 4, 3, 2, 1, 0]` if needed

**Also:** Removed `ref`, `ref_src`, `ref_url`, `source`, `via` from default stripped params - too generic, often functional.

---

### 2. Fail fast on rate limiting

**Decision:** Skip variant on 429/5xx, try next candidate, fallback to responseUrl.

**Rationale:**
- feedcanon is a library, not a long-running service
- Caller (feedstand) handles retries at subscription level
- Keeps library simple and predictable
- responseUrl is always a known-good fallback

---

### 3. Cache within single call only

**Decision:** Deduplicate URLs during candidate generation within one `canonicalize()` call. No cross-call caching.

**Rationale:**
- Normalization is pure and cheap (no I/O)
- `generateCandidates()` already deduplicates by URL string
- Cross-call caching adds complexity for minimal gain
- Caller can cache at subscription level if needed

---

### 4. Sequential testing with early exit

**Decision:** Test variant URLs one-by-one in cleanliness order. Stop on first success.

**Rationale:**
- First success = best result (sorted by cleanliness)
- Parallel would waste requests (if #1 succeeds, #2-5 are useless)
- Sequential respects rate limits naturally
- With budget of 2-3 requests, adds ~200-600ms - acceptable

---

### 5. Tie-breaker: selfUrl > responseUrl > inputUrl

**Decision:** When multiple URLs have identical cleanliness scores and verified identical content, prefer selfUrl, then responseUrl, then inputUrl.

**Rationale:**
- At tie-breaker stage, all candidates are validated (same content hash)
- selfUrl represents publisher's explicit canonical declaration
- responseUrl is server-controlled, not explicit intent
- inputUrl may have user typos or tracking
- Research: FreshRSS issues were from *blind* trust; our validation eliminates that risk
