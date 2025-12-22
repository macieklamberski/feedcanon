# Feedcanon Issues and Edge Cases

Practical analysis of real-world problems in feedcanon's URL canonicalization. Focused on issues that actually occur in production feeds.

---

## Severity Legend

| Level | Description |
|-------|-------------|
| **HIGH** | Significant missed deduplication or broken functionality |
| **MEDIUM** | Edge cases that affect subset of feeds |
| **LOW** | Rare edge cases or already partially handled |

---

## HIGH Priority

### 1. No XML-Level Redirect Support

**Problem:** Feedcanon only handles HTTP redirects but ignores podcast `<itunes:new-feed-url>` tags.

**Real-world frequency:** Rare - only occurs during podcast host migrations. However, when it happens, it's important.

**Nuance:** HTTP 301 redirects are almost always set up alongside `itunes:new-feed-url`. The XML tag is primarily for podcast apps that cache feed URLs locally. For initial canonicalization, HTTP redirects usually suffice.

**Evidence:**
```xml
<itunes:new-feed-url>https://newhost.com/podcast.xml</itunes:new-feed-url>
```

**Integration:** Feedsmith already parses `itunes.newFeedUrl` and `googleplay.newFeedUrl`.

**Recommendation:** When parsed feed data is available, check for `newFeedUrl` and consider it as a redirect target.

---

### 2. No `existsFn` Database Integration

**Problem:** Current implementation doesn't check if URLs already exist in database before fetching.

**Real-world frequency:** 100% of use cases would benefit.

**Impact:**
- Wasted HTTP requests when feed already exists
- Higher latency for subscription operations
- No early termination opportunity

**Current worst case:** 3+ HTTP requests even when feed exists in DB.
**With existsFn:** 0 HTTP requests if any candidate URL matches DB.

**Recommendation:** Implement `existsFn` callback as specified in PROGRESSIVE.md.

---

### 3. Rate Limiting During Multi-Request Canonicalization

**Problem:** Canonicalization can make multiple requests to the same domain (original, normalized, HTTPS upgrade, redirects). No handling of `Retry-After` header on 429 responses.

**Real-world frequency:** Occasional - depends on server configuration and request volume.

**Impact:**
- Canonicalization fails mid-process
- No backoff between variant attempts
- Potential IP blocking for aggressive patterns

**Recommendation:**
1. Parse and respect `Retry-After` header
2. Add configurable delay between requests to same domain
3. Surface rate limiting info to caller

---

## MEDIUM Priority

### 4. FeedBurner URL Normalization Missing

**Problem:** No special handling for FeedBurner's multiple equivalent URL formats.

**Real-world frequency:** Declining - FeedBurner is legacy (Google abandoned active development). Still affects older feeds.

**Equivalent URLs not being normalized:**
```
http://feeds.feedburner.com/blog
http://feeds2.feedburner.com/blog
http://feedproxy.google.com/blog
```

**Impact:** Same legacy feed creates multiple channel records.

**Recommendation:** Add FeedBurner-specific normalization rules.

---

### 5. Volatile Feed Fields Affect Hash Comparison

**Problem:** Some feed fields change on every request even when content is semantically identical.

**Real-world frequency:** Common - many feeds update `lastBuildDate` on each request.

**Fields that commonly change:**
```xml
<lastBuildDate>Thu, 19 Dec 2024 10:15:32 GMT</lastBuildDate>
<generator>WordPress 6.4.2</generator>
```

**Impact:** Raw byte hash comparison fails for identical feeds.

**Note:** Dynamic Ad Insertion (DAI) does NOT affect RSS XML - ads are stitched into audio files server-side. The RSS structure stays identical.

**Fields to EXCLUDE from `feedDataHash`:**
- `lastBuildDate`, channel-level `pubDate`
- `ttl`, `skipHours`, `skipDays`
- `generator`, `docs`

**Stable fields for hashing:**
- Feed title, link, description
- Item GUIDs, titles, links, pubDates
- Enclosure URLs

**Recommendation:** Implement `feedDataHash` using only stable parsed fields.

---

### 6. BOM (Byte Order Mark) Handling

**Problem:** UTF-8 BOM presence/absence changes hash but not semantic meaning.

**Real-world frequency:** ~2-5% of feeds (typically Windows-generated).

**Evidence:**
```
With BOM:    EF BB BF 3C 3F 78 6D 6C  (hash: abc123)
Without BOM:          3C 3F 78 6D 6C  (hash: def456)
```

**Impact:** Same feed content produces different hashes.

**Recommendation:** Strip BOM before hashing.

---

## LOW Priority

### 7. Trailing Slash Normalization

**Problem:** Removing trailing slashes could theoretically merge different resources.

**Real-world frequency:** Rare for feed URLs - most are paths like `/feed.xml` or `/rss`.

**Example:**
- `https://example.com/blog` (file)
- `https://example.com/blog/` (directory index)

**Current behavior:** Feedcanon removes trailing slashes by default.

**Recommendation:** Make trailing slash normalization configurable; current default is reasonable for feeds.

---

### 8. Query Parameter Edge Cases

**Problem:** Stripping tracking parameters could theoretically break feeds using similar-named functional parameters.

**Real-world frequency:** Rare - the 138 params we strip are well-known trackers (utm_*, fbclid, etc.).

**Example risk:**
- `?source=api` might be functional (unlikely)
- `?ref=header` might select feed variant (unlikely)

**Recommendation:** Document limitation; consider domain-specific whitelists if real cases emerge.

---

## Intentionally Out of Scope

These are NOT issues for feedcanon (a canonicalization library):

| Topic | Why Out of Scope |
|-------|------------------|
| **BiDi/Homograph attacks** | UI display concern, not canonicalization. Feedcanon correctly treats different domains as different. |
| **Conditional GET (ETag)** | Polling optimization - feedcanon does initial canonicalization, not repeated fetching. |
| **Meta refresh redirects** | Feed discovery concern, not canonicalization. |
| **Platform-specific discovery** | Medium relative URLs, YouTube handles - these are discovery issues. |
| **Redirect stability** | Caller's responsibility (Feedbin's 6-day confirmation). |
| **Caching** | Caller's responsibility. |
| **Concurrency control** | Database layer responsibility. |
| **Audit trail** | Optional debugging, not core functionality. |

---

## Summary

| Priority | Count | Key Issues |
|----------|-------|------------|
| **HIGH** | 3 | XML redirects, existsFn, rate limiting |
| **MEDIUM** | 3 | FeedBurner, volatile fields, BOM |
| **LOW** | 2 | Trailing slash, query params |
| **Total** | **8** | |

---

## Recommended Implementation Order

### Phase 1: Core Functionality
1. `existsFn` database integration - biggest performance win
2. Rate limiting awareness - prevent failures during canonicalization

### Phase 2: Content Comparison
3. BOM stripping before hash
4. Volatile field exclusion from `feedDataHash`

### Phase 3: URL Normalization
5. FeedBurner normalization rules
6. XML-level redirect support (when feed data available)

### Phase 4: Edge Cases
7. Trailing slash configurability
8. Query parameter refinements

---

_Revised December 2024 after critical analysis of real-world feed data. Removed theoretical issues (BiDi, homograph, gzip timestamps, Unicode NFC) that don't occur in practice._
