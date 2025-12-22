# Feed Reader Canonicalization Comparison

Analysis of how 13 prominent feed readers handle URL canonicalization, selfURL, and deduplication. Research conducted to inform feedcanon's design and validate feedstand's architecture.

---

## Project Scope Clarification

This research applies to two related but distinct projects:

| Project | Responsibility | Scope |
|---------|---------------|-------|
| **feedcanon** | URL canonicalization library | Determining the "best" canonical URL from input, response, and self URLs |
| **feedstand** | Feed reader application | Storage, aliases, subscriptions, redirects, deduplication |

Many lessons from other readers apply to **feedstand's architecture**, not feedcanon's algorithm. This document marks each lesson with its applicable project.

---

## Executive Summary

### The Core Finding

**Almost no feed readers use selfURL for canonicalization.** Of 13 readers analyzed, only 2 (FreshRSS, Feeder) even consider selfURL, and both caused user complaints that led to behavioral changes.

### What Feedstand Already Does Right

Feedstand's architecture already handles most of the problems other readers struggle with:

| Problem | How Others Fail | How Feedstand Solves It |
|---------|-----------------|------------------------|
| Losing original URL | Most overwrite URL in-place | Stores via `aliases` table linked to `sources` |
| No deduplication | Exact URL match only | Alias lookup before channel creation |
| SelfURL conflicts | Either ignore or blindly trust | `chooseFeedUrl()` validates with hash comparison |
| Race conditions | Application-level checks | DB transactions + unique constraints |
| No redirect tracking | URL immutable or lost | Stores both requestUrl and responseUrl as aliases |

### What This Research Validates

1. **Feedstand's alias architecture is best-in-class** - Only NewsBlur has similar (but reactive, not proactive)
2. **SelfURL skepticism is correct** - FreshRSS/Feeder learned this the hard way
3. **Progressive URL testing is novel** - No other reader does what feedcanon proposes

---

## Detailed Reader Analysis

### 1. NewsBlur

**Type:** Commercial SaaS | **Language:** Python/Django

| Aspect | Approach |
|--------|----------|
| SelfURL | **NOT USED** - stores website homepage, not feed selfURL |
| Redirects | After 10 consecutive, updates stored URL |
| Normalization | RFC-compliant only (no http/https, www, trailing slash) |
| Deduplication | Reactive: create then merge on hash collision |

**Key Issue:** OPML imports create temporary duplicates before merge.

---

### 2. Feedbin

**Type:** Commercial SaaS | **Language:** Ruby/Rails

| Aspect | Approach |
|--------|----------|
| SelfURL | Stored, used **only** for WebSub |
| Redirects | Requires 576 consecutive (6 days) before persisting |
| Normalization | Minimal (add scheme if missing) |
| Deduplication | `feed_url` immutable - shared infrastructure prevents changes |

**Philosophy:** "What you subscribe to is what you get" - extreme conservatism.

---

### 3. Miniflux

**Type:** Self-hosted | **Language:** Go

| Aspect | Approach |
|--------|----------|
| SelfURL | Parsed then discarded |
| Redirects | Follows, stores effective URL, **no 301/302 distinction** |
| Normalization | Scheme-relative only |
| Deduplication | Per-user isolation (1000 users = 1000 fetches) |

**Bug:** Treating 302 same as 301 broke redirect services.

---

### 4. FreshRSS

**Type:** Self-hosted | **Language:** PHP

| Aspect | Approach |
|--------|----------|
| SelfURL | **THE OUTLIER** - originally auto-updated to selfURL |
| User Complaints | HTTPS→HTTP downgrades, unexpected URL changes |
| Resolution | Now only uses selfURL when WebSub enabled |

**Lesson:** Blindly trusting selfURL causes user frustration.

---

### 5. CommaFeed

**Type:** Self-hosted | **Language:** Java

| Aspect | Approach |
|--------|----------|
| SelfURL | Stored, used **only** for relative URL resolution |
| Redirects | Two-level caching: `url` + `urlAfterRedirect` |
| Normalization | **Most aggressive:** lowercase, HTTPS→HTTP, strip www, FeedBurner handling |
| Deduplication | `normalizedUrl` + `normalizedUrlHash` (SHA1) |

**Best practice:** Opportunistic HTTPS upgrade when subscriber uses HTTPS.

---

### 6-13. Summary of Others

| Reader | SelfURL | Key Characteristic |
|--------|---------|-------------------|
| NetNewsWire | Not used | URL immutable, users create scripts to find duplicates |
| tt-rss | Not handled | SimplePie limitations, redirects not persisted |
| lemon24-reader | Not used | Manual `change_feed_url()` required |
| Brief | Ignored | Zero normalization, ~20% storage waste |
| Feeder | Was used → removed | Changed after user issues |
| Winds | Not used for dedup | Manual admin merge for duplicates |
| Liferea | Not used | Best redirect model: `source` + `orig_source` |
| Nextcloud | Display only | Tracks redirects but no deduplication |

---

## Lessons by Project

### Lessons for Feedcanon (Library)

These apply to the URL canonicalization algorithm itself:

#### ✅ FC-1: SelfURL as Hint, Not Authority

| Finding | Implication |
|---------|-------------|
| FreshRSS tried selfURL → complaints | Don't auto-adopt selfURL |
| Feeder removed selfURL feature | Validate before using |
| Publishers misconfigure it | Treat as unreliable metadata |

**Current feedcanon approach:** SelfURL is one of several URL sources, validated via content hash before adoption. ✓ Correct.

#### ✅ FC-2: Platform Handlers Are Valuable

| Finding | Implication |
|---------|-------------|
| Only CommaFeed handles FeedBurner | Platform-specific rules catch more duplicates |
| Query params differ by platform | FeedBurner params = tracking, others = functional |

**Current feedcanon approach:** Has `defaultPlatforms` with FeedBurner handler. Could expand to YouTube, etc.

#### ✅ FC-3: Progressive Testing Is Novel

| Finding | Implication |
|---------|-------------|
| Most readers: one URL or nothing | Miss optimization opportunities |
| CommaFeed: aggressive normalization | Risk of false positives |

**Current feedcanon approach:** Generate variants → score by cleanliness → test progressively → verify with hash. Best of both worlds.

#### ✅ FC-4: Content Hash Verification

| Finding | Implication |
|---------|-------------|
| Winds uses fingerprinting | Content-based verification works |
| Most readers: no verification | Accept any URL that responds |

**Current feedcanon approach:** `responseHash` and `feedDataHash` methods verify URL variants serve same feed. ✓ Correct.

#### ⚠️ FC-5: HTTPS Preference vs Normalization

| Finding | Implication |
|---------|-------------|
| CommaFeed normalizes HTTPS→HTTP | Dedup works, but loses security signal |
| Most readers: no protocol normalization | Duplicates for http/https variants |

**Current feedcanon approach:** Separate concepts - normalize for comparison, but prefer HTTPS as canonical when both work.

---

### Lessons for Feedstand (Application)

These apply to the feed reader architecture, **most already implemented**:

#### ✅ FS-1: Alias Architecture (ALREADY IMPLEMENTED)

| Finding | Other Readers |
|---------|---------------|
| Most readers lose original URL | NewsBlur has reactive merge |
| Users want to see "their" URL | Most show canonical instead |

**Feedstand implementation:**
- `channels` table: canonical `feedUrl`
- `aliases` table: maps all URLs to channel
- `sources` table: links users to aliases
- User sees their original subscription URL ✓

#### ✅ FS-2: Multiple URL Storage (ALREADY IMPLEMENTED)

| Finding | Other Readers |
|---------|---------------|
| Liferea: `source` + `orig_source` | Best model |
| Most: single URL field | No recovery possible |

**Feedstand implementation:**
- Stores requestUrl and responseUrl as separate aliases
- Stores selfUrl in channel metadata
- Can fall back to aliases if canonical breaks ✓

#### ✅ FS-3: Proactive vs Reactive Deduplication (ALREADY IMPLEMENTED)

| Finding | Other Readers |
|---------|---------------|
| NewsBlur: create then merge | Brief duplication window |
| Most: no deduplication | Full duplicates |

**Feedstand implementation:**
- Checks aliases BEFORE creating channel
- DB unique constraints prevent race conditions
- No duplication window ✓

#### ✅ FS-4: Not Blindly Trusting SelfURL (ALREADY IMPLEMENTED)

| Finding | Other Readers |
|---------|---------------|
| FreshRSS: auto-adopted → complaints | Reverted feature |
| Feeder: auto-adopted → complaints | Removed feature |

**Feedstand implementation:**
- `chooseFeedUrl()` validates selfURL via hash comparison
- Only uses selfURL if verified to serve same content
- Falls back to responseUrl if validation fails ✓

#### 🗓️ FS-5: Redirect Stability Window (ROADMAP)

| Finding | Other Readers |
|---------|---------------|
| Feedbin: 576 occurrences (6 days) | Prevents transient issues |
| Miniflux: immediate (no distinction) | Broke redirect services |
| Liferea: permanent only (301/308) | Good but no stability check |

**Current Feedstand behavior:** Follows redirects at scan time, never updates `feedUrl`.

**Proposed optimization:** Update canonical URL only after redirect persists for N scans.

**Why it matters at scale:**
```
2,000,000 feeds × 100ms redirect overhead = ~55 hours extra latency per cycle
2,000,000 feeds × ~500 bytes redirect = ~1GB extra bandwidth per cycle
```

**Implementation sketch:**
1. Track `redirectCount` and `lastRedirectUrl` per channel
2. On scan: if response URL differs from `feedUrl`, increment counter
3. If same redirect persists for N scans (e.g., 10 = ~2-3 days), update `feedUrl`
4. Reset counter if redirect destination changes
5. Only count 301/308 (permanent), ignore 302/307 (temporary)

---

### Lessons Not Applicable

These are problems feedcanon/feedstand don't have due to good architecture:

| Problem | Why N/A |
|---------|---------|
| "Users can't edit feed URLs" | Alias system - just add new alias |
| "No bulk URL update" | Change canonical, all aliases follow |
| "Duplicates after OPML import" | Alias lookup prevents this |
| "Cross-user duplication" | Single channel shared via aliases |

---

## Comparison Matrix: SelfURL Handling

| Reader | Parses | Uses for Canonical | User Complaints |
|--------|--------|-------------------|-----------------|
| NewsBlur | No | No | - |
| Feedbin | Yes | WebSub only | - |
| Miniflux | Yes (discards) | No | - |
| FreshRSS | Yes | Was: Yes → Now: WebSub only | **Major complaints** |
| CommaFeed | Yes | No (relative URLs only) | - |
| Feeder | Yes | Was: Yes → Removed | **Led to change** |
| Others (7) | No | No | - |
| **Feedstand** | **Yes** | **Validated via hash** | **N/A (validation)** |

---

## Comparison Matrix: URL Normalization

| Reader | Protocol | www | Trailing Slash | Platform Handlers |
|--------|----------|-----|----------------|-------------------|
| CommaFeed | HTTPS→HTTP | Yes | FeedBurner only | FeedBurner |
| Winds | No | Yes | No | No |
| NewsBlur | No | No | No | No |
| Most others | No | No | No | No |
| **Feedcanon** | **Configurable** | **Yes** | **Yes** | **FeedBurner (+extensible)** |

---

## Validated Design Decisions

Based on this research, feedcanon/feedstand's design is validated:

### Feedcanon

| Decision | Validation |
|----------|------------|
| SelfURL as one source among many | FreshRSS/Feeder proved blind trust fails |
| Content hash verification | Novel - no other reader does this for URL selection |
| Progressive variant testing | Novel - best of aggressive + safe approaches |
| Platform handlers (extensible) | CommaFeed shows value, ours is more flexible |
| Cleanliness scoring | Novel - objective selection criteria |

### Feedstand

| Decision | Validation |
|----------|------------|
| Alias table architecture | Only NewsBlur similar, ours is proactive |
| Sources → Aliases → Channels | Preserves user intent, enables deduplication |
| `chooseFeedUrl()` with validation | Unique - others either ignore or blindly trust selfURL |
| Storing requestUrl + responseUrl | Matches best practice (Liferea's dual-URL) |
| DB unique constraints | Prevents race conditions others have |

---

## Recommendations

### For Feedcanon

1. **Expand platform handlers** - Add YouTube, Medium, Substack handlers
2. **Document cleanliness scoring** - Make algorithm transparent
3. **Consider HTTPS upgrade testing** - Already in code, ensure it's used

### For Feedstand

1. **🗓️ Implement redirect stability window** - Update `feedUrl` only after N consecutive 301/308 redirects to same destination. At 2M feeds, saves ~55 hours latency and ~1GB bandwidth per scan cycle.
2. **Document the architecture** - The alias system is best-in-class but not documented

### Not Needed (Already Solved)

- ~~Preserve original URL~~ → Alias system
- ~~Database constraints~~ → Already unique on feedUrl and aliasUrl
- ~~Validate selfURL~~ → Hash comparison in chooseFeedUrl
- ~~Cross-user deduplication~~ → Single channel per canonical URL

---

## Sources

- Source code analysis of 13 feed readers
- GitHub issue searches for URL/redirect/duplicate problems
- Forum discussions about user complaints
- Existing analysis in `../feedstand/feed-dedupe-comparison/`

---

_Last updated: December 2024_
