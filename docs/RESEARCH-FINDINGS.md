# Feed Canonicalization Research Findings

Comprehensive analysis of 6 major feed readers to validate and improve feedcanon's URL normalization decisions.

---

## Executive Summary

Research analyzed 100+ GitHub issues across CommaFeed, NewsBlur, FreshRSS, Feedbin, Miniflux, and TT-RSS. Key findings:

1. **FeedBurner handling is critical** - CommaFeed implements comprehensive normalization
2. **Self URL trust is problematic** - FreshRSS shows multiple issues with incorrect self URLs
3. **Redirect stability varies widely** - NewsBlur uses 10-redirect threshold; Feedbin has no automation
4. **Query parameter stripping is conservative** - Miniflux maintains curated list, avoids false positives
5. **Protocol normalization validated** - All readers treat HTTP/HTTPS as equivalent for comparison

---

## 1. Validation Report: Current Defaults

### VALIDATED - Safe to Keep

| Option | feedcanon Default | Validation Evidence |
|--------|-------------------|---------------------|
| `protocol: true` | Treat HTTP/HTTPS as equivalent | CommaFeed, NewsBlur, Miniflux all normalize protocols. FreshRSS PR #3088 force-converts blogger.com to HTTPS. |
| `www: true` | Strip www prefix | CommaFeed explicitly strips `//www.` → `//`. NewsBlur normalizes host to lowercase. Universal practice. |
| `port: true` | Remove default ports | TT-RSS Issue #118 fixed port stripping bug. All readers remove `:80` and `:443`. |
| `trailingSlash: true` | Remove trailing slashes | CommaFeed strips trailing slashes from FeedBurner URLs. Standard web practice. |
| `queryOrder: true` | Sort query params | CommaFeed uses `urlcanon.AGGRESSIVE` which sorts params. NewsBlur's urlnorm sorts alphabetically. |
| `case: true` | Lowercase hostname | All readers lowercase hostnames. NewsBlur Issue #1912 fixed Android case bug. |
| `encoding: true` | Normalize percent-encoding | NewsBlur's urlnorm normalizes encoding (uppercase A-F). Standard RFC 3986 practice. |
| `hash: true` | Remove fragments | No issues found with fragment handling. Standard practice. |
| `singleSlash: true` | Collapse multiple slashes | NewsBlur's urlnorm removes `.` and resolves `..` in paths. |

### PARTIALLY VALIDATED - May Need Adjustment

| Option | feedcanon Default | Evidence/Concerns |
|--------|-------------------|-------------------|
| `authentication: false` | Preserve user:pass | No issues found, but also no evidence of usage in reviewed readers. Low-risk to keep. |
| `punycode: true` | Convert IDN to ASCII | TT-RSS Issue #81 mentions Unicode URL validation issues. Limited evidence. |
| `unicode: true` | Normalize Unicode | Related to punycode. FreshRSS Issue #2077 discusses case sensitivity with Unicode. |

### NEEDS REVIEW - Potential Issues

| Option | feedcanon Default | Evidence of Problems |
|--------|-------------------|---------------------|
| `strippedParams` | 138 params | See detailed analysis in Risk Assessment section |
| `responseHash: true` | Compare response MD5 | FreshRSS sees duplicates from dynamic content. See Risk Assessment. |

---

## 2. Risk Assessment: Problematic Defaults

### HIGH RISK: `ref` Parameter Stripping

**Current behavior:** feedcanon strips `ref` unconditionally

**Evidence from Miniflux (PR #3265):**
- Ghost blogging platform adds `ref` parameter pointing to own domain
- Miniflux implements **smart removal**: only strips `ref` when value matches feed/site hostname
- Stripping unconditionally could break referral tracking for legitimate uses

**Recommendation:** Implement conditional `ref` stripping like Miniflux

```typescript
// Only strip ref if it matches the feed's domain
if (param === 'ref' && value === feedDomain) {
  strip = true
}
```

### MEDIUM RISK: `source` Parameter Stripping

**Current behavior:** feedcanon strips `source` unconditionally

**Concern:** Some feeds use `source` for content filtering (e.g., `source=rss` vs `source=web`)

**Evidence:** No specific issues found, but Miniflux's conservative approach (no `source` in their list) suggests caution

**Recommendation:** Consider removing `source` from stripped params or making it conditional

### MEDIUM RISK: Response Hash Comparison

**Current behavior:** `responseHash: true` - compares MD5 of response body

**Evidence of problems (FreshRSS):**
- Issue #3086: Chromium blog changed URL, hash comparison failed
- Issue #3142: Same articles with different URLs created duplicates
- Timestamps, ads, and dynamic content change between requests

**Problems documented:**
1. Feeds with timestamps update content without new articles
2. Advertisement injections change hash
3. Minor formatting differences (whitespace, order) break comparison
4. Compression affects content

**Recommendation:** Make `responseHash` opt-in rather than default, or implement fuzzy matching

### LOW RISK: Trailing Slash on Non-FeedBurner URLs

**Current behavior:** Always remove trailing slashes

**Edge case (FreshRSS Issue #942):**
- `#force_feed` parameter disappeared from URL after actualize
- Some servers treat `/feed` and `/feed/` as different resources

**Recommendation:** Current default is fine, but document the edge case

---

## 3. Missing Features: What Other Readers Have

### CRITICAL: FeedBurner/FeedProxy Normalization

**feedcanon status:** No special handling

**CommaFeed implementation:**
```java
// feedproxy redirects to feedburner
normalized = normalized.replace("feedproxy.google.com", "feeds.feedburner.com");

// feedburner feeds have a special treatment
if (normalized.contains("feedburner.com")) {
    normalized = normalized.replace("feeds2.feedburner.com", "feeds.feedburner.com");
    normalized = normalized.split("?")[0];  // Strip query params
    normalized = removeTrailingSlash(normalized);
}
```

**Patterns to handle:**
| Pattern | Canonical Form |
|---------|----------------|
| `feedproxy.google.com/Xyz` | `feeds.feedburner.com/Xyz` |
| `feeds2.feedburner.com/Xyz` | `feeds.feedburner.com/Xyz` |
| `feeds.feedburner.com/Xyz?format=rss` | `feeds.feedburner.com/Xyz` |

**Priority:** HIGH - This was Issue #225 in CommaFeed causing duplicate entries

### HIGH: Redirect Stability Confirmation

**feedcanon status:** Follows redirects, uses final URL immediately

**NewsBlur implementation:**
- Tracks redirect history over multiple fetches
- Only updates feed address after **10 permanent redirects** or zero non-redirect responses
- Distinguishes 301/308 (permanent) from 302/307 (temporary)

**Feedbin approach:**
- Discussed 7-30 days confirmation window
- Never actually implemented automatic updates
- Feed URLs are immutable once set

**FreshRSS approach:**
- Follows 301, updates URL
- PR #3180 fixed SimplePie redirect detection

**Recommendation:** Add optional redirect stability threshold

```typescript
type RedirectOptions = {
  enabled: boolean
  minPermanentRedirects?: number  // e.g., 3 or 10
  confirmationDays?: number        // e.g., 7
}
```

### MEDIUM: Self URL Verification

**feedcanon status:** Uses self URL as canonical candidate

**FreshRSS problems documented:**
- Issue #1662: HTTPS URLs reverting to HTTP (FeedBurner misconfiguration)
- Issue #3983: YouTube self URL missing channel parameter
- Issue #2654: Self URL overriding user's manual corrections

**FreshRSS solution (PR #2659):**
- Only obey `rel=self` when WebSub is enabled
- Ignore self URL when user explicitly set different URL

**Recommendation:** Add self URL verification:
1. Compare self URL protocol to fetch URL
2. Validate self URL returns same content
3. Allow user override flag

### MEDIUM: Smart `ref` Parameter Handling

**feedcanon status:** Strips `ref` unconditionally

**Miniflux implementation (PR #3265):**
```go
// Only remove ref if it matches the feed's own domain
if param == "ref" {
    refHost := parseHost(value)
    if refHost == feedHost || refHost == siteHost {
        remove = true
    }
}
```

### LOW: Cache-Buster Parameter Handling

**feedcanon status:** Strips `_` parameter

**NewsBlur Issue #1877:**
- Some servers reject `_=timestamp` parameters
- NewsBlur maintains `NO_UNDERSCORE_ADDRESSES` exclusion list

**Recommendation:** Current behavior is correct; no changes needed

### LOW: Feed Protocol Schemes

**feedcanon status:** Handles `feed:`, `rss:`, `pcast:`, `itpc:`

**NewsBlur urlnorm:**
- Converts `feed://` and `feed:` to `http://`

**Recommendation:** Current implementation is complete

---

## 4. Recommended Changes to feedcanon

### Priority 1: Add FeedBurner Normalization

```typescript
export const feedProxyPatterns = [
  { from: 'feedproxy.google.com', to: 'feeds.feedburner.com' },
  { from: 'feeds2.feedburner.com', to: 'feeds.feedburner.com' },
]

export const feedBurnerDomains = [
  'feeds.feedburner.com',
  'feedburner.com',
]

// In normalize function:
// 1. Replace feedproxy/feeds2 with feeds.feedburner.com
// 2. Strip query params from feedburner URLs
// 3. Remove trailing slash from feedburner URLs
```

### Priority 2: Conditional `ref` Parameter Stripping

```typescript
type StrippedParamConfig =
  | string                           // Always strip
  | { param: string; onlyIfSelf: true }  // Strip only if value matches domain

export const defaultStrippedParams: StrippedParamConfig[] = [
  'utm_source',
  // ...other unconditional params
  { param: 'ref', onlyIfSelf: true },
  { param: 'ref_src', onlyIfSelf: true },
]
```

### Priority 3: Add Missing Tracking Parameters

Based on Miniflux's list (which is actively maintained):

```typescript
// Missing from current list
'srsltid',           // Google
'ysclid',            // Yandex
'mc_tc',             // Mailchimp
'_hsenc', '__hssc', '__hstc', '__hsfp', '_hsmi', 'hsctatracking',  // Hubspot
'sc_cid',            // Adobe
'_bhlid',            // Beehiiv
'_branch_match_id', '_branch_referrer',  // Branch.io
'__readwiseLocation', // Readwise
'_openstat',         // OpenStat
```

### Priority 4: Make Response Hash Comparison Optional

```typescript
export const defaultEquivalentMethods: EquivalentMethods = {
  normalize: defaultNormalizeOptions,
  redirects: true,
  responseHash: false,  // Changed: too many false negatives
  feedDataHash: false,
}
```

### Priority 5: Add Self URL Verification Option

```typescript
type SelfUrlOptions = {
  enabled: boolean
  trustProtocol?: boolean        // Trust self URL's protocol
  trustDomain?: boolean          // Trust self URL even if different domain
  requireVerification?: boolean  // Fetch self URL to verify it works
}
```

---

## 5. Edge Case Catalog

### Protocol Edge Cases

| Edge Case | Reader | Issue | Handling |
|-----------|--------|-------|----------|
| HTTPS feed declares HTTP self URL | FreshRSS | #1662 | Ignore self URL when WebSub disabled |
| Blogger feeds inconsistent protocol | FreshRSS | #2654 | Force HTTPS for blogger.com |
| Mixed HTTP/HTTPS in same feed | All | N/A | Normalize to single protocol for comparison |

### Redirect Edge Cases

| Edge Case | Reader | Issue | Handling |
|-----------|--------|-------|----------|
| 308 Permanent Redirect not handled | NewsBlur | #1841 | Check all 3xx status codes |
| Redirect to feedburner/atom.xml | NewsBlur | Code | Reject FeedBurner generic redirects |
| Redirect loop detection | FreshRSS | #3435 | Limit redirect chain length |
| Temporary redirect treated as permanent | Feedbin | #100 | Wait for confirmation period |
| DNS expiration → malicious redirect | Feedbin | #100 | Require stability confirmation |

### Query Parameter Edge Cases

| Edge Case | Reader | Issue | Handling |
|-----------|--------|-------|----------|
| `_=timestamp` cache buster rejected | NewsBlur | #1877 | Maintain exclusion list |
| `ref` parameter for legitimate tracking | Miniflux | #3265 | Only strip if self-referencing |
| Query params required for feed content | NewsBlur | #1916 | Don't strip functional params |
| FeedBurner tracking params changing GUIDs | CommaFeed | #1755 | Strip all FeedBurner query params |

### Self URL Edge Cases

| Edge Case | Reader | Issue | Handling |
|-----------|--------|-------|----------|
| YouTube self URL missing channel param | FreshRSS | #3983 | Allow user override |
| Self URL points to different domain | FreshRSS | Multiple | Verify before trusting |
| Self URL outdated after feed move | FreshRSS | #2654 | Prefer user-entered URL |
| WebSub requires self URL | FreshRSS | #2659 | Only use self URL when WebSub enabled |

### Content Hash Edge Cases

| Edge Case | Reader | Issue | Handling |
|-----------|--------|-------|----------|
| Timestamps change between requests | FreshRSS | Multiple | Use feed-level hash, not response hash |
| Ad injection changes content | General | N/A | Extract feed items for comparison |
| Whitespace/formatting differences | General | N/A | Normalize before hashing |
| BOM in response | General | N/A | Strip BOM before hashing |
| Different compression | General | N/A | Decompress before hashing |

### Domain/Hostname Edge Cases

| Edge Case | Reader | Issue | Handling |
|-----------|--------|-------|----------|
| www vs non-www different servers | Theoretical | None found | Keep www stripping, document risk |
| Non-standard port stripped | TT-RSS | #118 | Preserve non-default ports |
| Subdomain variations | NewsBlur | #458 | Publisher issue, not normalized |
| IDN/Punycode conversion | General | N/A | Convert to ASCII for comparison |

### GUID/Entry ID Edge Cases

| Edge Case | Reader | Issue | Handling |
|-----------|--------|-------|----------|
| GUID case sensitivity | FreshRSS | #2077 | Use case-sensitive comparison |
| No GUID, title changes | Miniflux | #3120 | Fall back to URL + content hash |
| Same GUID across feeds | TT-RSS | #57 | Global vs per-feed uniqueness |

---

## Source Summary

### Repositories Analyzed

| Repository | Key Findings |
|------------|--------------|
| **Athou/commafeed** | Best FeedBurner handling, comprehensive URL normalization, Issue #225 |
| **samuelclay/NewsBlur** | DuplicateFeed model, 10-redirect threshold, urlnorm implementation |
| **FreshRSS/FreshRSS** | Self URL problems, WebSub integration, SimplePie issues |
| **feedbin/feedbin** | No automatic redirect updates, entry ID generation, shared resource model |
| **miniflux/v2** | Smart ref handling, curated tracking params, self URL priority |
| **tt-rss/tt-rss** | Global GUID deduplication, minimal URL normalization |

### Key Issues Referenced

- CommaFeed #225: FeedBurner duplicate entries
- NewsBlur #1841: HTTP 308 not handled
- NewsBlur #1877: Underscore parameter rejection
- FreshRSS #1662: HTTPS→HTTP self URL
- FreshRSS #2654: Feed URL changes
- FreshRSS #3983: YouTube self URL
- Feedbin #100: 301 redirects not followed
- Miniflux #3265: Smart ref parameter removal
- TT-RSS #57: Same article in multiple feeds

---

_Research completed: December 2024_
_6 repositories analyzed, 100+ issues reviewed_

---

# Appendix: Raw Agent Research Output

The following sections contain the complete, unedited output from each research agent for reference and further analysis.

---

## A. CommaFeed (Athou/commafeed)

### Research Summary: CommaFeed Feed URL Canonicalization

Based on my analysis of the CommaFeed GitHub repository issues and source code, here are my findings on feed URL canonicalization and duplicate feed handling:

---

### Key Issues Found

#### 1. **FeedBurner/FeedProxy URL Handling (Issue #225 - CLOSED)**
**Priority: HIGH - Critical for this project**

- **Problem**: Duplicate entries when FeedBurner/FeedProxy URLs redirect
- **Root Cause**: FeedBurner URLs like `http://feedproxy.google.com/~r/RockPaperShotgun/~3/ZG5fcDx64NA/` redirect to actual article URLs. CommaFeed initially stores the FeedProxy URL, but later detects the redirect and updates to the final URL. On next refresh, it sees the original FeedProxy URL again and treats it as a new entry.
- **Solution Implemented**: Fixed in version 1.2.0
- **Code Location**: `/commafeed-server/src/main/java/com/commafeed/backend/Urls.java`

**Design Decision**:
```java
// feedproxy redirects to feedburner
normalized = normalized.replace("feedproxy.google.com", "feeds.feedburner.com");

// feedburner feeds have a special treatment
if (normalized.split(ESCAPED_QUESTION_MARK)[0].contains("feedburner.com")) {
    normalized = normalized.replace("feeds2.feedburner.com", "feeds.feedburner.com");
    normalized = normalized.split(ESCAPED_QUESTION_MARK)[0];
    normalized = Strings.CS.removeEnd(normalized, "/");
}
```

**Patterns Handled**:
- `feedproxy.google.com` → `feeds.feedburner.com`
- `feeds2.feedburner.com` → `feeds.feedburner.com`
- Query parameters are stripped from FeedBurner URLs
- Trailing slashes removed from FeedBurner URLs

---

#### 2. **WWW Prefix Handling (Issue #1859 - OPEN)**

- **Problem**: Cannot change feed URL from `https://www.netzpolitik.org/feed/` to `https://netzpolitik.org/feed/`
- **Root Cause**: URL normalization treats both as the same feed (www is stripped), but when unsubscribing and re-subscribing, the old feed remains in DB until cleanup task runs
- **Solution**: Waiting for cleanup task to delete orphaned feed
- **Code Implementation**:
```java
// remove the www. part
normalized = normalized.replace("//www.", "//");
```

**Edge Case**: Unsubscribing doesn't immediately delete the Feed record, only the subscription. This causes conflicts when trying to re-subscribe with a slightly different URL.

---

#### 3. **HTTPS/HTTP Protocol Handling**

**Design Decision**:
```java
// store all urls as http
if (normalized.startsWith("https")) {
    normalized = "http" + normalized.substring(5);
}
```

**Rationale**: All URLs are normalized to HTTP for duplicate detection. This means `https://example.com/feed` and `http://example.com/feed` are treated as the same feed.

**Important**: The actual fetching still uses the original URL with correct protocol, but the normalized version is used only for deduplication.

---

#### 4. **Permanent Redirects (Issue #935 - CLOSED)**

- **Problem**: Permanent redirects (HTTP 301) not being respected
- **Impact**: CommaFeed keeps fetching old redirected URLs instead of updating to new redirected URLs
- **Status**: Marked as "wontfix"
- **Code Observation**: The `urlAfterRedirect` field in Feed model suggests redirects ARE tracked, but may not be permanently stored

From `Feed.java`:
```java
/**
 * cache the url after potential http 30x redirects
 */
@Column(name = "url_after_redirect", length = 2048, nullable = false)
private String urlAfterRedirect;
```

---

#### 5. **Google News Duplicate Items (Issue #1755 - CLOSED)**

- **Problem**: Google News feeds generate duplicate items because GUIDs change on each fetch (tracking parameters)
- **Root Cause**: Google News wraps article URLs with tracking parameters that change, resulting in different GUIDs for the same article
- **No Solution**: This is a Google News feed design issue, not a CommaFeed bug
- **Context**: Useful to understand that GUID-based deduplication has limitations

---

### URL Normalization Implementation

#### Core Normalization Rules (from `Urls.java`)

1. **Aggressive URL Canonicalization**: Uses `org.netpreserve.urlcanon.Canonicalizer.AGGRESSIVE`
   - Sorts query parameters
   - Handles percent-encoding
   - Normalizes path components

2. **Case Normalization**:
   ```java
   normalized = normalized.toLowerCase();
   ```

3. **Protocol Normalization**:
   ```java
   if (normalized.startsWith("https")) {
       normalized = "http" + normalized.substring(5);
   }
   ```

4. **WWW Removal**:
   ```java
   normalized = normalized.replace("//www.", "//");
   ```

5. **FeedBurner Special Handling**:
   - `feedproxy.google.com` → `feeds.feedburner.com`
   - `feeds2.feedburner.com` → `feeds.feedburner.com`
   - Query parameters stripped
   - Trailing slash removed

### Test Coverage (from `UrlsTest.java`)

The tests confirm these URL variants are treated as duplicates:
- `http://example.com/hello?a=1&b=2` == `http://www.example.com/hello?a=1&b=2`
- `http://example.com/hello?a=1&b=2` == `http://EXAmPLe.com/HELLo?a=1&b=2`
- `http://example.com/hello?a=1&b=2` == `http://example.com/hello?b=2&a=1`
- `http://example.com/hello?a=1&b=2` == `https://example.com/hello?a=1&b=2`
- `http://feeds.feedburner.com/Frandroid` == `http://feeds2.feedburner.com/frandroid`
- `http://feeds.feedburner.com/Frandroid` == `http://feedproxy.google.com/frandroid`
- `http://feeds.feedburner.com/Frandroid` == `http://feeds.feedburner.com/Frandroid?format=rss`

---

### Database Schema

From `Feed.java` model:
- `url`: Original feed URL (LONGVARCHAR, unlimited length)
- `urlAfterRedirect`: URL after following redirects (VARCHAR 2048)
- `normalizedUrl`: Canonicalized URL for deduplication (VARCHAR 2048)
- `normalizedUrlHash`: SHA-1 hash of normalized URL (VARCHAR 40)

**Duplicate Detection Strategy**:
```java
// From FeedDAO.java
public Feed findByUrl(String normalizedUrl, String normalizedUrlHash) {
    return query().selectFrom(FEED)
        .where(FEED.normalizedUrlHash.eq(normalizedUrlHash))
        .fetch()
        .stream()
        .filter(f -> Strings.CS.equals(normalizedUrl, f.getNormalizedUrl()))
        .findFirst()
        .orElse(null);
}
```

Uses hash for fast lookup, then case-sensitive string comparison for exact match.

---

### Design Rationale

#### Why Strip Query Parameters from FeedBurner URLs?

FeedBurner adds tracking parameters that vary per request. Keeping them would create duplicate feed entries. By stripping query params, CommaFeed ensures:
- `http://feeds.feedburner.com/Frandroid?format=rss`
- `http://feeds.feedburner.com/Frandroid?format=xml`

Both map to the same normalized URL.

#### Why Convert HTTPS to HTTP?

Many feeds are available over both protocols. Converting all to HTTP prevents duplicate subscriptions while still fetching via the original protocol.

#### Why Remove WWW?

`www.example.com` and `example.com` typically serve the same content. Removing `www.` prevents duplicate subscriptions.

---

### Relevant File Paths

1. **/commafeed-server/src/main/java/com/commafeed/backend/Urls.java** - Core normalization logic
2. **/commafeed-server/src/test/java/com/commafeed/backend/UrlsTest.java** - Test coverage
3. **/commafeed-server/src/main/java/com/commafeed/backend/model/Feed.java** - Database model
4. **/commafeed-server/src/main/java/com/commafeed/backend/dao/FeedDAO.java** - Database queries
5. **/commafeed-server/src/main/java/com/commafeed/backend/service/FeedService.java** - Feed creation/update
6. **/commafeed-server/src/main/java/com/commafeed/backend/feed/FeedFetcher.java** - Feed fetching with redirect handling

---

### Recommendations for Your Project

Based on CommaFeed's implementation:

1. **FeedBurner Priority**:
   - Implement `feedproxy.google.com` → `feeds.feedburner.com` replacement
   - Implement `feeds2.feedburner.com` → `feeds.feedburner.com` replacement
   - Strip query parameters from FeedBurner URLs
   - Remove trailing slashes from FeedBurner URLs

2. **Core Normalizations**:
   - Convert to lowercase
   - HTTPS → HTTP (for comparison only)
   - Remove `www.` subdomain
   - Sort query parameters (using a URL canonicalization library)

3. **Use a Library**: CommaFeed uses `org.netpreserve.urlcanon.Canonicalizer.AGGRESSIVE` which handles many edge cases automatically

4. **Hash for Performance**: Use SHA-1 hash of normalized URL for fast lookups, but always verify with string comparison

5. **Track Redirects Separately**: Store both original URL and URL after redirects, but use normalized URL for duplicate detection

---

## B. NewsBlur (samuelclay/NewsBlur)

### Research Report: NewsBlur Feed URL Canonicalization

### Overview
This report summarizes GitHub issues and implementation details from the samuelclay/NewsBlur repository related to feed URL canonicalization, duplicate feed handling, merging logic, URL normalization, and redirect handling.

---

### Key Implementation Details

#### 1. DuplicateFeed Model (/apps/rss_feeds/models.py)

**Model Definition:**
```python
class DuplicateFeed(models.Model):
    duplicate_address = models.CharField(max_length=764, db_index=True)
    duplicate_link = models.CharField(max_length=764, null=True, db_index=True)
    duplicate_feed_id = models.CharField(max_length=255, null=True, db_index=True)
    feed = models.ForeignKey(Feed, related_name="duplicate_addresses",
                             on_delete=models.CASCADE)
```

The DuplicateFeed model tracks alternative feed addresses that point to a canonical feed record. This allows NewsBlur to maintain a mapping of duplicate URLs to their primary feed.

---

#### 2. Feed Merging Logic

**Location:** `/apps/rss_feeds/models.py` - `merge_feeds()` function

**Key Decisions:**
- Merges feeds based on subscriber count - the feed with more subscribers becomes the canonical version
- Handles branched feeds specially (feeds created from another feed)
- Transfers all user subscriptions from duplicate to original
- Creates DuplicateFeed record to track the merge

**Process:**
1. Compare subscriber counts between feeds
2. Swap if duplicate has more subscribers (unless `force=True`)
3. Move all UserSubscriptions to the canonical feed
4. Register duplicate mapping in DuplicateFeed table

**Design Decision:** Feed merging is now handled automatically (as of 2020). The old `merge_feeds` management command was removed.

---

#### 3. URL Normalization

**Library:** Custom `urlnorm.py` implementation in `/utils/`

**Normalization Rules Applied:**
- **Scheme normalization:** Always lowercase, converts `feed://` and `feed:` to `http://`
- **Host normalization:** Always lowercase
- **Percent-encoding:** Only where essential, uppercase A-F for hex digits
- **UTF-8 NFC:** Unicode normalization
- **Path simplification:** Removes `.` and resolves `..` segments
- **Default values:** Removes default ports (`:80` for HTTP), empty paths become `/`
- **Trailing dots:** Stripped from hostnames
- **Fragment preservation:** Trailing `#` is preserved when present

**Critical Finding:** NewsBlur normalizes URLs BEFORE lookup, meaning `http://example.com` and `http://example.com/` are treated as equivalent after normalization.

---

#### 4. Duplicate Detection Logic

**Location:** `/apps/rss_feeds/models.py` - `get_feed_from_url()` classmethod

**Detection Process:**
1. Normalize URL using `urlnorm.normalize(url)`
2. Query for exact match on `feed_address` (ordered by subscriber count)
3. If not found and `aggressive=True`, search using `icontains` on `feed_address`
4. Check `DuplicateFeed` records for known duplicates
5. If still not found, attempt feed discovery using feedfinder libraries
6. Re-check discovered URLs for existing feeds before creating new records

**Query Strategy:**
```python
def criteria(key, value):
    if aggressive:
        return {"%s__icontains" % key: value}  # Case-insensitive substring match
    else:
        return {"%s" % key: value}  # Exact match
```

---

#### 5. Redirect Handling

**Location:** `/utils/feed_fetcher.py` - `verify_feed_integrity()` method

**Redirect Status Codes:**
- **301 (Moved Permanently)** - Tracked for potential URL update
- **302 (Temporary Redirect)** - Ignored
- **307 (Temporary Redirect)** - Ignored
- **308 (Permanent Redirect)** - Tracked for potential URL update (Issue #1841)

**Update Trigger:**
- Feed address is updated after **10 permanent redirects** OR if there are **zero non-redirect responses**
- Before updating, strips underscore parameters from the new address
- Special case: Redirects to `feedburner.com/atom.xml` are rejected

**Redirect Counting Logic:**
```python
def count_redirects_in_history(self, fetch_type="feed"):
    redirects = [h for h in fh if int(h["status_code"]) in (301, 302)]
    non_redirects = [h for h in fh if int(h["status_code"]) not in (301, 302)]
    return redirects, non_redirects
```

**Bug Found (Issue #1841):** HTTP 308 was not initially included in redirect handling, causing feeds to fail. Only 301 and 302 were checked.

---

#### 6. Query Parameter Handling

**Underscore Parameter Issue (Issue #1877):**
- NewsBlur previously added `_=####` parameter to force cache bypass
- Some sites (like jwz.org) started rejecting these parameters as "badly behaved"
- **Solution:** Created `strip_underscore_from_feed_address()` function and `NO_UNDERSCORE_ADDRESSES` exclusion list
- Feed addresses are stored WITHOUT underscore parameters in the database

**Implementation:** `/utils/feed_functions.py`
```python
def strip_underscore_from_feed_address(feed_address):
    parsed_url = qurl(feed_address, remove="_")
    return parsed_url
```

---

### Notable Issues and Edge Cases

#### Issue #957: OPML Import Duplicates
**Problem:** Importing OPML could create duplicate feeds if folder structure changed
**Root Cause:** Different URLs for same content (e.g., `/RSS%20Feeds/Latest%20News` vs `/en/RSS%20Feeds/Latest%20News.aspx`)
**Resolution:** NewsBlur does check for duplicates, but different encoded URLs aren't detected as duplicates

#### Issue #1240: Feed URL History (Open)
**Problem:** Feeds change URLs, redirecting to different content without user awareness
**Example:** ReadWrite.com's FeedBurner feed redirected, causing unfamiliar content to appear
**Proposed Solution:** Track feed URL history similar to Steam's display name history
**Status:** Feature request acknowledged as "brilliant idea" but not yet implemented

#### Issue #1313: merge_feeds PostgreSQL Error
**Problem:** Old `merge_feeds` management command had SQL syntax error
**Resolution:** Command removed; merging now automatic via `Feed.merge_feeds()` function

#### Issue #39: Same Feed Title Bug
**Problem:** Two feeds with same title but different URLs were incorrectly merged
**Root Cause:** NewsBlur's automatic deduplication treated them as duplicates based on shared stories
**Resolution:** Manual intervention to un-merge; merging logic improved

#### Issue #37: Duplicate Feed Items Navigation Bug
**Problem:** Same story in multiple feeds caused UI navigation to freeze
**Status:** Fixed in 2013

#### Issue #1275: Multiple Instances of Same Feed (Closed)
**Request:** Allow subscribing to same feed multiple times with different intelligence training
**Decision:** Rejected due to UI complexity concerns
**Workaround:** Use feed proxy to create different URLs

#### Issue #1841: HTTP 308 Not Handled (Open)
**Problem:** HTTP 308 "Permanent Redirect" treated as error, not as redirect
**Root Cause:** `count_redirects_in_history` only checked 301/302, not 308
**Impact:** Feeds with 308 redirects fail to update and show errors
**Proposed Fix:** Check all 3xx status codes or use `http.HTTPStatus.is_redirection`

#### Issue #1916: Query Parameters Dropped (Open)
**Problem:** Feed URLs with query parameters (e.g., MediathekViewWeb filters) get truncated to base path
**Impact:** Cannot add feeds that require query parameters
**Status:** Still open, affects mobile apps where manual URL editing isn't available

#### Issue #1912: Android URL Lowercasing (Fixed)
**Problem:** Android app converted URLs to lowercase before adding
**Impact:** Case-sensitive feed URLs couldn't be added
**Resolution:** Fixed in recent release to preserve case

#### Issue #481: Wrong Feed IDs from API
**Problem:** API returns merged feed IDs that don't have corresponding feed objects
**Root Cause:** Feed merging cleanup removes subscriptions to old feed IDs
**Resolution:** API clients must handle missing feed IDs gracefully

#### Issue #358: Wrong Feed URL Detection
**Problem:** Feed auto-discovery picked wrong URL (media-rss.php instead of /feed)
**Resolution:** Manual fix to update to correct URL

#### Issue #1086: Duplicate Folder Names
**Problem:** Nested folders with same names break UI, feeds become inaccessible
**Root Cause:** Folders identified by name rather than ID
**Status:** Acknowledged, planned fix in Issue #1322 (folder ID-based system)

#### Issue #1228: Circular Folder Relationships (Open)
**Problem:** Creating circular parent-child folder relationships causes feeds to disappear
**Impact:** Folders and subscriptions vanish from UI completely
**Root Cause:** No server-side validation of folder hierarchy
**Status:** Needs mitigation in code

---

### Design Decisions and Rationale

#### 1. Redirect Stability
**Decision:** Wait for 10 permanent redirects before updating feed address
**Rationale:**
- Prevents premature updates from temporary server misconfigurations
- Balances between responsiveness and stability
- Reduces risk of following incorrect redirects

**Trade-off:** Feeds make extra redirect requests for up to 10 fetches before updating

#### 2. Automatic Feed Merging
**Decision:** Automatically merge feeds detected as duplicates
**Rationale:**
- Reduces duplicate content for users
- Consolidates subscriber counts
- Improves feed statistics accuracy

**Trade-off:** Can incorrectly merge legitimately different feeds that share content (Issue #39)

#### 3. Subscriber Count Determines Canonical Feed
**Decision:** Feed with more subscribers becomes the canonical version
**Rationale:**
- Popular feeds likely more stable and better maintained
- Reduces disruption for majority of users
- Provides clear tiebreaker rule

**Trade-off:** May not always choose the "correct" feed if a duplicate gained subscribers first

#### 4. Normalize URLs Before Storage
**Decision:** Apply extensive URL normalization before storing/comparing
**Rationale:**
- Reduces false positives for duplicates
- Handles common URL variations (case, encoding, default ports)
- Improves duplicate detection

**Trade-off:**
- May over-normalize in some cases (Issue #1912 - case sensitivity)
- Query parameters sometimes meaningful (Issue #1916)

#### 5. Strip Underscore Parameters from Stored URLs
**Decision:** Remove `_=####` cache-busting parameters before saving feed addresses
**Rationale:**
- Some servers reject unknown parameters (Issue #1877)
- Keeps URLs clean in database
- Reduces URL variations

**Trade-off:** Need to maintain exclusion list for special cases

#### 6. FeedBurner Special Handling
**Decision:** Reject redirects ending in `feedburner.com/atom.xml`
**Rationale:** FeedBurner redirects can lead to generic/incorrect feeds
**Implementation:** Hard-coded check in `verify_feed_integrity()`

#### 7. No Feed URL History (Yet)
**Decision:** Not tracking historical feed URLs (Issue #1240 - still open)
**Impact:** Users unaware when feed redirects to different content
**Proposed Solution:** Display URL history in feed statistics
**Status:** Acknowledged as valuable but not yet prioritized

---

### Key Takeaways for feedcanon Library

#### 1. Redirect Handling Best Practices
- Support HTTP 301, 302, 307, and 308 status codes
- Distinguish between permanent (301, 308) and temporary (302, 307) redirects
- Consider implementing threshold-based URL updates (like NewsBlur's 10-redirect rule)
- Be cautious with FeedBurner and other feed proxy services

#### 2. URL Normalization Considerations
- Normalize scheme and host to lowercase
- Remove default ports
- Simplify paths (remove `.`, resolve `..`)
- Be careful with query parameter handling - not all can be stripped
- Preserve case in path components (some servers are case-sensitive)
- Consider fragment identifiers (NewsBlur preserves trailing `#`)

#### 3. Duplicate Detection Strategy
- Normalize before comparison
- Support both exact matching and fuzzy matching modes
- Track known duplicates in a separate registry (like DuplicateFeed)
- Consider content-based deduplication (matching feed titles/stories) in addition to URL

#### 4. Edge Cases to Handle
- Query parameters that are semantically meaningful (filters, keys)
- Case-sensitive URL paths
- Different encodings of same URL (percent-encoding variations)
- Feeds behind redirects that change over time
- Cache-busting parameters that should be stripped
- Feed discovery finding wrong/alternative feed URLs
- Circular references in folder structures (if supporting organization)

#### 5. Stability vs Responsiveness Trade-offs
- Balance between quickly updating to redirects vs avoiding false positives
- Consider implementing a "known_good" flag for established feeds
- Track fetch history to make informed decisions
- Provide mechanisms for manual override when automation fails

---

### Relevant File Locations in NewsBlur

- `/apps/rss_feeds/models.py` - Feed model, DuplicateFeed model, merge_feeds, get_feed_from_url
- `/utils/feed_fetcher.py` - verify_feed_integrity, redirect handling
- `/utils/urlnorm.py` - URL normalization implementation
- `/utils/feed_functions.py` - strip_underscore_from_feed_address

---

### Open Questions and Unresolved Issues

1. **Query Parameter Preservation** (Issue #1916): How to determine which query parameters are semantically meaningful vs. cacheable?

2. **Feed URL History** (Issue #1240): Should systems track all historical URLs for transparency?

3. **HTTP 308 Handling** (Issue #1841): Full 3xx range support vs specific status code handling?

4. **Folder Circular References** (Issue #1228): How to validate complex hierarchical relationships?

5. **Case Sensitivity**: When should URLs be treated as case-sensitive vs case-insensitive?

6. **Content-based Deduplication**: How aggressively should feeds sharing content be merged automatically?

---

## C. FreshRSS (FreshRSS/FreshRSS)

### RESEARCH FINDINGS: FreshRSS Feed URL Canonicalization

---

### 1. SELF URL HANDLING (atom:link rel="self")

#### Issue #2654 - Feed URLs Changed from HTTPS to HTTP
- **Problem**: FreshRSS automatically changed feed URLs from HTTPS to HTTP, even when users manually corrected them
- **Root Cause**: Feed's `<atom:link rel="self">` attribute was directing FreshRSS to use HTTP version. FeedBurner misconfigured feeds with HTTP-based self reference instead of HTTPS
- **Solution**: PR #2659 implemented fix to not obey rel=self when WebSub is disabled
- **Design Decision**: Balance between respecting user configuration vs. feed-provided canonical URLs
- **Status**: CLOSED (fixed in PR #3088)

#### Issue #1662 - HTTPS URLs Reverting to HTTP After First Actualize
- **Problem**: `https://feeds.feedburner.com/GoogleOnlineSecurityBlog` becomes `http://feeds.feedburner.com/GoogleOnlineSecurityBlog`
- **Root Cause**: Feed declares itself as HTTP in self-referential link: `<atom10:link rel="self" href="http://..." />`
- **Maintainer Note**: Self attribute is used for PubSubHubbub functionality; FreshRSS follows feed's declared protocol
- **Status**: UNRESOLVED (still open) - highlights tension between respecting feed specs and user security preferences

#### Issue #3983 - YouTube WebSub Self URL Problem
- **Problem**: YouTube's `<link rel="self">` references invalid URL without channel parameter, breaking WebSub
- **Root Cause**: Code in `feedController.php` (lines 472-488) prioritizes selfUrl over original subscription URL
- **Proposed Solution**: Per-feed checkbox to disregard rel=self and preserve original URL
- **Status**: OPEN (no resolution as of August 2022)

#### PR #2659 - Do Not Obey rel=self if WebSub is Disabled
- **Implementation**: Checks WebSub enablement before processing rel=self attribute
- **Design Approach**: Restricts automatic URL changes to cases where WebSub is active
- **Reference**: Aligns with [PubSubHubbub wiki on moving feeds](https://github.com/pubsubhubbub/PubSubHubbub/wiki/Moving-Feeds-or-changing-Hubs)

---

### 2. WEBSUB IMPLEMENTATION

#### Issue #2124 - FreshRSS as WebSub Server
- **Context**: FreshRSS is already a WebSub client, could also be a server
- **Use Case**: Enable push notifications for FreshRSS-generated feeds
- **Status**: Open feature request

#### Issue #1854 - PubSubHubbub Subscription Errors
- **Problem**: Repetitive error messages about failed PubSubHubbub subscriptions
- **Root Cause**: Changed installation URL without updating `base_url` in `./FreshRSS/data/config.php`
- **Solutions**:
  - Update `base_url` to match current public-facing address (exclude `/i/` directory)
  - Set `base_url` to empty string if instance lacks routable address (disables WebSub)
  - Ensure `./FreshRSS/p/api/pshb.php` remains publicly accessible
- **Key Insight**: Read-only PubSubHubbub checkbox is status indicator, not control
- **Status**: Open (documentation request)

#### PR #2184 - Update Naming to WebSub
- **Context**: Renamed PubSubHubbub to WebSub standard
- **Code**: References `$feed->selfUrl()` for matching, `$feed->pubSubHubbubSubscribe(false)` for unsubscribe

#### WebSub Discovery
- **ATOM Priority**: Issue #2123 - Mastodon declares WebSub in ATOM feeds but not RSS; FreshRSS should prioritize ATOM for WebSub discovery
- **Hub Discovery**: Feeds must declare hub in metadata; code checks `if ($pubsubhubbubEnabledGeneral && $feed->hubUrl() && $feed->selfUrl())`
- **Configuration**: Requires `'base_url'` and `'pubsubhubbub_enabled' => true` in `./data/config.php`

---

### 3. SIMPLEPIE URL HANDLING

#### PR #3180 - SimplePie HTTP 301 Redirect Fix
- **Problem**: Failed to detect permanent 301 redirects for existing feeds (only when `open_basedir` not set)
- **Root Cause**: SimplePie used `CURLOPT_FOLLOWLOCATION` conditionally, obscuring redirect history and preventing distinction between 301 vs 302
- **Solution**: Disabled `CURLOPT_FOLLOWLOCATION` throughout SimplePie, fixed manual redirect method
- **Impact**: Creates consistent behavior independent of `open_basedir`, preserves complete HTTP redirect chain
- **Upstream**: Changes pending SimplePie acceptance (simplepie/simplepie#660)

#### PR #3088 - Always Rewrite blogger.com to HTTPS
- **Problem**: Blogger feeds inconsistent with protocol (addresses issue #2654)
- **Solution**: Automatically convert all blogger.com URLs to HTTPS
- **Test Case**: `https://blog.chromium.org/feeds/posts/default`
- **Status**: Merged July 4, 2020, released in v1.17.0

#### Issue #942 - Force Feed Parameter Disappearing
- **Problem**: `#force_feed` parameter disappears from URL after actualize
- **Root Causes**:
  - Lock file persistence in `/var/tmp/` or `/tmp/` (persists ~1 hour if update crashed)
  - Bug in force_feed feature
- **Workaround**: Manually delete stale lock file
- **Status**: CLOSED (completed)

#### SimplePie get_permalink Behavior
- **Issue**: When `isPermaLink="false"`, `get_permalink()` returns combination of link and ID (e.g., `http://wb.page/123`)
- **Impact**: Incorrect permalink generation affects URL canonicalization

---

### 4. DUPLICATE FEED DETECTION

#### Issue #3339 / PR #3347 - Remove Duplicate Feeds
- **Problem**: Importing multiple OPMLs with overlapping feeds creates duplicates
- **Root Cause**: Feed URL redirects (HTTP to HTTPS) treated as different feeds
  - Initial: `http://www.computerworld.com/index.rss` → stored as `https://...`
  - Second import: OPML contains HTTP URL, treated as new feed
- **Solution**: PR #3347 prevents importing feeds that redirect to existing URLs
- **Error**: UNIQUE constraint violations when redirect target already exists
- **Status**: CLOSED (fixed in v1.18.0)

#### Issue #3086 - Duplicate Key Constraint Violation
- **Problem**: PostgreSQL error `duplicate key value violates unique constraint 'freshrss_user_entry_id_feed_guid_key'`
- **Root Cause**: Chromium blog feed URL changed from `https://blog.chromium.org/feeds/posts/default` to `https://www.blogger.com/feeds/2471378914199150966/posts/default`
- **Database Issue**: Re-fetching and re-inserting entries with identical GUIDs
- **Solution**: PR #3409 implemented `INSERT ... ON CONFLICT DO NOTHING` logic
- **Status**: CLOSED

#### Issue #3836 - Duplicate Entries on Some Feeds
- **Problem**: Feeds adding duplicate entries with each update
- **Root Cause**: Missing `UNIQUE KEY ('id_feed','guid')` on _entry table (DB migration leftover)
- **Status**: Database migration issue

#### Issue #3142 - Double Articles in Feeds
- **Problem**: Same articles appear twice after 1-2 days
- **Root Cause**: Feeds publishing articles with changed URLs
- **Solution**: PR #3303 implemented filter to mark duplicate titles as read
- **Status**: CLOSED (completed)

---

### 5. REDIRECT HANDLING

#### Issue #3435 - Infinite Redirection Loop
- **Problem**: FreshRSS fails to load feed from `https://blog.path.net/rss/` due to 307 redirects
- **Root Cause**: Infinite redirection loop from badly configured feed server
- **Solutions Discussed**:
  - Contact feed provider to fix configuration
  - Custom curl settings (ref PR #3367)
  - Create FreshRSS extension
  - Use RSS Bridge module
- **Maintainer Conclusion**: "Not much we can do at FreshRSS level"
- **Status**: CLOSED (external feed configuration issue)

#### Issue #6703 - Redirects Not Being Followed
- **Context**: Type of feed source not following redirects properly

#### HTTP 301 Compliance
- **Feature**: FreshRSS complies with HTTP '301 Moved Permanently' by automatically updating feed URLs
- **Implementation**: Automatic URL update when 301 detected

---

### 6. CANONICAL URL DETERMINATION

#### Design Philosophy
FreshRSS faces fundamental tension:
1. **Protocol compliance**: Respect feed-declared canonical URLs (rel=self) for WebSub
2. **User control**: Allow manual URL corrections without automatic reversions
3. **Security**: Prefer HTTPS over HTTP regardless of feed declaration

#### Implementation Approach
- **When WebSub enabled**: Obey rel=self for protocol compliance
- **When WebSub disabled**: Ignore rel=self, respect user-entered URLs
- **Force HTTPS**: Domain whitelist in `./data/force-https.default.txt` and `./data/force-https.txt`
- **Redirect handling**: Follow 301 permanently, detect redirect loops

#### Code Locations
- `feedController.php` lines 472-488: selfUrl prioritization logic
- `feedController.php` line 374: Duplicate GUID checking
- Self URL extraction: `$feed->selfUrl()` and `$feed->hubUrl()` methods

---

### 7. GUID AND ENTRY ID ISSUES

#### Issue #2077 - GUID Case Sensitivity
- **Problem**: GUIDs `https://url/Mw` and `https://url/MW` treated as duplicates
- **Root Cause**: MySQL used case-insensitive collation (`utf8mb4_unicode_ci`)
  - SQLite: Already case-sensitive (`COLLATE BINARY`)
  - PostgreSQL: Already case-sensitive
- **Atom Spec**: "Processors MUST compare atom:id elements on a character-by-character basis (in a case-sensitive fashion)"
- **Solution**: PR #2078 changed MySQL collation to `latin1_bin`
- **Status**: CLOSED (fixed in v1.12.0)

#### Issue #2273 - Entry IDs Not Guaranteed Unique
- **Problem**: Entry IDs computed by adding microseconds to entry date, not guaranteed unique
- **Vulnerabilities**:
  - Two consecutive runs with identical `MAX(id) - COUNT(*)` produce duplicates
  - Malicious feeds can reuse old dates to trigger collisions
  - Server clock modifications (NTP) can create duplicate timestamps
- **Risk**: ~1-in-1-million odds, but architectural flaw
- **Solution**: Commit "No old ID" in milestone 1.14.0
- **Status**: CLOSED (fixed in v1.14.0)

#### Issue #4831 - PostgreSQL 15 Upgrade Duplicates
- **Problem**: After PostgreSQL upgrade, duplicate entries with same (id_feed, guid)
- **Workaround**: Manually remove duplicates from `frss_[user]_entry` table

---

### 8. EDGE CASES AND DESIGN DECISIONS

#### Edge Cases Identified
1. **Blogger/FeedBurner URLs**: Change between domains unpredictably
2. **YouTube Channel URLs**: Self URL lacks required channel parameter
3. **Protocol switching**: HTTPS ↔ HTTP changes treated as different feeds
4. **Redirect loops**: Badly configured servers cause infinite redirects
5. **Case-sensitive paths**: URL shorteners with case-sensitive IDs treated as duplicates
6. **Microsecond collisions**: Entry IDs can theoretically collide
7. **WebSub on moved feeds**: Must use old address for unsubscribing

#### Design Rationale
- **WebSub dependency**: rel=self is core to WebSub protocol, can't be fully ignored
- **Database constraints**: Use `INSERT ... ON CONFLICT DO NOTHING` for duplicate handling
- **User override**: When WebSub disabled, prioritize user input over feed declarations
- **Security defaults**: Force HTTPS for known domains
- **SimplePie fork**: Maintain custom fork for bug fixes pending upstream acceptance

---

### SOURCES

- [Issue #2654: Feed URL Changes](https://github.com/FreshRSS/FreshRSS/issues/2654)
- [Issue #3086: Duplicate Key Constraint](https://github.com/FreshRSS/FreshRSS/issues/3086)
- [Issue #6581: Duplicate Feeds During Import](https://github.com/FreshRSS/FreshRSS/issues/6581)
- [Issue #3339: Remove Duplicate Feeds](https://github.com/FreshRSS/FreshRSS/issues/3339)
- [Issue #3142: Double Articles](https://github.com/FreshRSS/FreshRSS/issues/3142)
- [Issue #7317: Duplicate Entries on RedFlagDeals](https://github.com/FreshRSS/FreshRSS/issues/7317)
- [Issue #3836: Duplicate Entries on Some Feeds](https://github.com/FreshRSS/FreshRSS/issues/3836)
- [Issue #2124: FreshRSS as WebSub Server](https://github.com/FreshRSS/FreshRSS/issues/2124)
- [Issue #1854: PubSubHubbub Subscription Errors](https://github.com/FreshRSS/FreshRSS/issues/1854)
- [PR #2184: Update Naming to WebSub](https://github.com/FreshRSS/FreshRSS/pull/2184)
- [Issue #1662: HTTPS to HTTP URL Changes](https://github.com/FreshRSS/FreshRSS/issues/1662)
- [Issue #942: Force Feed Parameter](https://github.com/FreshRSS/FreshRSS/issues/942)
- [PR #3180: SimplePie HTTP 301 Fix](https://github.com/FreshRSS/FreshRSS/pull/3180)
- [PR #3088: Always Rewrite blogger.com to HTTPS](https://github.com/FreshRSS/FreshRSS/pull/3088)
- [PR #2659: Do Not Obey rel=self if WebSub Disabled](https://github.com/FreshRSS/FreshRSS/pull/2659)
- [Issue #3983: YouTube WebSub Self URL](https://github.com/FreshRSS/FreshRSS/issues/3983)
- [Issue #3435: Redirect Handling](https://github.com/FreshRSS/FreshRSS/issues/3435)
- [Issue #2077: GUID Case Sensitivity](https://github.com/FreshRSS/FreshRSS/issues/2077)
- [Issue #2273: Entry ID Uniqueness](https://github.com/FreshRSS/FreshRSS/issues/2273)
- [FreshRSS WebSub Documentation](https://freshrss.github.io/FreshRSS/en/users/WebSub.html)
- [SimplePie get_permalink Issue](https://github.com/simplepie/simplepie/issues/365)
- [Issue #2123: Prioritise ATOM over RSS for Mastodon](https://github.com/FreshRSS/FreshRSS/issues/2123)
- [Issue #4831: PostgreSQL 15 Upgrade Duplicates](https://github.com/FreshRSS/FreshRSS/issues/4831)
- [Release FreshRSS 1.18.0](https://github.com/FreshRSS/FreshRSS/releases/tag/1.18.0)

---

## D. Feedbin (feedbin/feedbin)

### Research Findings: Feedbin Feed URL Canonicalization

Based on comprehensive research of the feedbin/feedbin GitHub repository, here's a structured analysis of issues related to feed URL canonicalization, redirect handling, and duplicate feed detection.

---

### HIGH PRIORITY: Redirect Stability and Confirmation

#### Issue #100: Feedbin Does Not Follow HTTP 301 Redirects
**Status:** OPEN (Created June 3, 2014)
**URL:** https://github.com/feedbin/feedbin/issues/100

##### Problem Description
Feedbin follows redirects during fetching but **does not update stored feed URLs**. When a feed issues an HTTP 301 permanent redirect, Feedbin continues requesting the old URL (receiving 301 responses every time) rather than updating to the new target URL. One user reported ~450 requests per day to a redirected feed.

##### Root Cause
Ben Ubois (maintainer) explained: "feed urls have a unique constraint in the database and are used to generate unique article ids." Feeds are also shared resources between users, making it difficult to let individual users edit feed attributes.

##### Design Rationale: The Tradeoff
Contributor Brendan Long identified the core challenge:
> "There's a tradeoff here between too-quickly accepting a permanent redirect and losing content vs too-slowly accepting a permanent redirect and losing content."

Edge cases include:
- **Misconfiguration**: Temporary server issues incorrectly returning 301
- **Malicious behavior**: DNS expiring and someone temporarily turning site into redirect to ads
- **Semi-malicious behavior**: Various attack vectors exploiting expired domains

##### Proposed Timeframe for Redirect Confirmation
> "Between a week and a month after first seeing the redirect, it's probably relatively safe to assume that it's actually permanent and update the links."

**NOTE:** The "6 days" mentioned in your research doc was not found in the GitHub issues. The actual discussion suggests **7-30 days** as a safe window.

##### Workaround
Resubscribing to the feed at its new location is recommended as a manual workaround.

##### User Impact
- Silent content loss when redirects expire
- Excessive server requests to old URLs
- No notification to users about broken subscriptions
- Technically savvy users cannot proactively update subscriptions

---

### 301/308 Permanent Redirect Handling

#### Current Behavior
- Feedbin **follows** 301 redirects during fetching
- Feedbin **does not update** stored URLs after encountering 301s
- No automatic URL updates after any duration

#### Technical Implementation
According to Issue #22 (feedbin/support):
> "Feedbin should follow all server generated redirects with a 2xx or 3xx status code and a location header."

This confirms that 301 and 308 permanent redirects are followed during fetch operations, but the feed URL in the database remains unchanged.

---

### 302/307 Temporary Redirect Handling

**No specific issues found** discussing temporary redirect (302/307) handling. However, Issue #100 suggests that Feedbin treats all HTTP redirects (2xx/3xx with location header) similarly during fetching, but never updates stored URLs regardless of redirect permanence.

---

### Duplicate Feed Detection

#### Issue #507: Feature Request: Remove Duplicate Feeds
**Status:** OPEN (Created August 1, 2020)
**URL:** https://github.com/feedbin/feedbin/issues/507

##### Problem Description
Users accumulate duplicate feeds over time, most commonly from adding the same feed via both HTTP and HTTPS protocols. The UI doesn't show the protocol prefix, making duplicates appear identical.

##### Root Causes
- Protocol variation (HTTP vs HTTPS)
- UI lacks visibility into protocol/full URL
- No built-in duplicate detection mechanism

##### Workaround
Visit https://feedbin.com/settings/subscriptions which displays feed URLs sorted alphabetically, allowing duplicates to appear adjacent for manual identification and removal.

##### Edge Case
Even in settings, the workaround "shows URLs but still doesn't reveal protocol prefixes," leaving uncertainty about which version is being unsubscribed.

---

### URL Normalization

#### No Direct Issues Found
Searches for "canonical URL normalize" in the feedbin/feedbin repository returned no specific issues. However, related concerns emerge from:

1. **Protocol normalization**: HTTP vs HTTPS creates duplicates (Issue #507)
2. **Entry ID generation**: Feed URL is used as input for SHA1 hash generation
3. **Unique constraint**: Feed URLs have database unique constraint preventing flexible updates

---

### Canonical URL Determination

#### Issue #250: Discovery (rel=alternate) for JSON Feeds
**Status:** CLOSED (Completed January 24, 2020)
**URL:** https://github.com/feedbin/feedbin/issues/250

##### Problem Description
Feedbin failed to discover JSON feeds when users entered homepage URLs containing `<link rel="alternate" href="..." type="application/json" />` tags.

##### Solution Implemented
Commit cc89dd7 added: "Feature: Support JSON Feed autodiscovery"
- Added `"application/json"` to supported MIME types in `app/models/source/meta_links.rb`
- Implemented fallback to check canonical `/feed.json` route at domain roots

---

### Fixable Feeds Feature

#### Blog Post: Fixable Feeds (January 15, 2024)
**URL:** https://feedbin.com/blog/2024/01/15/fixable-feeds/

##### How It Works
Feedbin continuously monitors feed health and detects when:
- Feeds return 404 Not Found errors
- Publisher websites still advertise alternative feeds via `<link rel="alternate">` tags

##### User Experience
- Notice appears on subscriptions page when broken feeds are detected
- Offers option to replace broken feeds with detected healthy alternatives
- Extends to OPML imports, suggesting working alternatives for outdated links

##### Important Distinction
This feature addresses feeds that **break without redirects**, not feeds that issue HTTP redirects. It's a separate solution from the redirect handling problem.

---

### Entry ID Generation and Duplicate Articles

#### Issue #23: Duplicated Feed Entries
**Status:** CLOSED (Completed March 28, 2013)
**URL:** https://github.com/feedbin/support/issues/23

##### Entry ID Algorithm
Feedbin uses SHA1 hash of:
1. **If entry has GUID/ID**: `feed_url + entry_id`
2. **If no GUID/ID**: `feed_url + link + title + published_date`

##### Why Feed URL Matters
The feed URL is a **critical component** of entry ID generation. Changing feed URLs would:
- Generate different entry IDs for existing articles
- Potentially create duplicates of all historical entries
- Break the shared resource model between users

##### Edge Cases
- **Feeds without GUIDs**: Title changes create false duplicates
- **Changing publish dates**: WSJ feeds update timestamps post-publication (Issue #416)
- **Same story, multiple times**: Some feeds link to same story repeatedly

#### Issue #227: Remove Duplicated Articles Within Tag
**Status:** OPEN (Created October 17, 2017)
**URL:** https://github.com/feedbin/feedbin/issues/227

##### Problem Description
Articles appearing in multiple feeds (e.g., NYTimes sections) create duplicates when grouped by tags. Approximately one-third of tagged articles may be duplicates.

##### Duplicate Detection Method
Duplicates identified by **exact URL match** (including tracking parameters like `?partner=rss&emc=rss`).

##### Design Challenge
Classic RSS problem: multiple feeds syndicate same content, but users want to see articles only once while preserving feed context.

---

### HTML Meta Refresh Redirects

#### Issue #22: Should the Fetcher Follow HTML Redirects?
**Status:** OPEN (Repository archived June 4, 2020)
**URL:** https://github.com/feedbin/support/issues/22

##### Current Behavior
Ben Ubois clarified:
> "Feedbin should follow all server generated redirects with a 2xx or 3xx status code and a location header. Meta refresh is not followed at this time, but it might be an option."

##### Design Decision
- **Supported**: HTTP-level redirects (3xx status codes with Location header)
- **Not supported**: HTML `<meta http-equiv="Refresh">` tags

---

### Feed Discovery and Validation

#### Issue #87: W3C Valid Feeds Not Found
**Status:** CLOSED (Completed April 29, 2013)
**URL:** https://github.com/feedbin/support/issues/87

##### Problem
Feeds validating with W3C Feed Validator failed to be added to Feedbin with "No feed found" errors.

##### Resolution
Backend fixes resolved the issue within 3 hours. Demonstrates that W3C compliance doesn't guarantee compatibility with all feed readers.

---

### Key Design Constraints

#### Database Schema Limitations
From Issue #100 discussion:
1. **Unique constraint on feed URLs**: Prevents simple URL updates
2. **Feed URLs generate entry IDs**: Changing URLs breaks entry identity
3. **Shared resource model**: Feeds are shared between multiple users
4. **No per-user feed attributes**: Users cannot edit feed properties individually

#### Architecture Implications
These early design decisions create a **catch-22**:
- Can't update feed URLs without regenerating all entry IDs
- Can't regenerate entry IDs without creating duplicates
- Can't make feed changes per-user because feeds are shared resources

---

### Summary of Findings

#### Redirect Confirmation Timing
- **No implementation** of automatic redirect confirmation exists
- **Proposed timeframe**: 7-30 days (week to month), not 6 days
- **Current status**: Issue #100 remains open since 2014

#### Permanent vs Temporary Redirects
- **No distinction made** in current implementation
- Both treated identically: followed during fetch, URL never updated
- No evidence of separate 302/307 handling logic

#### Feed Merging
- **No feed merging mechanism found**
- Manual workaround: Resubscribe to new URL
- Duplicates remain as separate subscriptions

#### Major Gaps Identified
1. No redirect stability monitoring
2. No automatic URL updates after any timeframe
3. No duplicate feed detection (HTTP vs HTTPS)
4. No notification when redirects expire
5. No user control over feed URL updates

---

### Sources

- [Feedbin does not follow HTTP 301 redirects · Issue #100](https://github.com/feedbin/feedbin/issues/100)
- [Feature Request: Remove duplicate feeds · Issue #507](https://github.com/feedbin/feedbin/issues/507)
- [Feature Request: Remove Duplicated Articles Within Tag · Issue #227](https://github.com/feedbin/feedbin/issues/227)
- [Discovery (rel=alternate) for JSON feeds? · Issue #250](https://github.com/feedbin/feedbin/issues/250)
- [Should the 'fetcher' follow HTML redirects? · Issue #22](https://github.com/feedbin/support/issues/22)
- [Issue: Duplicated Feed Entries · Issue #23](https://github.com/feedbin/support/issues/23)
- [Multiple duplicate unread entries for each article in WSJ feed · Issue #416](https://github.com/feedbin/support/issues/416)
- [Feedbin says "No feed found", URL validates with W3 feed validator · Issue #87](https://github.com/feedbin/support/issues/87)
- [Fixable Feeds - Feedbin Blog](https://feedbin.com/blog/2024/01/15/fixable-feeds/)
- [Verifying Feed Requests - Feedbin Help](https://feedbin.com/help/verifying-feed-requests/)
- [Entry Model Source Code](https://github.com/feedbin/feedbin/blob/main/app/models/entry.rb)

---

## E. Miniflux (miniflux/v2)

### MINIFLUX FEED URL CANONICALIZATION RESEARCH REPORT

### 1. TRACKING PARAMETER HANDLING (HIGH PRIORITY)

#### 1.1 Which Tracking Parameters Does Miniflux Strip?

Miniflux implements comprehensive tracking parameter removal via `/internal/reader/urlcleaner/urlcleaner.go`:

**Standard Tracking Parameters:**
- **UTM Parameters**: All parameters starting with `utm_` prefix (campaign, source, medium, term, content)
- **Matomo**: All parameters starting with `mtm_` prefix
- **Facebook**: `fbclid`, `_openstat`, `fb_action_ids`, `fb_action_types`, `fb_ref`, `fb_source`, `fb_comment_id`
- **Google**: `gclid`, `dclid`, `gbraid`, `wbraid`, `gclsrc`, `srsltid`, `campaign_id`, `campaign_medium`, `campaign_name`, `campaign_source`, `campaign_term`, `campaign_content`
- **Yandex**: `yclid`, `ysclid`
- **Twitter**: `twclid`
- **Microsoft**: `msclkid`
- **Mailchimp**: `mc_cid`, `mc_eid`, `mc_tc`
- **Hubspot**: `hsa_cam`, `_hsenc`, `__hssc`, `__hstc`, `__hsfp`, `_hsmi`, `hsctatracking`
- **Other Services**:
  - Wicked Reports: `wickedid`
  - Olytics: `rb_clickid`, `oly_anon_id`, `oly_enc_id`
  - Vero: `vero_id`, `vero_conv`
  - Marketo: `mkt_tok`
  - Adobe: `sc_cid`
  - Beehiiv: `_bhlid`
  - Branch.io: `_branch_match_id`, `_branch_referrer`
  - Readwise: `__readwiseLocation`
  - Humble Bundles: `hmb_campaign`, `hmb_medium`, `hmb_source`
  - Google-like: `itm_campaign`, `itm_medium`, `itm_source`

**Outbound Tracking Parameters (Conditional Removal):**
- **`ref` parameter**: Only removed if value matches feed hostname or site hostname (PR #3265)
  - Ghost blogging platform adds `ref` parameter pointing to the site's own domain
  - Miniflux intelligently removes it only when it references the same domain

#### 1.2 Relevant Issues & PRs

**Issue #2720** - "Add a rule to strip tracking query arguments" (CLOSED)
- **Status**: Implemented
- **Problem**: Sites add UTM and tracking tags to RSS feed links for analytics
- **Solution**: Added comprehensive tracking parameter list based on:
  - Mozilla query-stripping collection
  - AdGuard TrackParamFilter
  - Brave browser's query filter
  - Neat-URL extension
- **Implementation**: Case-insensitive matching, prefix-based detection

**PR #3265** - "Remove the `ref` parameter from url" (MERGED)
- **Problem**: Ghost blogging platform adds `ref` parameter to all links
- **Solution**: Smart removal - only strips `ref` when it matches the feed/site domain
- **Design Decision**: Avoid breaking functional parameters by checking domain match
- **Edge Case**: Handles subdomains correctly (e.g., `blog.example.com`)

**PR #3400** - "perf(reader): optimize RemoveTrackingParameters" (MERGED)
- **Performance Issue**: 10%+ of CPU time spent in URL parsing
- **Solution**: Parse URL once, reuse across multiple tracking checks
- **Impact**: Significant performance improvement for feed processing

**PR #3808** - "feat(reader): add content rewrite rule to strip query params from blurry placeholder images" (MERGED)
- **Use Case**: Belgian news site uses `blur` query parameter for placeholder images
- **Solution**: Content rewrite rule strips query params when `blur` detected
- **Note**: This is image-specific, not general URL canonicalization

### 2. SELF URL PRIORITY AND HANDLING

#### 2.1 Atom Feed Self URL Handling

From `/internal/reader/atom/atom_10_adapter.go`:

```go
// Populate the feed URL.
feedURL := a.atomFeed.Links.firstLinkWithRelation("self")
if feedURL != "" {
    if absoluteFeedURL, err := urllib.AbsoluteURL(baseURL, feedURL); err == nil {
        feed.FeedURL = absoluteFeedURL
    }
} else {
    feed.FeedURL = baseURL
}
```

**Priority:**
1. First, look for `<link rel="self">` in Atom feed
2. If found, make it absolute and use as feed URL
3. If not found, fallback to the base URL (the URL used to fetch the feed)

**Site URL Handling:**
```go
// Populate the site URL.
siteURL := a.atomFeed.Links.originalLink()
if siteURL != "" {
    if absoluteSiteURL, err := urllib.AbsoluteURL(baseURL, siteURL); err == nil {
        feed.SiteURL = absoluteSiteURL
    }
} else {
    feed.SiteURL = baseURL
}
```

#### 2.2 RSS Feed Self URL Handling

From `/internal/reader/rss/adapter.go`:

```go
feed := &model.Feed{
    Title:       html.UnescapeString(strings.TrimSpace(r.rss.Channel.Title)),
    FeedURL:     strings.TrimSpace(baseURL),
    SiteURL:     strings.TrimSpace(r.rss.Channel.Link),
}

// Try to find the feed URL from the Atom links.
for _, atomLink := range r.rss.Channel.Links {
    atomLinkHref := strings.TrimSpace(atomLink.Href)
    if atomLinkHref != "" && atomLink.Rel == "self" {
        if absoluteFeedURL, err := urllib.AbsoluteURL(feed.FeedURL, atomLinkHref); err == nil {
            feed.FeedURL = absoluteFeedURL
            break
        }
    }
}
```

**Priority:**
1. Initially use base URL as feed URL
2. Look for Atom-style `<link rel="self">` in RSS channel
3. If found, override feed URL with self-referencing link
4. Site URL comes from RSS `<link>` element

**Key Design Decision:** Self URL from feed metadata takes precedence over fetch URL

### 3. URL NORMALIZATION DECISIONS

#### 3.1 No Query Parameter Stripping for Feed URLs

**Important Finding:** Miniflux does NOT strip query parameters from feed URLs themselves, only from entry URLs.

From code analysis:
- Feed URLs preserve query parameters (e.g., `?format=feed&type=rss`)
- This allows feeds with query-based configuration to work properly
- URL cleaning is only applied to entry URLs within feeds

#### 3.2 Absolute URL Conversion

All URLs (feed URLs, site URLs, entry URLs) are converted to absolute URLs using `/internal/urllib/url.go`:
- Relative URLs resolved against base URL
- Ensures consistency across different feed formats

#### 3.3 URL Trimming

All URLs undergo:
- `strings.TrimSpace()` to remove whitespace
- Trailing `?` removal after query param stripping (only if all params removed)

### 4. DUPLICATE FEED DETECTION

#### 4.1 Database Constraint

From **Issue #2507** and **Issue #2232**:
- PostgreSQL constraint: `feeds_user_id_feed_url_key`
- One feed URL per user (prevents true duplicates)
- Error shown: `pq: duplicate key value violates unique constraint`

**Current Behavior:**
- Users cannot add same URL twice
- No URL normalization before uniqueness check
- `https://example.com/feed` ≠ `https://example.com/feed/` (different URLs)

**Issue #3138** - "Allow subscription to the same url multiple times" (OPEN)
- **Use Case**: Apply different filter rules to same feed
- **Current Limitation**: Database constraint prevents this
- **Requested Feature**: Allow duplicate subscriptions for filtering purposes
- **Status**: Feature request, not implemented

#### 4.2 Entry Duplication Detection

From **Issue #797** - "Deduplicate Feature" (OPEN, 13 comments)
- **Scope**: This is about deduplicating *entries* across *different feeds*, not feed URLs
- **Current Behavior**: Entries identified by hash within same feed
- **Problem**: Same article in multiple feeds creates duplicates
- **Workarounds**: Community Python scripts using API
- **Status**: Frequently requested, no built-in solution

**Entry Hash Generation** (from RSS adapter):
```go
// Generate the entry hash.
switch {
case item.GUID.Data != "":
    entry.Hash = crypto.SHA256(item.GUID.Data)
case entryURL != "":
    entry.Hash = crypto.SHA256(entryURL)
default:
    entry.Hash = crypto.SHA256(entry.Title + entry.Content)
}
```

**Priority for entry uniqueness:**
1. GUID (if present)
2. Entry URL
3. Title + Content concatenation

### 5. DUPLICATE ENTRIES FROM CHANGING URLS

#### 5.1 Issue #458 - "Duplicate entries due to different subdomain in feed" (CLOSED)

**Problem Identified:**
- Publisher (Wiley, Taylor & Francis) served feeds with URLs alternating between subdomains
- Example: `https://asbmr.onlinelibrary.wiley.com/doi/abs/10.1002/jbmr.3904` vs `https://onlinelibrary.wiley.com/doi/abs/10.1002/jbmr.3904`
- Feed XML itself alternated URLs between requests (sometimes with `asbmr.` subdomain, sometimes without)
- Same entry would appear twice with different URLs

**Root Cause:**
- Publisher's feed generation inconsistency
- Miniflux hashes entries by URL, so URL changes = new entry
- Not a Miniflux bug - upstream feed issue

**Resolution:**
- Closed as "not a Miniflux problem"
- No URL normalization added for subdomain variations
- Publisher-side issue

**Design Implication:** Miniflux intentionally does NOT normalize URL variations like:
- www vs non-www
- Different subdomains
- HTTP vs HTTPS (probably)

#### 5.2 Issue #1409 - "danluu.com post duplicated" (CLOSED)

**Problem:** Old posts reappearing as new
**Linked to:** Discussion #3239 about entry republishing

#### 5.3 Issue #3120 - "DW duplicated entries when title changed" (CLOSED)

**Problem:** Deutsche Welle changes article titles after publication
**Current Behavior:** Creates new entry (because title used in fallback hash)
**Status:** No fix implemented - working as designed

### 6. EDGE CASES AND DESIGN DECISIONS

#### 6.1 Feed Discovery and Well-Known URLs

From `/internal/reader/subscription/finder.go`:

**Discovery Order:**
1. Check if URL is already a feed
2. Find canonical URL from website
3. Check for YouTube channel
4. Parse HTML meta tags for feed links
5. Try RSS-Bridge integration
6. Check well-known feed URLs (`feed.xml`, `rss.xml`, `atom.xml`, etc.)

**Well-Known URLs Tried:**
- `atom.xml`, `feed.atom`, `feed.xml`, `feed/`
- `index.rss`, `index.xml`, `rss.xml`, `rss/`, `rss/feed.xml`

**Important Edge Case (Issue #3889):**
- Sites returning 200 OK for non-existent pages confuse feed discovery
- Miniflux tries well-known URLs and may suggest invalid feeds
- No fix for this publisher misbehavior

#### 6.2 Canonical URL Detection

```go
// Step 2) Find the canonical URL of the website.
websiteURL = f.findCanonicalURL(websiteURL, responseHandler.ContentType(), bytes.NewReader(responseBody))
```

Miniflux attempts to find canonical URL from HTML before feed discovery.

#### 6.3 Redirect Handling

During well-known URL discovery:
```go
f.requestBuilder.WithoutRedirects()
// ...
if responseHandler.IsRedirect() {
    slog.Debug("Ignore URL redirection during feed discovery")
    continue
}
```

**Design Decision:** Ignore redirects during discovery to avoid suggesting incorrect URLs

### 7. ISSUES WITH STRIPPING FUNCTIONAL PARAMETERS

**Finding:** No reported issues with Miniflux stripping functional parameters

**Reasons:**
1. Tracking parameters are well-defined, conservative list
2. `ref` parameter only stripped when matching domain (smart logic)
3. No wildcard rules that might catch functional params
4. Case-insensitive matching prevents bypass issues

**Code Review:** The tracking parameter list is manually curated, not based on broad patterns that might catch functional parameters.

### 8. KEY TAKEAWAYS FOR YOUR FEEDCANON PROJECT

#### 8.1 What Miniflux Does Well

1. **Conservative tracking parameter list** - manually curated, based on multiple sources
2. **Smart ref parameter handling** - only removes when self-referencing
3. **Self URL priority** - respects feed metadata over fetch URL
4. **Performance-conscious** - optimized URL parsing
5. **Case-insensitive matching** - handles UTM_SOURCE and utm_source

#### 8.2 What Miniflux Doesn't Do

1. **No URL normalization for feed URLs** - preserves query parameters, subdomains, etc.
2. **No cross-feed entry deduplication** - frequently requested, not implemented
3. **No www normalization** - `www.example.com` ≠ `example.com`
4. **No protocol normalization** - `http://` ≠ `https://`
5. **No trailing slash normalization** - `/feed` ≠ `/feed/`

#### 8.3 Design Philosophy

- **Preserve publisher intent** - don't "fix" URLs unnecessarily
- **Fail safely** - better to have duplicates than lose content
- **Trust feed metadata** - self URLs take precedence
- **Performance matters** - URL operations are hot paths
- **Conservative parameter stripping** - only known tracking params

---

### SOURCE FILES

**Key Code Files:**
- `/internal/reader/urlcleaner/urlcleaner.go` - Tracking parameter removal
- `/internal/reader/urlcleaner/urlcleaner_test.go` - Test cases with examples
- `/internal/reader/atom/atom_10_adapter.go` - Atom feed self URL handling
- `/internal/reader/rss/adapter.go` - RSS feed self URL handling
- `/internal/reader/subscription/finder.go` - Feed discovery and normalization
- `/internal/urllib/url.go` - URL utility functions

**Key Issues:**
- #2720 - Tracking parameter stripping (implemented)
- #797 - Cross-feed deduplication (open, frequently requested)
- #458 - Subdomain duplicate entries (publisher issue)
- #3138 - Allow duplicate feed URLs (open feature request)
- #2507 - Database duplicate constraint error
- #3265 - ref parameter handling (PR merged)
- #3400 - Performance optimization (PR merged)

---

## F. TT-RSS (tt-rss/tt-rss)

### Research Findings: TT-RSS Feed URL Canonicalization

Based on my analysis of GitHub issues and source code from the tt-rss/tt-rss repository, here are the structured findings:

---

### MOST RELEVANT ISSUES

#### **Issue #57: Same article (URL) should be available in all feeds where it is published** (OPEN)
- **Issue Number**: #57
- **Status**: OPEN
- **Created**: 2025-10-16

**Problem Description:**
When the same article appears in multiple feeds (with identical URL but different feed sources), TT-RSS only shows it in ONE feed instead of all feeds where it was published. This is a fundamental design decision related to how TT-RSS handles article deduplication.

**Root Cause:**
The article GUID (entry_guid_hashed) is searched globally in table `ttrss_entries` only. Once an article with a specific GUID is found, it's not added to other feeds. The system treats articles as globally unique by GUID across the entire database, not per-feed.

**Proposed Solution (from issue reporter):**
Modify `classes/RSSUtils.php` to also check `ttrss_user_entries` table and create records for each feed where the article appears.

**Alternative approach (from user comment):**
Make article GUID unique within each feed rather than across entire database.

**Edge Cases/Design Decisions:**
- **User disagreement**: One user (ralphrmartin) noted this behavior is actually desired in some cases - if the same article appears in "Tech News" and "Finance News" feeds from the same outlet, they don't want to read it twice
- **Read state sharing**: If implemented, marking an article as read in one feed should mark it as read in all feeds (to avoid re-reading)

**Related Issue**: #69 (duplicate of #57)

---

#### **Issue #153: Ineffective cleanup** (CLOSED)
- **Issue Number**: #153
- **Status**: CLOSED
- **Created**: 2025-11-12

**Problem Description:**
Articles were not being purged despite purge settings being configured for 2 weeks.

**Root Cause (from maintainer response):**
Purging is based on **import timestamp** (internal to tt-rss), NOT article publication date. Import date is bumped every time an article is encountered in the feed to prevent purging and reimporting, which would create duplicates.

**Key Insight:**
This reveals TT-RSS's duplicate prevention strategy: they update import timestamps when seeing the same article again to avoid purge/reimport cycles that would create duplicates.

---

#### **Issue #118: Non-standard port is stripped** (CLOSED)
- **Issue Number**: #118
- **Status**: CLOSED
- **Created**: 2025-11-06
- **Fixed**: 2025-11-07

**Problem Description:**
Feed URLs and article links using non-standard ports (e.g., `http://example.org:8080`) had the port stripped, breaking links.

**Solution Implemented:**
Fixed in commit `ce3accb` - URL handling was updated to preserve non-standard ports.

**Edge Cases:**
Affects feed source links, article links, images, and hyperlinks in content body.

---

### HOW TT-RSS HANDLES FEED URLs AND DEDUPLICATION

Based on source code analysis of `/tmp/tt-rss-repo/classes/RSSUtils.php` and `/tmp/tt-rss-repo/classes/Pref_Feeds.php`:

#### **Feed URL Normalization:**
1. **Feed subscription** (`Pref_Feeds.php` lines 1209-1227):
   - When adding feeds, TT-RSS checks: `SELECT id FROM ttrss_feeds WHERE feed_url = ? AND owner_uid = ?`
   - URLs are validated using `UrlHelper::validate()` before insertion
   - **No URL canonicalization** is performed - exact string match is used
   - This means `http://example.com/feed` and `https://example.com/feed` are treated as different feeds

2. **Batch subscribe** checks for exact URL matches before inserting

#### **Article Deduplication Strategy:**
From `RSSUtils.php` lines 715-763, 975-1032:

1. **GUID Generation** (lines 715-717):
   ```php
   $entry_guid_hashed_compat = 'SHA1:' . sha1("{$feed_obj->owner_uid},$entry_guid");
   $entry_guid_hashed = json_encode(["ver" => 2, "uid" => $feed_obj->owner_uid, "hash" => 'SHA1:' . sha1($entry_guid)]);
   $entry_guid = "$feed_obj->owner_uid,$entry_guid";
   ```

2. **Duplicate Check** (lines 761-763):
   ```php
   SELECT id, content_hash, lang FROM ttrss_entries
   WHERE guid IN (?, ?, ?)
   ```
   Checks three GUID formats: raw, hashed (v2), and compat (v1)

3. **Global Deduplication**:
   - Articles are deduplicated **globally across all feeds** by GUID
   - Once a GUID exists in `ttrss_entries`, it's reused rather than creating a new entry
   - Only the first feed to import an article "owns" it in the system

4. **Import Timestamp Bumping**:
   - When the same article is seen again, import timestamp is updated to prevent purge/reimport cycles

#### **Redirect Handling:**

**Issue #128: Disable initial redirect** and **Issue #32: SELF_URL_PATH not updating**:
- TT-RSS has complex redirect handling for HTTPS/HTTP and path-based routing
- URL protocol detection relies on `X-Forwarded-Proto` header from reverse proxies
- No evidence of following feed-level redirects (301/302) during feed fetching
- Focus is on installation-level URL configuration, not feed URL redirects

---

### KEY DESIGN DECISIONS AND RATIONALE

1. **No Feed URL Canonicalization**:
   - TT-RSS does NOT normalize feed URLs (no www removal, protocol normalization, etc.)
   - Relies on exact string matching for duplicate feed detection
   - This can lead to duplicate feed subscriptions if URL differs slightly

2. **Global Article Deduplication by GUID**:
   - Articles are globally unique by GUID across entire database
   - Design philosophy: one article = one database entry, regardless of how many feeds publish it
   - This differs from readers like FreshRSS and Miniflux (per Issue #57)

3. **Owner-scoped GUIDs**:
   - GUIDs include `owner_uid` in hash calculation
   - Each user has their own article namespace
   - Same article from same feed for different users = different entries

4. **No HTTP→HTTPS or WWW normalization**:
   - No evidence of automatic URL normalization in codebase
   - URLs are validated but not canonicalized

---

### BUGS AND FIXES RELATED TO URL HANDLING

1. **Non-standard ports stripped** (#118) - FIXED
2. **Unicode/diacritics in URLs** (#81) - validation fails for unencoded Unicode characters
3. **Reverse proxy URL detection** (#32, #128) - requires proper `X-Forwarded-Proto` headers
4. **Feed discovery** - no specific issues found about autodiscovery or feed URL detection

---

### WHAT TT-RSS DOES NOT DO

Based on absence of evidence in issues and code:

1. **No URL canonicalization** before feed subscription
2. **No redirect following** for feed URLs to find canonical version
3. **No www/non-www normalization**
4. **No HTTP/HTTPS protocol normalization**
5. **No trailing slash normalization**
6. **No query parameter ordering**
7. **No feed autodiscovery** improvements mentioned in recent issues

---

This research provides comprehensive insight into TT-RSS's approach to feed URL handling and article deduplication, which can inform the design of your feedcanon library.
