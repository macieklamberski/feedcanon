# Feed Reader URL Handling Research

Comprehensive analysis of URL normalization and canonicalization approaches across 24 feed readers, compiled to inform feedcanon's design.

---

## Executive Summary

**Key Finding**: Almost no feed reader implements comprehensive URL normalization. Most rely on exact string matching, creating duplicate feeds for URL variants like `http://` vs `https://`, `www.` vs non-www, and trailing slashes.

**Feedcanon's Position**: Leads in URL handling sophistication with 14 normalization options and 138+ tracking parameters. Gold-standard readers (CommaFeed, NewsBlur) have better infrastructure features (concurrency, audit trails) but weaker URL normalization.

---

## Sophistication Tiers

### Tier 1: Most Sophisticated (5/5)

| Reader | Key Strength |
|--------|--------------|
| **CommaFeed** | Aggressive normalization with `urlcanon`, striped lock pool |
| **NewsBlur** | DuplicateFeed audit trail, smart merge logic |

### Tier 2: Advanced (4/5)

| Reader | Key Strength |
|--------|--------------|
| **GetStream Winds** | Adaptive fingerprinting, GUID stability detection |
| **FeedHQ** | Two-tier architecture (UniqueFeed + Feed) |
| **RSSNext-Folo** | Modern implementation |
| **Feeder** | Per-feed skipDuplicates setting |

### Tier 3: Moderate (3/5)

| Reader | Key Strength |
|--------|--------------|
| **FreshRSS** | Self URL for WebSub, credential stripping |
| **Feedbin** | 6-day redirect stability confirmation |
| **Liferea** | Two-URL architecture (source + orig_source) |
| **Nextcloud News** | Integrated ecosystem |

### Tier 4: Basic (2/5)

NetNewsWire, Brief, TT-RSS, RSS Guard, Sismics, Newsboat, yarr, Stringer

### Tier 5: Minimal (1/5)

Miniflux, lemon24, ReadYou, CapyReader, Flym, Fluent Reader, Lettura, Kriss Feed

---

## Feedcanon vs Gold Standard

### Quick Verdict

| Category | Winner | Notes |
|----------|--------|-------|
| **URL Normalization** | Feedcanon | 14 options vs ~6 |
| **Tracking Param Stripping** | Feedcanon | 138 params vs FeedBurner-only |
| **Self URL Validation** | Feedcanon | Full algorithm vs not used |
| **Content Verification** | Feedcanon | Multiple methods vs hash-only |
| **HTTPS Upgrade** | Feedcanon | Has method vs forces HTTP |
| **Concurrency Control** | CommaFeed | Striped lock pool (out of scope for feedcanon) |
| **Redirect Stability** | Feedbin | 6-day confirmation (caller responsibility) |
| **Merge Audit Trail** | NewsBlur | DuplicateFeed records (caller responsibility) |

### Normalization Options Comparison

| Option | Feedcanon | CommaFeed | NewsBlur |
|--------|:---------:|:---------:|:--------:|
| Strip protocol for comparison | Yes | No | No |
| Strip www | Yes | Yes | No |
| Strip authentication | Yes | No | No |
| Strip default ports | Yes | Yes | Yes |
| Remove trailing slash | Yes | Partial | No |
| Collapse multiple slashes | Yes | Yes | Yes |
| Strip hash/fragment | Yes | Yes | Yes |
| Strip text fragments | Yes | No | No |
| Sort query params | Yes | Yes | No |
| Strip tracking params | Yes (138) | Partial | No |
| Remove empty query | Yes | No | No |
| Normalize percent encoding | Yes | Yes | Yes |
| Lowercase hostname | Yes | Yes | Yes |
| Unicode NFC normalization | Yes | No | Yes |
| Punycode/IDNA conversion | Yes | No | No |
| **Total** | **14** | **~6** | **~5** |

### Where Feedcanon Shines

| Advantage | Impact |
|-----------|--------|
| 14 normalization options | Catches more URL variants |
| 138 tracking params stripped | Cleaner canonical URLs |
| Self URL validation | Better canonical selection |
| Feed data hash method | Handles content variations |
| HTTPS upgrade method | Modernizes legacy feeds |
| Complete protocol support | Handles all feed:// variants |
| Punycode/Unicode handling | International domain support |

### Intentionally Out of Scope

Feedcanon is a library. These features belong in the caller (e.g., Feedstand):

| Feature | Why Out of Scope |
|---------|------------------|
| Concurrency control | Database layer responsibility |
| Alias tracking | Application-specific schema |
| Merge audit trail | Optional debugging feature |
| Redirect stability | Stateful, needs persistence |
| Queue deduplication | Job queue responsibility |

---

## Detailed Reader Analysis

### CommaFeed (Gold Standard)

**Deduplication:** SHA1 hash of aggressively normalized URL

**Normalization:**
- Uses `urlcanon` library with `AGGRESSIVE` mode
- Strips www prefix
- Forces HTTPS → HTTP (controversial but consistent)
- Removes trailing slash
- Sorts query params
- Special FeedBurner handling

**Unique Techniques:**
- Striped lock pool (100,000 locks) for concurrency
- Hash-based O(1) lookups with string verification
- Three-URL storage: `url`, `normalizedUrl`, `urlAfterRedirect`

**Key Code:** `backend/Urls.java`, `backend/service/FeedService.java`

### NewsBlur (Gold Standard)

**Deduplication:** SHA1 hash of `feed_address + feed_link`

**URL Normalization (`urlnorm.py`):**
- Scheme lowercase
- Host lowercase, trailing dots removed
- Default ports stripped
- Path dot-segments resolved
- Query params sorted alphabetically
- `feed://` → `http://`

**Unique Techniques:**
- `DuplicateFeed` model for audit trail
- Requires 10+ confirmations before trusting redirects
- Smart merge: keeps feed with more subscribers
- Filters FeedBurner redirects as false positives

**Key Code:** `utils/urlnorm.py`, `apps/rss_feeds/models.py`

### Feedbin

**Deduplication:** Unique index on `feed_url`

**Redirect Stability System:**
- Only tracks permanent redirects (301/308)
- **Requires 576+ confirmations over 6+ days**
- Uses SHA1 hash of redirect chain as cache key
- Stores `redirected_to` in database once stable

**Self URL:** Stored but NOT used for deduplication (only PubSubHubbub)

**Key Code:** `app/models/feed.rb`, `app/jobs/feed_crawler/lib/redirect_cache.rb`

### Miniflux

**Self URL Handling:** Prioritizes `link[rel=self]` over response URL

**Tracking Parameters:** 80+ removed including UTM, Facebook, Google, Mailchimp, Matomo

**Limitations:**
- No scheme normalization (http/https different)
- No domain normalization (www/non-www different)

**Key Code:** `internal/reader/urlcleaner/urlcleaner.go`

### FreshRSS

**Self URL Usage:** Extracted via SimplePie, used for WebSub only

**Redirect Behavior:** Auto-updates stored URL on 301 redirects

**Key Code:** `app/Utils/httpUtil.php`, `app/Models/Feed.php`

### GetStream Winds

**Adaptive Fingerprinting:**
- Tests 4 strategies: GUID → Link → Enclosure → Hash
- Selects best strategy based on stability
- GUID stability detection (4-minute control test)

**Key Code:** NPM `normalize-url` for URL handling

---

## Key Techniques Worth Adopting

### From CommaFeed
- Aggressive URL canonicalization
- Hash-based O(1) lookups
- FeedBurner special handling (`feedproxy.google.com` → `feeds.feedburner.com`)

### From Feedbin
- Redirect stability confirmation (6-day algorithm)
- `discovered_feeds` fallback table

### From NewsBlur
- `DuplicateFeed` audit trail for debugging
- Smart merge (prefer feed with more subscribers)

### From GetStream Winds
- Adaptive fingerprinting strategy selection
- GUID stability detection

### From Liferea
- Two-URL architecture (current + original)

---

## URL Normalization Coverage Matrix

| Normalization | Feedcanon | CommaFeed | Winds | NewsBlur | FreshRSS |
|---------------|:---------:|:---------:|:-----:|:--------:|:--------:|
| Strip www | Yes | Yes | Yes | No | No |
| http→https | Yes | Yes* | No | No | No |
| Trailing slash | Yes | Yes | Yes | No | No |
| Query param sort | Yes | Yes | Yes | No | No |
| Fragment removal | Yes | Yes | Yes | Yes | No |
| Default port | Yes | Yes | No | No | No |
| Case normalize | Yes | Yes | Yes | Yes | No |
| Tracking params | Yes (138) | Partial | No | No | No |
| Punycode/IDN | Yes | Yes | No | No | Yes |

*CommaFeed forces HTTP, not HTTPS (unusual choice)

---

## Insights

### 1. Self URL is Universally Ignored for Deduplication

- FreshRSS and Feedbin extract it for WebSub/PubSubHubbub
- None use it for canonical URL selection
- **Feedcanon's approach is unique**

### 2. Tracking Parameter Stripping is Rare

Only CommaFeed strips FeedBurner params. No reader strips UTM parameters.

### 3. Two Architectural Patterns

**Proactive Normalization (CommaFeed):**
```
URL → normalize() → hash → lookup → single record
```
- Zero duplication window
- Risk of false positives

**Reactive Merge (NewsBlur):**
```
URL → store → collision detected → auto-merge
```
- Brief duplication window
- Lower false positive risk

### 4. Content Hashing is Underutilized

Most use hashing for change detection only. GetStream Winds' adaptive fingerprinting is the most sophisticated.

---

_Analysis based on 24 feed reader codebases. Last updated: December 2024_
