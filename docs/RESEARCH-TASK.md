# Feed Canonicalization Research Task

Comprehensive research task to validate feedcanon's URL normalization decisions by analyzing real-world issues from production feed readers.

---

## Objective

Analyze GitHub issues (open and closed) from major feed readers to identify:
1. Problems with specific URL normalization choices
2. Edge cases causing false positives (different feeds treated as same)
3. Edge cases causing false negatives (same feed treated as different)
4. Real-world bugs and their fixes
5. Design decisions and their rationale

---

## Target Repositories

| Repository | Focus Areas | Issue Search Keywords |
|------------|-------------|----------------------|
| [Athou/commafeed](https://github.com/Athou/commafeed) | URL normalization, FeedBurner handling, duplicate detection | `duplicate`, `url`, `normalize`, `canonical`, `feedburner`, `redirect`, `www`, `https` |
| [samuelclay/NewsBlur](https://github.com/samuelclay/NewsBlur) | DuplicateFeed, merge logic, urlnorm | `duplicate`, `merge`, `url`, `normalize`, `redirect`, `alias` |
| [FreshRSS/FreshRSS](https://github.com/FreshRSS/FreshRSS) | Self URL, WebSub, SimplePie | `duplicate`, `url`, `redirect`, `self`, `canonical`, `websub` |
| [feedbin/feedbin](https://github.com/feedbin/feedbin) | Redirect stability, 301 handling | `redirect`, `duplicate`, `url`, `301`, `permanent`, `canonical` |
| [miniflux/v2](https://github.com/miniflux/v2) | Tracking params, self URL priority | `duplicate`, `url`, `tracking`, `utm`, `canonical`, `normalize` |
| [tt-rss/tt-rss](https://github.com/tt-rss/tt-rss) | General feed handling issues | `duplicate`, `url`, `feed`, `redirect` |

---

## Research Questions by Category

### 1. Protocol Normalization (http vs https)

**Current feedcanon behavior:** `protocol: true` - treats http and https as equivalent for comparison.

**Research questions:**
- Are there cases where http and https versions of a feed serve different content?
- How do readers handle HTTPS upgrades? Do they prefer HTTPS?
- Issues with mixed content or certificate problems?
- Should we attempt HTTPS upgrade before falling back to HTTP?

**Search terms:** `http https`, `protocol`, `ssl`, `certificate`, `mixed content`, `upgrade`

---

### 2. Authentication in URLs

**Current feedcanon behavior:** `authentication: false` - preserves user:pass@ in URLs.

**Research questions:**
- How do other readers handle authenticated feed URLs?
- Are there private podcast/feed services using basic auth in URLs?
- Security concerns with storing credentials in URLs?
- Should authenticated URLs ever be compared to non-authenticated versions?

**Search terms:** `auth`, `password`, `credential`, `private feed`, `token`, `user:pass`, `basic auth`

---

### 3. WWW Prefix Handling

**Current feedcanon behavior:** `www: true` - strips www prefix, treating www.example.com = example.com.

**Research questions:**
- Are there real cases where www and non-www serve different feeds?
- DNS/server configuration issues where they point to different servers?
- CDN configurations that differ?

**Search terms:** `www`, `subdomain`, `domain`, `duplicate`

---

### 4. Trailing Slash Normalization

**Current feedcanon behavior:** `trailingSlash: true` - removes trailing slashes.

**Research questions:**
- Server configurations where `/feed` vs `/feed/` return different content?
- Directory index vs file resource confusion?
- Any reported false positives from this normalization?

**Search terms:** `trailing slash`, `slash`, `/feed/`, `directory`

---

### 5. Query Parameter Handling

**Current feedcanon behavior:** Sort params alphabetically, strip 138 known tracking params.

**Research questions:**
- Which tracking parameters have caused issues when stripped?
- Are there functional parameters that look like tracking params?
- Parameters that affect feed content (pagination, format, filter)?
- Query parameter order significance?

**Search terms:** `utm`, `query`, `parameter`, `tracking`, `fbclid`, `format=`, `page=`

---

### 6. FeedBurner and Proxy Services

**Current feedcanon behavior:** No special handling.

**Research questions:**
- What FeedBurner URL patterns exist? (feeds.feedburner.com, feedproxy.google.com, feeds2.feedburner.com)
- How does CommaFeed normalize FeedBurner URLs?
- Other feed proxy services that need special handling?
- FeedBurner shutdown/migration issues?

**Search terms:** `feedburner`, `feedproxy`, `google`, `proxy`, `redirect`

---

### 7. Redirect Handling

**Current feedcanon behavior:** Follows redirects, uses final URL.

**Research questions:**
- Permanent (301/308) vs temporary (302/307) redirect handling?
- Redirect loop detection?
- Redirect chain length limits?
- Captive portal / WiFi login page false redirects?
- CDN temporary redirects?
- How long should redirect stability be confirmed? (Feedbin: 6 days)

**Search terms:** `redirect`, `301`, `302`, `permanent`, `temporary`, `loop`, `chain`

---

### 8. Self URL (atom:link rel="self")

**Current feedcanon behavior:** Uses self URL as canonical candidate if present.

**Research questions:**
- Feeds with incorrect/outdated self URLs?
- Self URL pointing to different domain?
- Self URL with different protocol than fetched URL?
- Should self URL be trusted or verified?

**Search terms:** `self`, `atom:link`, `canonical`, `rel=self`, `link`

---

### 9. International Domain Names (IDN/Punycode)

**Current feedcanon behavior:** `punycode: true` - converts IDN to ASCII (punycode).

**Research questions:**
- Issues with Unicode domain comparison?
- Punycode conversion edge cases?
- Mixed ASCII/Unicode in same domain?
- Homograph attack concerns vs usability?

**Search terms:** `unicode`, `punycode`, `idn`, `international`, `domain`, `encoding`

---

### 10. Content Hash Comparison

**Current feedcanon behavior:** `responseHash: true` - compares MD5 hash of response body.

**Research questions:**
- Dynamic content causing hash mismatches?
- Timestamp fields changing between requests?
- Whitespace/formatting differences?
- Compression affecting hash?
- BOM (Byte Order Mark) issues?

**Search terms:** `hash`, `content`, `duplicate`, `same feed`, `match`, `compare`

---

### 11. Feed Aliasing and Merging

**Research questions:**
- How do readers handle discovered duplicates?
- Merge strategies (which feed to keep)?
- User notification of merges?
- Alias tracking for redirected feeds?
- Subscriber count preservation during merge?

**Search terms:** `merge`, `alias`, `duplicate`, `combine`, `subscriber`, `move`

---

### 12. Case Sensitivity

**Current feedcanon behavior:** `case: true` - lowercases hostname only (path preserved).

**Research questions:**
- Servers with case-sensitive paths?
- Issues with path case normalization?
- Query parameter case sensitivity?

**Search terms:** `case`, `sensitive`, `uppercase`, `lowercase`, `path`

---

## Execution Instructions

Deploy 6 parallel subagents, one for each major repository:

```
For each repository:
1. Search GitHub issues (open AND closed) using the keywords above
2. Focus on issues related to URL handling, duplicates, canonicalization
3. Extract:
   - Problem description
   - Root cause
   - Solution implemented
   - Any edge cases mentioned
4. Note any design decisions or rationale discussed
5. Identify patterns across multiple issues
```

---

## Expected Deliverables

After research, compile findings into:

1. **Validation Report**: Which of our current defaults are validated by real-world usage?
2. **Risk Assessment**: Which defaults might cause problems based on reported issues?
3. **Missing Features**: What do other readers handle that we don't?
4. **Recommended Changes**: Specific changes to feedcanon based on findings
5. **Edge Case Catalog**: Document of known edge cases to consider

---

## Priority Order

Research in this order of importance:

1. **HIGH**: FeedBurner handling (CommaFeed) - we're missing this entirely
2. **HIGH**: Redirect stability (Feedbin, NewsBlur) - understand confirmation patterns
3. **HIGH**: Query parameter edge cases - risk of stripping functional params
4. **MEDIUM**: Protocol handling - http vs https decisions
5. **MEDIUM**: Self URL reliability - should we trust it?
6. **MEDIUM**: Content hash issues - dynamic content problems
7. **LOW**: WWW/trailing slash - likely low-risk
8. **LOW**: IDN/Punycode - rare edge cases

---

_Task prepared: December 2024_
