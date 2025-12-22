# Canonicalization Cases

Comprehensive scenarios showing how the progressive canonicalization algorithm handles different URL situations.

---

## Algorithm Overview

```
1. Fetch input URL
2. Get response URL (after redirects)
3. Parse feed → extract self URL
4. Validate self URL (fetch and compare content hash)
5. Select variant source: selfUrl if valid, otherwise responseUrl
6. Generate normalized variants from source (platform handlers applied here)
7. Deduplicate variants
8. Test variants progressively until one matches content
9. Attempt HTTPS upgrade on winning URL
10. Return canonical URL
```

---

## Case 1: Platform-Specific Domain (FeedBurner)

### Input
```
User enters: https://feedproxy.google.com/TechCrunch?format=xml
```

### Step-by-Step

```
Step 1: Apply platform handler to input
  feedproxy.google.com → feeds.feedburner.com
  Strip all query params (FeedBurner-specific)
  Result: https://feeds.feedburner.com/TechCrunch

Step 2: Fetch transformed URL
  GET https://feeds.feedburner.com/TechCrunch
  Response: 200 OK
  Response URL: https://feeds.feedburner.com/TechCrunch (no redirect)
  Content hash: abc123

Step 3: Apply platform handler to response URL
  Already canonical, no change

Step 4: Parse feed, extract self URL
  Self URL: http://feeds.feedburner.com/TechCrunch

Step 5: Apply platform handler to self URL
  Already correct domain
  Result: http://feeds.feedburner.com/TechCrunch

Step 6: Collect sources
  - responseUrl: https://feeds.feedburner.com/TechCrunch
  - selfUrl: http://feeds.feedburner.com/TechCrunch

Step 7: Generate variants (sorted by cleanliness)
  1. https://feeds.feedburner.com/TechCrunch (score: 170)
  2. http://feeds.feedburner.com/TechCrunch (score: 70)

Step 8: Test variants
  #1 is already responseUrl → verified, no extra fetch needed

Result: {
  url: "https://feeds.feedburner.com/TechCrunch",
  reason: "response_url"
}
```

### Notes
- Platform handler applied BEFORE fetch saves potential redirect
- Query params stripped because FeedBurner uses them for tracking only
- Self URL was HTTP, but HTTPS responseUrl wins (cleaner)

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `feedproxy.google.com/X?format=xml` | No FeedBurner handler |
| Feedbin | `feedproxy.google.com/X?format=xml` | URL immutable |
| Miniflux | `feedproxy.google.com/X?format=xml` | No platform handlers |
| FreshRSS | `feedproxy.google.com/X?format=xml` | No normalization |
| CommaFeed | `http://feeds.feedburner.com/X` | FeedBurner handler + HTTPS→HTTP |
| NetNewsWire | `feedproxy.google.com/X?format=xml` | URL immutable |
| tt-rss | `feedproxy.google.com/X?format=xml` | No normalization |
| Feeder | `feedproxy.google.com/X?format=xml` | URL immutable |
| Liferea | `feedproxy.google.com/X?format=xml` | Stores in orig_source |
| Nextcloud | `feedproxy.google.com/X?format=xml` | No normalization |
| **feedcanon** | `https://feeds.feedburner.com/X` | **Platform handler + HTTPS** |

---

## Case 2: Polluted URL That Works Simplified

### Input
```
User enters: http://www.example.com/feed/?utm_source=twitter&utm_medium=social&ref=sidebar#comments
```

### Step-by-Step

```
Step 1: Apply platform handler to input
  No matching platform handler
  Result: unchanged

Step 2: Fetch input URL
  GET http://www.example.com/feed/?utm_source=twitter&utm_medium=social&ref=sidebar#comments
  Response: 200 OK
  Response URL: http://www.example.com/feed/?utm_source=twitter&utm_medium=social&ref=sidebar
  (Note: fragment stripped by HTTP, not sent to server)
  Content hash: xyz789

Step 3: Parse feed, extract self URL
  Self URL: http://www.example.com/feed/

Step 4: Collect sources
  - responseUrl: http://www.example.com/feed/?utm_source=twitter&utm_medium=social&ref=sidebar
  - selfUrl: http://www.example.com/feed/

Step 5: Generate variants (sorted by cleanliness)
  From responseUrl:
    1. https://example.com/feed (score: 195) - HTTPS, no www, no slash, no params
    2. https://www.example.com/feed (score: 145)
    3. http://example.com/feed (score: 95)
    4. http://www.example.com/feed (score: 45)
    5. http://www.example.com/feed/?utm_source=twitter... (score: 10)

  From selfUrl:
    1. https://example.com/feed (score: 195) - duplicate, skip
    2. https://www.example.com/feed (score: 145) - duplicate, skip
    ...

  Deduplicated list:
    1. https://example.com/feed (score: 195)
    2. https://www.example.com/feed (score: 145)
    3. http://example.com/feed (score: 95)
    4. http://www.example.com/feed (score: 45)
    ...

Step 6: Test variants progressively
  Test #1: https://example.com/feed
    GET https://example.com/feed
    Response: 200 OK
    Content hash: xyz789 ✓ (matches original)

Result: {
  url: "https://example.com/feed",
  reason: "content_verified"
}
```

### Notes
- Cleanest variant tested first
- One extra request to verify HTTPS + simplified URL works
- All tracking params stripped, www removed, trailing slash removed
- Original polluted URL becomes an alias

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `http://www.example.com/feed/?utm_source=...` | No param stripping |
| Feedbin | `http://www.example.com/feed/?utm_source=...` | URL immutable |
| Miniflux | `http://www.example.com/feed/` | Strips tracking params |
| FreshRSS | `http://www.example.com/feed/?utm_source=...` | No param stripping |
| CommaFeed | `http://www.example.com/feed/?utm_source=...` | Params preserved in url field |
| NetNewsWire | `http://www.example.com/feed/?utm_source=...` | Exact URL stored |
| tt-rss | `http://www.example.com/feed/?utm_source=...` | No normalization |
| Feeder | `http://www.example.com/feed/?utm_source=...` | Preserves all params |
| Liferea | `http://www.example.com/feed/?utm_source=...` | No param stripping |
| Nextcloud | `http://www.example.com/feed/?utm_source=...` | No normalization |
| **feedcanon** | `https://example.com/feed` | **HTTPS + clean URL verified** |

---

## Case 3: Polluted URL with Working Self URL

### Input
```
User enters: http://www.blog.example.com/rss.xml?source=homepage&_=1702934567
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET http://www.blog.example.com/rss.xml?source=homepage&_=1702934567
  Response: 200 OK
  Response URL: http://www.blog.example.com/rss.xml?source=homepage&_=1702934567
  Content hash: def456

Step 2: Parse feed, extract self URL
  Self URL: https://blog.example.com/rss.xml

Step 3: Collect sources
  - responseUrl: http://www.blog.example.com/rss.xml?source=homepage&_=1702934567
  - selfUrl: https://blog.example.com/rss.xml

Step 4: Generate variants (sorted by cleanliness)
  1. https://blog.example.com/rss.xml (score: 195) - from selfUrl, already clean
  2. https://www.blog.example.com/rss.xml (score: 145)
  3. http://blog.example.com/rss.xml (score: 95)
  4. http://www.blog.example.com/rss.xml (score: 45)
  5. http://www.blog.example.com/rss.xml?source=homepage&_=1702934567 (score: 5)

Step 5: Test variants
  Test #1: https://blog.example.com/rss.xml
    GET https://blog.example.com/rss.xml
    Response: 200 OK
    Content hash: def456 ✓ (matches)

Result: {
  url: "https://blog.example.com/rss.xml",
  reason: "content_verified"
}
```

### Notes
- Self URL was already the cleanest form
- Self URL provided HTTPS, original was HTTP
- Self URL had no www, original had www
- Self URL had no query params, original had cache-buster and tracking

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `http://www.blog.example.com/rss.xml?...` | Self URL ignored |
| Feedbin | `http://www.blog.example.com/rss.xml?...` | Self URL for WebSub only |
| Miniflux | `http://www.blog.example.com/rss.xml` | Strips params, ignores self |
| FreshRSS | `http://www.blog.example.com/rss.xml?...` | Self URL only if WebSub |
| CommaFeed | `http://www.blog.example.com/rss.xml?...` | Self URL ignored |
| NetNewsWire | `http://www.blog.example.com/rss.xml?...` | Self URL ignored |
| tt-rss | `http://www.blog.example.com/rss.xml?...` | Self URL ignored |
| Feeder | `http://www.blog.example.com/rss.xml?...` | Self URL removed after complaints |
| Liferea | `http://www.blog.example.com/rss.xml?...` | Self URL ignored |
| Nextcloud | `http://www.blog.example.com/rss.xml?...` | Self URL ignored |
| **feedcanon** | `https://blog.example.com/rss.xml` | **Self URL verified + adopted** |

---

## Case 4: Self URL Does Not Work

### Input
```
User enters: https://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed
  Response: 200 OK
  Response URL: https://example.com/feed
  Content hash: ghi789

Step 2: Parse feed, extract self URL
  Self URL: https://old.example.com/feed (outdated, server moved)

Step 3: Collect sources
  - responseUrl: https://example.com/feed
  - selfUrl: https://old.example.com/feed

Step 4: Generate variants (sorted by cleanliness)
  From responseUrl:
    1. https://example.com/feed (score: 195)
    2. http://example.com/feed (score: 95)

  From selfUrl:
    3. https://old.example.com/feed (score: 195)
    4. http://old.example.com/feed (score: 95)

Step 5: Test variants
  Test #1: https://example.com/feed
    Already responseUrl → verified, no fetch needed

Result: {
  url: "https://example.com/feed",
  reason: "response_url"
}
```

### Notes
- Self URL pointed to old/dead domain
- responseUrl was already the cleanest working option
- No wasted request on dead self URL because responseUrl tested first

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `https://example.com/feed` | Self URL ignored |
| Feedbin | `https://example.com/feed` | Self URL ignored |
| Miniflux | `https://example.com/feed` | Self URL ignored |
| FreshRSS | `https://example.com/feed` | Self URL ignored |
| CommaFeed | `https://example.com/feed` | Self URL ignored |
| NetNewsWire | `https://example.com/feed` | Self URL ignored |
| tt-rss | `https://example.com/feed` | Self URL ignored |
| Feeder | `https://example.com/feed` | Self URL ignored |
| Liferea | `https://example.com/feed` | Self URL ignored |
| Nextcloud | `https://example.com/feed` | Self URL ignored |
| **feedcanon** | `https://example.com/feed` | **ResponseUrl wins (verified first)** |

---

## Case 5: Self URL Produces Different Feed

### Input
```
User enters: https://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed
  Response: 200 OK
  Response URL: https://example.com/feed
  Content hash: aaa111

Step 2: Parse feed, extract self URL
  Self URL: https://example.com/feed/full
  (Publisher misconfigured - self URL points to full-text variant)

Step 3: Collect sources
  - responseUrl: https://example.com/feed
  - selfUrl: https://example.com/feed/full

Step 4: Generate variants (sorted by cleanliness)
  1. https://example.com/feed (score: 195)
  2. http://example.com/feed (score: 95)
  3. https://example.com/feed/full (score: 190) - slightly less clean (longer)
  4. http://example.com/feed/full (score: 90)

Step 5: Test variants
  Test #1: https://example.com/feed
    Already responseUrl → verified

Result: {
  url: "https://example.com/feed",
  reason: "response_url"
}
```

### Notes
- Self URL was a different feed variant
- We don't need to detect "different feed" - we just use what works
- responseUrl is preferred because we already know it works
- The "full" variant is never tested because responseUrl succeeds first

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `https://example.com/feed` | Self URL ignored |
| Feedbin | `https://example.com/feed` | Self URL ignored |
| Miniflux | `https://example.com/feed` | Self URL ignored |
| FreshRSS | `https://example.com/feed` | Self URL ignored |
| CommaFeed | `https://example.com/feed` | Self URL ignored |
| NetNewsWire | `https://example.com/feed` | Self URL ignored |
| tt-rss | `https://example.com/feed` | Self URL ignored |
| Feeder | `https://example.com/feed` | Self URL ignored |
| Liferea | `https://example.com/feed` | Self URL ignored |
| Nextcloud | `https://example.com/feed` | Self URL ignored |
| **feedcanon** | `https://example.com/feed` | **ResponseUrl wins** |

---

## Case 6: Input URL Redirects

### Input
```
User enters: http://old-blog.example.com/rss
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET http://old-blog.example.com/rss
  Response: 301 → https://blog.example.com/feed
  Response: 200 OK
  Response URL: https://blog.example.com/feed
  Content hash: bbb222

Step 2: Parse feed, extract self URL
  Self URL: https://blog.example.com/feed

Step 3: Collect sources
  - responseUrl: https://blog.example.com/feed
  - selfUrl: https://blog.example.com/feed (same)

Step 4: Generate variants
  1. https://blog.example.com/feed (score: 195)
  2. http://blog.example.com/feed (score: 95)

Step 5: Test variants
  Test #1: https://blog.example.com/feed
    Already responseUrl → verified

Result: {
  url: "https://blog.example.com/feed",
  reason: "response_url"
}
```

### Notes
- Redirect was followed automatically
- Old URL becomes an alias in the caller's database
- Canonical is the final destination

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `http://old-blog.example.com/rss` | Updates after 10+ redirects |
| Feedbin | `https://blog.example.com/feed` | Follows 301 on discovery |
| Miniflux | `https://blog.example.com/feed` | Stores EffectiveURL |
| FreshRSS | `https://blog.example.com/feed` | Follows 301 via subscribe_url |
| CommaFeed | Input URL, `urlAfterRedirect` field | Two-field approach |
| NetNewsWire | `http://old-blog.example.com/rss` | No redirect following |
| tt-rss | `http://old-blog.example.com/rss` | No redirect persistence |
| Feeder | `http://old-blog.example.com/rss` | No redirect following |
| Liferea | `https://blog.example.com/feed` | Updates on 301/308 |
| Nextcloud | Input URL, `location` field | Two-field approach |
| **feedcanon** | `https://blog.example.com/feed` | **Follows redirects** |

---

## Case 7: HTTPS Upgrade Success

### Input
```
User enters: http://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET http://example.com/feed
  Response: 200 OK
  Response URL: http://example.com/feed (no redirect to HTTPS)
  Content hash: ccc333

Step 2: Parse feed, extract self URL
  Self URL: http://example.com/feed (also HTTP)

Step 3: Collect sources
  - responseUrl: http://example.com/feed
  - selfUrl: http://example.com/feed (same)

Step 4: Generate variants
  1. https://example.com/feed (score: 195) - HTTPS upgrade
  2. http://example.com/feed (score: 95)

Step 5: Test variants
  Test #1: https://example.com/feed
    GET https://example.com/feed
    Response: 200 OK
    Content hash: ccc333 ✓ (matches)

Result: {
  url: "https://example.com/feed",
  reason: "content_verified"
}
```

### Notes
- Server didn't redirect HTTP → HTTPS automatically
- We tested HTTPS variant and it worked
- Upgraded to HTTPS even though original was HTTP

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `http://example.com/feed` | No HTTPS upgrade |
| Feedbin | `http://example.com/feed` | No automatic upgrade |
| Miniflux | `http://example.com/feed` | Uses EffectiveURL only |
| FreshRSS | `http://example.com/feed` | No HTTPS preference |
| CommaFeed | `https://example.com/feed` | HTTPS upgrade on subscription |
| NetNewsWire | `http://example.com/feed` | No upgrade |
| tt-rss | `http://example.com/feed` | No upgrade |
| Feeder | `http://example.com/feed` | No upgrade |
| Liferea | `http://example.com/feed` | No automatic upgrade |
| Nextcloud | `http://example.com/feed` | No upgrade |
| **feedcanon** | `https://example.com/feed` | **HTTPS tested + verified** |

---

## Case 8: HTTPS Upgrade Failure

### Input
```
User enters: http://legacy.example.com/feed.rss
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET http://legacy.example.com/feed.rss
  Response: 200 OK
  Response URL: http://legacy.example.com/feed.rss
  Content hash: ddd444

Step 2: Parse feed, extract self URL
  Self URL: http://legacy.example.com/feed.rss

Step 3: Generate variants
  1. https://legacy.example.com/feed.rss (score: 195)
  2. http://legacy.example.com/feed.rss (score: 95)

Step 4: Test variants
  Test #1: https://legacy.example.com/feed.rss
    GET https://legacy.example.com/feed.rss
    Response: Connection refused / SSL error / timeout
    Failed ✗

  Test #2: http://legacy.example.com/feed.rss
    Already responseUrl → verified

Result: {
  url: "http://legacy.example.com/feed.rss",
  reason: "response_url"
}
```

### Notes
- HTTPS not available on this legacy server
- Graceful fallback to HTTP
- Only 1 extra failed request

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `http://legacy.example.com/feed.rss` | Uses input |
| Feedbin | `http://legacy.example.com/feed.rss` | Uses input |
| Miniflux | `http://legacy.example.com/feed.rss` | Uses EffectiveURL |
| FreshRSS | `http://legacy.example.com/feed.rss` | Uses input |
| CommaFeed | `http://legacy.example.com/feed.rss` | Falls back to HTTP |
| NetNewsWire | `http://legacy.example.com/feed.rss` | Uses input |
| tt-rss | `http://legacy.example.com/feed.rss` | Uses input |
| Feeder | `http://legacy.example.com/feed.rss` | Uses input |
| Liferea | `http://legacy.example.com/feed.rss` | Uses input |
| Nextcloud | `http://legacy.example.com/feed.rss` | Uses input |
| **feedcanon** | `http://legacy.example.com/feed.rss` | **Graceful HTTP fallback** |

---

## Case 9: WWW vs Non-WWW Mismatch

### Input
```
User enters: https://www.example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://www.example.com/feed
  Response: 200 OK
  Response URL: https://www.example.com/feed
  Content hash: eee555

Step 2: Parse feed, extract self URL
  Self URL: https://example.com/feed (no www)

Step 3: Generate variants
  1. https://example.com/feed (score: 195) - no www
  2. https://www.example.com/feed (score: 145) - with www
  3. http://example.com/feed (score: 95)
  4. http://www.example.com/feed (score: 45)

Step 4: Test variants
  Test #1: https://example.com/feed
    GET https://example.com/feed
    Response: 200 OK
    Content hash: eee555 ✓ (matches)

Result: {
  url: "https://example.com/feed",
  reason: "content_verified"
}
```

### Notes
- Self URL was cleaner (no www)
- Tested non-www variant, confirmed same content
- Canonical uses non-www (cleaner)

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `https://www.example.com/feed` | No www normalization |
| Feedbin | `https://www.example.com/feed` | No www normalization |
| Miniflux | `https://www.example.com/feed` | No www normalization |
| FreshRSS | `https://www.example.com/feed` | No www normalization |
| CommaFeed | Deduplicated via hash | Strips www in normalized hash |
| NetNewsWire | `https://www.example.com/feed` | Exact URL stored |
| tt-rss | `https://www.example.com/feed` | No normalization |
| Feeder | `https://www.example.com/feed` | No normalization |
| Liferea | `https://www.example.com/feed` | No www normalization |
| Nextcloud | `https://www.example.com/feed` | No normalization |
| **feedcanon** | `https://example.com/feed` | **Non-www verified + adopted** |

---

## Case 10: Feed Protocol (feed://)

### Input
```
User enters: feed://example.com/rss.xml
```

### Step-by-Step

```
Step 1: Resolve feed protocol
  feed://example.com/rss.xml → https://example.com/rss.xml

Step 2: Fetch resolved URL
  GET https://example.com/rss.xml
  Response: 200 OK
  Response URL: https://example.com/rss.xml
  Content hash: fff666

Step 3: Parse feed, extract self URL
  Self URL: https://example.com/rss.xml

Step 4: Generate variants
  1. https://example.com/rss.xml (score: 195)
  2. http://example.com/rss.xml (score: 95)

Step 5: Test variants
  Test #1: https://example.com/rss.xml
    Already responseUrl → verified

Result: {
  url: "https://example.com/rss.xml",
  reason: "response_url"
}
```

### Notes
- feed:// converted to https:// before fetching
- Works the same for rss://, pcast://, itpc://

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `feed://example.com/rss.xml` | May store as-is |
| Feedbin | `http://example.com/rss.xml` | Converts feed:// to http:// |
| Miniflux | `http://example.com/rss.xml` | Likely converts |
| FreshRSS | `https://example.com/rss.xml` | checkUrl adds https:// |
| CommaFeed | Likely rejected | No feed:// conversion found |
| NetNewsWire | OS handles conversion | macOS URL scheme |
| tt-rss | `http://example.com/rss.xml` | SimplePie converts |
| Feeder | `http://example.com/rss.xml` | sloppyLinkToStrictURL |
| Liferea | `http://example.com/rss.xml` | Strips feed:// prefix |
| Nextcloud | Rejected | Requires http(s):// |
| **feedcanon** | `https://example.com/rss.xml` | **Converts to HTTPS** |

---

## Case 11: Multiple FeedBurner Aliases

### Input
```
User A enters: https://feeds2.feedburner.com/blog
User B enters: http://feedproxy.google.com/blog?format=rss
User C enters: https://feeds.feedburner.com/blog
```

### All Resolve To

```
Step 1: Platform handler normalizes all to:
  https://feeds.feedburner.com/blog

Step 2-5: Identical for all three inputs

Result: {
  url: "https://feeds.feedburner.com/blog",
  reason: "response_url" (or similar)
}
```

### Notes
- All three users get the same canonical URL
- Database has one channel record
- Three alias records pointing to it
- Feed fetched once, not three times

### How Other Readers Handle This

| Reader | Stored URLs | Reason |
|--------|-----------|--------|
| NewsBlur | 3 separate feeds | No deduplication |
| Feedbin | 3 separate feeds | No deduplication |
| Miniflux | 3 separate feeds per user | Per-user isolation |
| FreshRSS | 3 separate feeds | No deduplication |
| CommaFeed | 1 feed (deduplicated) | FeedBurner handler + hash |
| NetNewsWire | 3 separate feeds | No deduplication |
| tt-rss | 3 separate feeds | No deduplication |
| Feeder | 3 separate feeds | No deduplication |
| Liferea | 3 separate feeds | Single user, no dedup |
| Nextcloud | 3 separate feeds | Per-user, no dedup |
| **feedcanon** | 1 canonical URL | **Platform handler + dedup** |

---

## Case 12: Relative Self URL

### Input
```
User enters: https://example.com/blog/feed.xml
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/blog/feed.xml
  Response: 200 OK
  Response URL: https://example.com/blog/feed.xml
  Content hash: ggg777

Step 2: Parse feed, extract self URL
  Self URL: feed.xml (relative!)

Step 3: Resolve relative self URL
  Base: https://example.com/blog/feed.xml
  Resolved: https://example.com/blog/feed.xml

Step 4: Sources are identical
  - responseUrl: https://example.com/blog/feed.xml
  - selfUrl: https://example.com/blog/feed.xml

Step 5: Generate variants
  1. https://example.com/blog/feed.xml (score: 190)
  2. http://example.com/blog/feed.xml (score: 90)

Step 6: Test
  Test #1: Already responseUrl → verified

Result: {
  url: "https://example.com/blog/feed.xml",
  reason: "response_url"
}
```

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `https://example.com/blog/feed.xml` | Ignores self URL |
| Feedbin | `https://example.com/blog/feed.xml` | Ignores self URL |
| Miniflux | `https://example.com/blog/feed.xml` | Ignores self URL |
| FreshRSS | `https://example.com/blog/feed.xml` | Ignores self URL |
| CommaFeed | `https://example.com/blog/feed.xml` | Self URL for relative resolution only |
| NetNewsWire | `https://example.com/blog/feed.xml` | Ignores self URL |
| tt-rss | `https://example.com/blog/feed.xml` | Ignores self URL |
| Feeder | `https://example.com/blog/feed.xml` | Ignores self URL |
| Liferea | `https://example.com/blog/feed.xml` | Ignores self URL |
| Nextcloud | `https://example.com/blog/feed.xml` | Ignores self URL |
| **feedcanon** | `https://example.com/blog/feed.xml` | **Relative resolved correctly** |

---

## Case 13: Self URL with Different Query Params

### Input
```
User enters: https://example.com/feed?format=rss
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed?format=rss
  Response: 200 OK
  Response URL: https://example.com/feed?format=rss
  Content hash: hhh888

Step 2: Parse feed, extract self URL
  Self URL: https://example.com/feed?format=atom

Step 3: Generate variants
  From responseUrl:
    1. https://example.com/feed (score: 195) - params stripped
    2. https://example.com/feed?format=rss (score: 180)

  From selfUrl:
    3. https://example.com/feed (score: 195) - duplicate
    4. https://example.com/feed?format=atom (score: 180)

Step 4: Test variants
  Test #1: https://example.com/feed
    GET https://example.com/feed
    Response: 200 OK
    Content hash: iii999 ✗ (different! default format differs)

  Test #2: https://example.com/feed?format=rss
    Already responseUrl → verified

Result: {
  url: "https://example.com/feed?format=rss",
  reason: "response_url"
}
```

### Notes
- `format=rss` is a functional parameter, not tracking
- Stripping it changed the content
- Algorithm correctly fell back to URL with required param

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `https://example.com/feed?format=rss` | Preserves all params |
| Feedbin | `https://example.com/feed?format=rss` | Preserves all params |
| Miniflux | `https://example.com/feed?format=rss` | format= not a tracking param |
| FreshRSS | `https://example.com/feed?format=rss` | Preserves all params |
| CommaFeed | `https://example.com/feed?format=rss` | Preserves functional params |
| NetNewsWire | `https://example.com/feed?format=rss` | Preserves all params |
| tt-rss | `https://example.com/feed?format=rss` | Preserves all params |
| Feeder | `https://example.com/feed?format=rss` | Preserves all params |
| Liferea | `https://example.com/feed?format=rss` | Preserves all params |
| Nextcloud | `https://example.com/feed?format=rss` | Preserves all params |
| **feedcanon** | `https://example.com/feed?format=rss` | **Param kept (functional)** |

---

## Case 14: Empty/Missing Self URL

### Input
```
User enters: https://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed
  Response: 200 OK
  Response URL: https://example.com/feed
  Content hash: jjj000

Step 2: Parse feed, extract self URL
  Self URL: (none - feed doesn't declare rel="self")

Step 3: Collect sources
  - responseUrl: https://example.com/feed
  - selfUrl: (none)

Step 4: Generate variants from responseUrl only
  1. https://example.com/feed (score: 195)
  2. http://example.com/feed (score: 95)

Step 5: Test
  Test #1: Already responseUrl → verified

Result: {
  url: "https://example.com/feed",
  reason: "response_url"
}
```

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `https://example.com/feed` | Uses input |
| Feedbin | `https://example.com/feed` | Uses input |
| Miniflux | `https://example.com/feed` | Uses EffectiveURL |
| FreshRSS | `https://example.com/feed` | Uses input |
| CommaFeed | `https://example.com/feed` | Uses input |
| NetNewsWire | `https://example.com/feed` | Uses input |
| tt-rss | `https://example.com/feed` | Uses input |
| Feeder | `https://example.com/feed` | Uses input |
| Liferea | `https://example.com/feed` | Uses input |
| Nextcloud | `https://example.com/feed` | Uses input |
| **feedcanon** | `https://example.com/feed` | **ResponseUrl (no self)** |

---

## Case 15: All Variants Fail Except Original

### Input
```
User enters: https://special.example.com:8443/api/v2/feed.json?auth=token123
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://special.example.com:8443/api/v2/feed.json?auth=token123
  Response: 200 OK
  Response URL: https://special.example.com:8443/api/v2/feed.json?auth=token123
  Content hash: kkk111

Step 2: Parse feed, no self URL

Step 3: Generate variants
  1. https://special.example.com/api/v2/feed.json (score: 195) - port stripped, auth stripped
  2. https://special.example.com:8443/api/v2/feed.json (score: 185) - auth stripped
  3. http://special.example.com/api/v2/feed.json (score: 95)
  ... more variants

Step 4: Test variants
  Test #1: https://special.example.com/api/v2/feed.json
    GET → 404 Not Found (wrong port)
    Failed ✗

  Test #2: https://special.example.com:8443/api/v2/feed.json
    GET → 401 Unauthorized (needs auth param)
    Failed ✗

  Test #3: ... more failures

  Eventually: https://special.example.com:8443/api/v2/feed.json?auth=token123
    Already responseUrl → verified

Result: {
  url: "https://special.example.com:8443/api/v2/feed.json?auth=token123",
  reason: "response_url"
}
```

### Notes
- Non-standard port is required
- Query param is functional (auth token)
- Algorithm tried cleaner variants but fell back to original
- This is the correct behavior for complex/authenticated feeds

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | Full URL with port+auth | Preserves all |
| Feedbin | Full URL with port+auth | Preserves (auth stripped) |
| Miniflux | Full URL with port+auth | Preserves all |
| FreshRSS | Full URL with port+auth | Auth stripped by SimplePie |
| CommaFeed | Full URL with port+auth | Preserves all |
| NetNewsWire | Full URL with port+auth | Preserves all |
| tt-rss | Full URL with port+auth | Preserves all |
| Feeder | Full URL with port+auth | Preserves all |
| Liferea | Full URL with port+auth | Preserves all |
| Nextcloud | Full URL with port+auth | Preserves all |
| **feedcanon** | Full URL with port+auth | **Falls back to original** |

---

## Case 16: Redirect Loop Prevention

### Input
```
User enters: https://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed
  Response: 301 → https://example.com/rss
  Response: 301 → https://example.com/feed (loop!)

  Fetch library should detect loop and return error/last response

Step 2: Handle based on fetch result
  If error: Return input URL as fallback
  If last successful: Use that response URL

Result: {
  url: "https://example.com/feed",
  reason: "fetch_failed" or "fallback"
}
```

### Notes
- Redirect loops are handled by fetch implementation
- Not our responsibility to detect, but we handle gracefully

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | Input URL | Fetch fails, URL unchanged |
| Feedbin | Input URL | Max 4 hops, fails |
| Miniflux | Input URL | Fetch library handles |
| FreshRSS | Input URL | SimplePie fails |
| CommaFeed | Input URL | HttpClient times out |
| NetNewsWire | Input URL | Fetch fails |
| tt-rss | Input URL | SimplePie fails |
| Feeder | Input URL | OkHttp handles |
| Liferea | Input URL | 5 attempts max |
| Nextcloud | Input URL | Guzzle 5 redirects max |
| **feedcanon** | Input URL | **Graceful fallback** |

---

## Case 17: Content Hash Mismatch (CDN Variation)

### Input
```
User enters: https://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed
  Response: 200 OK
  Response URL: https://example.com/feed
  Content hash: lll222 (includes timestamp: "Generated: 2024-01-15 10:30:00")

Step 2: Parse feed, extract self URL
  Self URL: https://example.com/feed

Step 3: Generate variants
  1. https://example.com/feed (score: 195)
  2. http://example.com/feed (score: 95)

Step 4: Test variants
  Test #1: https://example.com/feed
    Already responseUrl, but let's say we re-fetch for some reason
    GET https://example.com/feed
    Content hash: mmm333 (timestamp changed: "Generated: 2024-01-15 10:30:05")
    Hash mismatch! ✗

Step 5: Fall back to feed signature comparison
  Parse both responses
  Compare: title, item GUIDs, item links
  Signatures match ✓

Result: {
  url: "https://example.com/feed",
  reason: "feed_data_hash"
}
```

### Notes
- Raw byte hash failed due to timestamp/dynamic content
- Feed signature (parsed data) correctly identified same feed
- This is why we have feedDataHash as a fallback

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | Input URL | No content-based dedup |
| Feedbin | Input URL | Uses fingerprinting |
| Miniflux | Input URL | No content-based dedup |
| FreshRSS | Input URL | Hash on URL, not content |
| CommaFeed | Input URL | Hash based on URL |
| NetNewsWire | Input URL | No content verification |
| tt-rss | Input URL | No content-based dedup |
| Feeder | Input URL | No content-based dedup |
| Liferea | Input URL | Uses ETag/Last-Modified |
| Nextcloud | Input URL | Hash on exact URL string |
| **feedcanon** | Input URL | **Feed signature fallback** |

---

## Case 18: Multiple Self URLs in Feed

### Input
```
User enters: https://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed
  Response: 200 OK
  Response URL: https://example.com/feed
  Content hash: nnn444

Step 2: Parse feed, extract self URLs
  Found multiple <link rel="self">:
    - https://example.com/feed
    - https://example.com/rss.xml
    - https://www.example.com/feed

Step 3: Self URL selection strategy
  Option A: Use first declared
  Option B: Use one matching responseUrl
  Option C: Use cleanest one

  Recommended: Option B (match responseUrl), fallback to Option A

  Selected: https://example.com/feed (matches responseUrl)

Step 4: Collect sources
  - responseUrl: https://example.com/feed
  - selfUrl: https://example.com/feed (same)

Step 5: Generate variants
  1. https://example.com/feed (score: 195)
  2. http://example.com/feed (score: 95)

Step 6: Test
  Test #1: Already responseUrl → verified

Result: {
  url: "https://example.com/feed",
  reason: "response_url"
}
```

### Notes
- Multiple self URLs happen with misconfigured feeds or aggregated content
- Prefer self URL matching responseUrl for consistency
- If none match, use first declared (publisher's primary intent)
- Other self URLs are discarded, not added as variant sources

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | Input URL | Ignores all self URLs |
| Feedbin | Input URL | Uses first self for WebSub |
| Miniflux | Input URL | Ignores all self URLs |
| FreshRSS | Input URL | Uses first self if WebSub |
| CommaFeed | Input URL | Ignores all self URLs |
| NetNewsWire | Input URL | Ignores all self URLs |
| tt-rss | Input URL | Ignores all self URLs |
| Feeder | Input URL | Ignores all self URLs |
| Liferea | Input URL | Uses first for metadata |
| Nextcloud | Input URL | Ignores all self URLs |
| **feedcanon** | Input URL | **Prefers matching responseUrl** |

---

## Case 19: Self URL Returns HTML (Not Feed)

### Input
```
User enters: https://example.com/feed.xml
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed.xml
  Response: 200 OK
  Response URL: https://example.com/feed.xml
  Content-Type: application/rss+xml
  Content hash: ooo555

Step 2: Parse feed, extract self URL
  Self URL: https://example.com/blog
  (Publisher error: points to blog homepage instead of feed)

Step 3: Collect sources
  - responseUrl: https://example.com/feed.xml
  - selfUrl: https://example.com/blog

Step 4: Generate variants
  From responseUrl:
    1. https://example.com/feed.xml (score: 190)
    2. http://example.com/feed.xml (score: 90)

  From selfUrl:
    3. https://example.com/blog (score: 195)
    4. http://example.com/blog (score: 95)

Step 5: Test variants
  Test #1: https://example.com/feed.xml
    Already responseUrl → verified

Result: {
  url: "https://example.com/feed.xml",
  reason: "response_url"
}
```

### Alternative Flow (if selfUrl variant tested first)

```
Step 5: Test variants (if sorted differently)
  Test #1: https://example.com/blog
    GET https://example.com/blog
    Response: 200 OK
    Content-Type: text/html ← NOT a feed!
    Failed ✗ (not parseable as feed)

  Test #2: https://example.com/feed.xml
    Already responseUrl → verified

Result: {
  url: "https://example.com/feed.xml",
  reason: "response_url"
}
```

### Notes
- Self URL pointing to HTML page is a common misconfiguration
- Detection: Check Content-Type or attempt feed parsing
- HTML responses should fail variant testing immediately
- ResponseUrl is safe fallback (we know it's a valid feed)

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | Input URL | Ignores self URLs entirely |
| Feedbin | Input URL | Self only for WebSub |
| Miniflux | Input URL | Ignores self URLs |
| FreshRSS | Input URL | Self only for WebSub |
| CommaFeed | Input URL | Self for relative resolution only |
| NetNewsWire | Input URL | Ignores self URLs |
| tt-rss | Input URL | Ignores self URLs |
| Feeder | Input URL | Ignores self URLs |
| Liferea | Input URL | Metadata only, not followed |
| Nextcloud | Input URL | Ignores self URLs |
| **feedcanon** | Input URL | **Detects HTML, skips variant** |

---

## Case 20: Self URL Triggers Redirect Chain

### Input
```
User enters: https://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed
  Response: 200 OK
  Response URL: https://example.com/feed
  Content hash: ppp666

Step 2: Parse feed, extract self URL
  Self URL: https://old.example.com/rss
  (Outdated self URL that now redirects)

Step 3: Collect sources
  - responseUrl: https://example.com/feed
  - selfUrl: https://old.example.com/rss

Step 4: Generate variants
  1. https://example.com/feed (score: 195)
  2. https://old.example.com/rss (score: 190)
  3. http://example.com/feed (score: 95)
  4. http://old.example.com/rss (score: 90)

Step 5: Test variants
  Test #1: https://example.com/feed
    Already responseUrl → verified

Result: {
  url: "https://example.com/feed",
  reason: "response_url"
}
```

### Alternative Flow (if selfUrl variant tested)

```
Step 5: Test variants (hypothetical ordering)
  Test #1: https://old.example.com/rss
    GET https://old.example.com/rss
    Response: 301 → https://example.com/feed
    Response: 200 OK
    Final URL: https://example.com/feed
    Content hash: ppp666 ✓ (matches)

    Decision: Use original variant URL or follow redirect?

    Option A: Use https://old.example.com/rss (what we tested)
    Option B: Use https://example.com/feed (where it landed)

    Recommended: Option B (final destination is cleaner)

Result: {
  url: "https://example.com/feed",
  reason: "content_verified"
}
```

### Notes
- Self URL may be stale and redirect to current location
- When testing a variant that redirects, prefer final destination
- This naturally deduplicates old→new URL migrations
- The redirect destination should also be added to variant pool

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | Input URL | Ignores self, no redirect follow |
| Feedbin | Input URL | Self for WebSub only |
| Miniflux | Input URL | Ignores self URLs |
| FreshRSS | Input URL | Self for WebSub only |
| CommaFeed | Input URL | urlAfterRedirect separate field |
| NetNewsWire | Input URL | No redirect following |
| tt-rss | Input URL | SimplePie doesn't persist |
| Feeder | Input URL | No redirect following |
| Liferea | Input URL | Would update source field |
| Nextcloud | Input URL | Tracks in location field |
| **feedcanon** | Final destination | **Follows redirect, uses final** |

---

## Case 21: Platform Handler Canonical Is Dead

### Input
```
User enters: http://feedproxy.google.com/MyBlog
```

### Step-by-Step

```
Step 1: Apply platform handler to input
  feedproxy.google.com → feeds.feedburner.com
  Result: https://feeds.feedburner.com/MyBlog

Step 2: Fetch transformed URL
  GET https://feeds.feedburner.com/MyBlog
  Response: 404 Not Found / Connection refused / Timeout
  Failed ✗

Step 3: Fallback to original input
  GET http://feedproxy.google.com/MyBlog
  Response: 200 OK
  Response URL: http://feedproxy.google.com/MyBlog
  Content hash: qqq777

Step 4: Parse feed, extract self URL
  Self URL: http://feeds.feedburner.com/MyBlog (also dead)

Step 5: Collect sources
  - responseUrl: http://feedproxy.google.com/MyBlog
  - selfUrl: http://feeds.feedburner.com/MyBlog (known dead)

Step 6: Generate variants
  Skip variants from dead domain (feeds.feedburner.com)
  From responseUrl:
    1. https://feedproxy.google.com/MyBlog (score: 170)
    2. http://feedproxy.google.com/MyBlog (score: 70)

Step 7: Test variants
  Test #1: https://feedproxy.google.com/MyBlog
    GET https://feedproxy.google.com/MyBlog
    Response: 200 OK
    Content hash: qqq777 ✓

Result: {
  url: "https://feedproxy.google.com/MyBlog",
  reason: "content_verified"
}
```

### Notes
- Platform handlers assume canonical outlives aliases (usually true)
- When canonical fails, fall back to original input URL
- Mark failed domains to skip their variants
- This is rare but possible (service shutdowns, regional blocks)
- Consider caching domain health to avoid repeated failures

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | Original input | No platform handlers |
| Feedbin | Original input | No platform handlers |
| Miniflux | Original input | No platform handlers |
| FreshRSS | Original input | No platform handlers |
| CommaFeed | Original input | FeedBurner handler exists |
| NetNewsWire | Original input | No platform handlers |
| tt-rss | Original input | No platform handlers |
| Feeder | Original input | No platform handlers |
| Liferea | Original input | No platform handlers |
| Nextcloud | Original input | No platform handlers |
| **feedcanon** | Original (fallback) | **Handler fails → fallback** |

---

## Case 22: Case Sensitivity Mismatch

### Input
```
User enters: https://example.com/Blog/Feed.XML
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/Blog/Feed.XML
  Response: 200 OK
  Response URL: https://example.com/Blog/Feed.XML
  Content hash: rrr888

Step 2: Parse feed, extract self URL
  Self URL: https://example.com/blog/feed.xml (lowercase)

Step 3: Collect sources
  - responseUrl: https://example.com/Blog/Feed.XML
  - selfUrl: https://example.com/blog/feed.xml

Step 4: Generate variants
  From responseUrl (preserve case):
    1. https://example.com/Blog/Feed.XML (score: 190)
    2. http://example.com/Blog/Feed.XML (score: 90)

  From selfUrl (lowercase):
    3. https://example.com/blog/feed.xml (score: 190)
    4. http://example.com/blog/feed.xml (score: 90)

  Note: Same score, but lowercase is "cleaner" (add small bonus?)

Step 5: Test variants
  Test #1: https://example.com/Blog/Feed.XML
    Already responseUrl → verified

  But wait - should we prefer lowercase?

  Test #2: https://example.com/blog/feed.xml
    GET https://example.com/blog/feed.xml
    Response: 200 OK
    Content hash: rrr888 ✓ (matches)

Result: {
  url: "https://example.com/blog/feed.xml",
  reason: "content_verified"
}
```

### Notes
- URL paths are case-sensitive per RFC, but many servers are case-insensitive
- Lowercase is conventionally "cleaner" - add small score bonus (+5)
- Always verify lowercase variant works before adopting
- Some servers return different content for different cases (rare but possible)
- Domain part should always be lowercased (case-insensitive per spec)

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | Exact input case | No case normalization |
| Feedbin | Exact input case | No case normalization |
| Miniflux | Exact input case | No case normalization |
| FreshRSS | Exact input case | No case normalization |
| CommaFeed | Domain lowercased | Path case preserved |
| NetNewsWire | Exact input case | No case normalization |
| tt-rss | Exact input case | No case normalization |
| Feeder | Exact input case | No case normalization |
| Liferea | Exact input case | No case normalization |
| Nextcloud | Exact input case | No case normalization |
| **feedcanon** | Lowercase if works | **Prefers clean lowercase** |

---

## Case 23: Scheme-Relative Input

### Input
```
User enters: //example.com/feed
```

### Step-by-Step

```
Step 1: Resolve scheme-relative URL
  //example.com/feed → https://example.com/feed
  (Default to HTTPS for security)

Step 2: Fetch resolved URL
  GET https://example.com/feed
  Response: 200 OK
  Response URL: https://example.com/feed
  Content hash: sss999

Step 3: Parse feed, extract self URL
  Self URL: https://example.com/feed

Step 4: Generate variants
  1. https://example.com/feed (score: 195)
  2. http://example.com/feed (score: 95)

Step 5: Test
  Test #1: Already responseUrl → verified

Result: {
  url: "https://example.com/feed",
  reason: "response_url"
}
```

### Notes
- Scheme-relative URLs (`//host/path`) lack protocol
- Default to HTTPS when resolving
- If HTTPS fails, fall back to HTTP
- Common in HTML but rare for direct feed URLs
- Treat as input normalization, not variant generation

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | Likely fails | Expects full URL |
| Feedbin | Likely fails | Expects full URL |
| Miniflux | `https://` added | URL normalization |
| FreshRSS | SimplePie handles | Defaults to HTTP |
| CommaFeed | Likely fails | Expects full URL |
| NetNewsWire | Likely fails | Expects full URL |
| tt-rss | SimplePie handles | Defaults to HTTP |
| Feeder | Likely fails | Expects full URL |
| Liferea | Likely fails | Expects full URL |
| Nextcloud | Likely fails | Expects full URL |
| **feedcanon** | `https://example.com/feed` | **Defaults to HTTPS** |

---

## Case 24: Standard Port in URL

### Input
```
User enters: https://example.com:443/feed
```

### Step-by-Step

```
Step 1: Normalize input URL
  https://example.com:443/feed → https://example.com/feed
  (Strip default port: 443 for HTTPS, 80 for HTTP)

Step 2: Fetch normalized URL
  GET https://example.com/feed
  Response: 200 OK
  Response URL: https://example.com/feed
  Content hash: ttt000

Step 3: Parse feed, extract self URL
  Self URL: https://example.com/feed

Step 4: Generate variants
  1. https://example.com/feed (score: 195)
  2. http://example.com/feed (score: 95)

Step 5: Test
  Test #1: Already responseUrl → verified

Result: {
  url: "https://example.com/feed",
  reason: "response_url"
}
```

### Notes
- Default ports should be stripped during URL normalization
- HTTPS default: 443, HTTP default: 80
- Non-standard ports must be preserved (see Case 15)
- This is input normalization, applied before variant generation
- URLs with and without default port are semantically identical

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | Port stripped | urlnorm.normalize() |
| Feedbin | Port preserved | Minimal normalization |
| Miniflux | Port stripped | URL normalization |
| FreshRSS | Port preserved | Minimal normalization |
| CommaFeed | Port stripped | URL normalization |
| NetNewsWire | Port preserved | No normalization |
| tt-rss | Port preserved | Minimal normalization |
| Feeder | Port preserved | No normalization |
| Liferea | Port preserved | No normalization |
| Nextcloud | Port preserved | No normalization |
| **feedcanon** | Port stripped | **Default ports removed** |

---

## Case 25: Input URL Has Credentials

### Input
```
User enters: https://user:password123@example.com/private/feed
```

### Step-by-Step

```
Step 1: Security check
  URL contains embedded credentials
  Decision: Strip for canonical, but use for fetching

Step 2: Fetch with credentials
  GET https://example.com/private/feed
  Authorization: Basic dXNlcjpwYXNzd29yZDEyMw==
  Response: 200 OK
  Response URL: https://example.com/private/feed (credentials stripped)
  Content hash: uuu111

Step 3: Parse feed, extract self URL
  Self URL: https://example.com/private/feed

Step 4: Collect sources
  - responseUrl: https://example.com/private/feed
  - selfUrl: https://example.com/private/feed

Step 5: Generate variants (credentials stripped from all)
  1. https://example.com/private/feed (score: 195)
  2. http://example.com/private/feed (score: 95)

Step 6: Test variants
  Test #1: https://example.com/private/feed
    GET https://example.com/private/feed (no auth)
    Response: 401 Unauthorized
    Failed ✗

  Fallback: Original URL (with credentials) works
  Store credentials separately, not in canonical URL

Result: {
  url: "https://example.com/private/feed",
  reason: "response_url",
  requiresAuth: true
}
```

### Notes
- NEVER store credentials in canonical URL (security risk)
- Credentials should be stored separately and attached at fetch time
- Canonical URL is the "shape" of the URL, auth is metadata
- Self URLs should never contain credentials (strip if present)
- Return flag indicating auth is required for this feed

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | Credentials stripped | Stored separately |
| Feedbin | Credentials stripped | Stored in auth fields |
| Miniflux | Credentials stripped | username/password columns |
| FreshRSS | Credentials stripped | SimplePie extracts |
| CommaFeed | Credentials stripped | Separate storage |
| NetNewsWire | Credentials stripped | Keychain storage |
| tt-rss | Credentials stripped | auth_login/auth_pass |
| Feeder | Credentials stripped | Separate storage |
| Liferea | Credentials stripped | auth_id reference |
| Nextcloud | Credentials stripped | user/password fields |
| **feedcanon** | Credentials stripped | **requiresAuth flag** |

---

## Case 26: Response Redirects to FeedBurner

### Input
```
User enters: https://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed
  Response: 301 → https://feedproxy.google.com/ExampleBlog
  Response: 200 OK
  Response URL: https://feedproxy.google.com/ExampleBlog
  Content hash: aaa111

Step 2: Apply platform handler to response URL
  feedproxy.google.com → feeds.feedburner.com
  Result: https://feeds.feedburner.com/ExampleBlog

Step 3: Generate variants from normalized response URL
  1. https://feeds.feedburner.com/ExampleBlog (score: 195)

Step 4: Test variants
  Test #1: https://feeds.feedburner.com/ExampleBlog
    GET https://feeds.feedburner.com/ExampleBlog
    Response: 200 OK
    Content hash: aaa111 ✓ (matches)

Result: {
  url: "https://feeds.feedburner.com/ExampleBlog",
  reason: "content_verified"
}
```

### Notes
- Platform handler applied to response URL after redirects
- Original site redirected to FeedBurner, we normalize to canonical domain
- Both input URL and FeedBurner URL become aliases

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | Error (blocked) | Explicitly blocks `feedburner.com/atom.xml` redirects |
| Miniflux | `https://feedproxy.google.com/ExampleBlog` | Uses EffectiveURL, no platform normalization |
| FreshRSS | `https://feedproxy.google.com/ExampleBlog` | Uses subscribe_url after redirect |
| tt-rss | `https://example.com/feed` | Uses original URL, not redirect destination |
| **feedcanon** | `https://feeds.feedburner.com/ExampleBlog` | **Platform handler on redirect** |

---

## Case 27: Self URL Is FeedBurner Alias

### Input
```
User enters: https://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed
  Response: 200 OK
  Response URL: https://example.com/feed
  Content hash: bbb222

Step 2: Parse feed, extract self URL
  Self URL: https://feedproxy.google.com/ExampleBlog

Step 3: Apply platform handler to self URL
  feedproxy.google.com → feeds.feedburner.com
  Result: https://feeds.feedburner.com/ExampleBlog

Step 4: Validate self URL
  GET https://feeds.feedburner.com/ExampleBlog
  Response: 200 OK
  Content hash: bbb222 ✓ (matches)

Step 5: Use self URL destination as variant source
  variantSource: https://feeds.feedburner.com/ExampleBlog

Result: {
  url: "https://feeds.feedburner.com/ExampleBlog",
  reason: "content_verified"
}
```

### Notes
- Feed hosted on example.com but self URL points to FeedBurner
- Platform handler normalizes FeedBurner alias in self URL
- Validates that FeedBurner URL returns same content

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `https://example.com/feed` | Self URL only for PubSubHubbub topic, no normalization |
| Miniflux | `https://feedproxy.google.com/ExampleBlog` | Extracts self URL, no FeedBurner normalization |
| FreshRSS | `https://feedproxy.google.com/ExampleBlog` | Trusts self-link unconditionally |
| tt-rss | `https://example.com/feed` | Self URL completely ignored |
| **feedcanon** | `https://feeds.feedburner.com/ExampleBlog` | **Self URL normalized + validated** |

---

## Case 28: HTTPS Returns Different Content

### Input
```
User enters: http://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET http://example.com/feed
  Response: 200 OK
  Response URL: http://example.com/feed
  Content hash: ccc333

Step 2: Generate variants
  1. https://example.com/feed (score: 195)
  2. http://example.com/feed (score: 95)

Step 3: Test variants
  Test #1: https://example.com/feed
    GET https://example.com/feed
    Response: 200 OK
    Content hash: ddd444 ✗ (different content!)

  Test #2: http://example.com/feed
    Already responseUrl → verified

Step 4: HTTPS upgrade attempt
  Content hash mismatch, HTTPS not used

Result: {
  url: "http://example.com/feed",
  reason: "response_url"
}
```

### Notes
- Some servers serve different feeds over HTTP vs HTTPS
- HTTPS returned different content (not a failure, just different)
- Algorithm correctly falls back to HTTP
- Different from Case 8 where HTTPS fails entirely (network error)

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `http://example.com/feed` | No HTTPS upgrade attempted, no SNI initially (issue #534) |
| Miniflux | `http://example.com/feed` | Uses EffectiveURL, no protocol comparison |
| FreshRSS | `http://example.com/feed` | No content comparison between protocols |
| tt-rss | `http://example.com/feed` | No protocol fallback or comparison |
| **feedcanon** | `http://example.com/feed` | **Content mismatch detected** |

---

## Case 29: Self URL Fails Verification

### Input
```
User enters: https://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed
  Response: 200 OK
  Response URL: https://example.com/feed
  Content hash: eee555

Step 2: Parse feed, extract self URL
  Self URL: https://blocked.example.com/feed

Step 3: Verify self URL
  verifyFn(https://blocked.example.com/feed) → false
  Self URL rejected by verification

Step 4: Use responseUrl as variant source
  variantSource: https://example.com/feed

Result: {
  url: "https://example.com/feed",
  reason: "response_url"
}
```

### Notes
- verifyFn allows blocklisting domains or URL patterns
- Blocked self URL is ignored, not fetched
- Useful for blocking known-bad domains or internal URLs
- Security feature for enterprise deployments

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `https://example.com/feed` | Self URL only for PubSubHubbub, no blocklisting |
| Miniflux | `https://example.com/feed` | Only validates URL is absolute, no blocklist |
| FreshRSS | `https://example.com/feed` | Trusts self-links unconditionally, no verification |
| tt-rss | `https://example.com/feed` | Self URL completely ignored, no blocklist |
| **feedcanon** | `https://example.com/feed` | **verifyFn blocks self URL** |

---

## Case 30: Variant Matches Response URL

### Input
```
User enters: https://www.example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://www.example.com/feed
  Response: 200 OK
  Response URL: https://www.example.com/feed
  Content hash: fff666

Step 2: Parse feed, extract self URL
  Self URL: https://other.example.com/feed (different domain)

Step 3: Validate self URL
  GET https://other.example.com/feed
  Response: 200 OK
  Content hash: fff666 ✓ (matches)
  variantSource: https://other.example.com/feed

Step 4: Generate variants from variantSource
  1. https://other.example.com/feed (score: 195)
  2. https://www.example.com/feed (score: 145) ← matches responseUrl!

Step 5: Test variants
  Test #1: https://other.example.com/feed
    Same as variantSource, skip

  Test #2: https://www.example.com/feed
    Matches responseUrl → use immediately, no fetch needed

Result: {
  url: "https://www.example.com/feed",
  reason: "response_url"
}
```

### Notes
- Optimization: if variant equals responseUrl, use it without fetching
- ResponseUrl is already known to work from initial fetch
- Saves unnecessary network request

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `https://www.example.com/feed` | Uses input URL, no variant testing |
| Miniflux | `https://www.example.com/feed` | Uses EffectiveURL from response |
| FreshRSS | `https://www.example.com/feed` | Uses input URL |
| tt-rss | `https://www.example.com/feed` | Uses input URL, no variant exploration |
| **feedcanon** | `https://www.example.com/feed` | **ResponseUrl optimization** |

---

## Case 31: Parser Returns Undefined

### Input
```
User enters: https://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed
  Response: 200 OK
  Response URL: https://example.com/feed
  Content: <invalid>not a proper feed</invalid>
  Content hash: ggg777

Step 2: Parse feed
  parser.parse() → undefined (content not parseable)
  No self URL extracted

Step 3: Use responseUrl as variant source
  variantSource: https://example.com/feed

Step 4: Generate variants
  1. https://example.com/feed (score: 195)

Result: {
  url: "https://example.com/feed",
  reason: "response_url"
}
```

### Notes
- Graceful handling when parser fails to parse content
- No self URL means only responseUrl is used for variants
- Feed may still be valid XML but not recognized format
- Algorithm continues without self URL information

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | Error | SAXException handling, looks for new feed link |
| Miniflux | Error | `locale.NewLocalizedErrorWrapper(parseErr)`, terminates |
| FreshRSS | Error | SimplePie `init()` returns false, "feed has encountered a problem" |
| tt-rss | Error | libxml fatal errors captured, `Errors::format_libxml_error()` |
| **feedcanon** | `https://example.com/feed` | **Graceful degradation** |

---

## Case 32: Self URL with Fragment

### Input
```
User enters: https://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed
  Response: 200 OK
  Response URL: https://example.com/feed
  Content hash: hhh888

Step 2: Parse feed, extract self URL
  Self URL: https://example.com/feed#section

Step 3: Resolve self URL
  Fragment stripped during URL resolution
  Resolved: https://example.com/feed

Step 4: Self URL matches responseUrl
  variantSource: https://example.com/feed

Result: {
  url: "https://example.com/feed",
  reason: "response_url"
}
```

### Notes
- Fragments (#section) are not sent to servers
- Stripped during URL resolution before comparison
- Self URL with fragment is treated as same URL without fragment
- RFC 3986: fragment is client-side only

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `https://example.com/feed` | Self URL ignored, removes `_` cache-buster param |
| Miniflux | `https://example.com/feed` | Fragments preserved in URLs, no stripping |
| FreshRSS | `https://example.com/feed#section` | Fragments preserved, known issue #5329 |
| tt-rss | `https://example.com/feed` | Self URL ignored, `UrlHelper::validate()` preserves fragments |
| **feedcanon** | `https://example.com/feed` | **Fragment stripped** |

---

## Case 33: Self URL Protocol Differs

### Input
```
User enters: https://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed
  Response: 200 OK
  Response URL: https://example.com/feed
  Content hash: iii999

Step 2: Parse feed, extract self URL
  Self URL: http://example.com/feed (HTTP, not HTTPS)

Step 3: Validate self URL
  GET http://example.com/feed
  Response: 200 OK
  Content hash: iii999 ✓ (matches)
  variantSource: http://example.com/feed

Step 4: Generate variants
  1. https://example.com/feed (score: 195) ← matches responseUrl
  2. http://example.com/feed (score: 95)

Step 5: Test variants
  Test #1: https://example.com/feed
    Matches responseUrl → verified

Result: {
  url: "https://example.com/feed",
  reason: "response_url"
}
```

### Notes
- Self URL declared HTTP but input was HTTPS
- Both protocols return same content
- HTTPS preferred as more secure
- Common when feeds haven't updated self URL after HTTPS migration

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `https://example.com/feed` | Uses input URL, no protocol normalization |
| Miniflux | `https://example.com/feed` | Uses EffectiveURL, treats HTTP/HTTPS as separate feeds |
| FreshRSS | `http://example.com/feed` | May downgrade to HTTP if self URL declares HTTP (issue #1662) |
| tt-rss | `https://example.com/feed` | Uses input URL, no protocol comparison |
| **feedcanon** | `https://example.com/feed` | **HTTPS preferred** |

---

## Case 34: All Variants Fail

### Input
```
User enters: https://www.example.com/feed/
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://www.example.com/feed/
  Response: 200 OK
  Response URL: https://www.example.com/feed/
  Content hash: jjj000

Step 2: Generate variants
  1. https://example.com/feed (score: 195) - no www, no slash
  2. https://www.example.com/feed (score: 145) - no slash
  3. https://www.example.com/feed/ (score: 95) - original

Step 3: Test variants
  Test #1: https://example.com/feed
    GET https://example.com/feed
    Response: 404 Not Found ✗

  Test #2: https://www.example.com/feed
    GET https://www.example.com/feed
    Response: 404 Not Found ✗

  Test #3: https://www.example.com/feed/
    Same as variantSource → already verified

Result: {
  url: "https://www.example.com/feed/",
  reason: "response_url"
}
```

### Notes
- Some servers require exact URL (www, trailing slash)
- Cleaner variants may not work
- Algorithm falls back to original working URL
- Ensures we always return a valid URL

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `https://www.example.com/feed/` | Uses input URL, no variant exploration |
| Miniflux | `https://www.example.com/feed/` | Single-URL strategy, no variants attempted |
| FreshRSS | `https://www.example.com/feed/` | No variant generation logic |
| tt-rss | Error (code 2-5) | Returns subscription error, no URL variants attempted |
| **feedcanon** | `https://www.example.com/feed/` | **Graceful fallback** |

---

## Case 35: Variant Redirects

### Input
```
User enters: https://www.example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://www.example.com/feed
  Response: 200 OK
  Response URL: https://www.example.com/feed
  Content hash: kkk111

Step 2: Generate variants
  1. https://example.com/feed (score: 195)
  2. https://www.example.com/feed (score: 145)

Step 3: Test variants
  Test #1: https://example.com/feed
    GET https://example.com/feed
    Response: 301 → https://canonical.example.com/feed
    Response: 200 OK
    Final URL: https://canonical.example.com/feed
    Content hash: kkk111 ✓ (matches)

Result: {
  url: "https://example.com/feed",
  reason: "content_verified"
}
```

### Notes
- Variant URL redirected but we use the variant URL, not destination
- Provides stable canonical URL (variant is shorter/cleaner)
- Redirect destination could change, variant URL is stable
- Different from self URL redirect handling (Case 20)

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `https://www.example.com/feed` | Uses input URL, updates after 10+ redirects (301/302 only) |
| Miniflux | `https://canonical.example.com/feed` | Uses redirect destination (EffectiveURL) |
| FreshRSS | `https://canonical.example.com/feed` | Uses `subscribe_url(true)` for 301 destinations |
| tt-rss | `https://www.example.com/feed` | Logs redirect but stores original URL |
| **feedcanon** | `https://example.com/feed` | **Uses tested variant URL** |

---

## Case 36: Self URL Redirects to FeedBurner

### Input
```
User enters: https://example.com/feed
```

### Step-by-Step

```
Step 1: Fetch input URL
  GET https://example.com/feed
  Response: 200 OK
  Response URL: https://example.com/feed
  Content hash: lll222

Step 2: Parse feed, extract self URL
  Self URL: https://old.example.com/rss

Step 3: Validate self URL
  GET https://old.example.com/rss
  Response: 301 → https://feedproxy.google.com/ExampleBlog
  Response: 200 OK
  Final URL: https://feedproxy.google.com/ExampleBlog
  Content hash: lll222 ✓ (matches)

Step 4: Apply platform handler to redirect destination
  feedproxy.google.com → feeds.feedburner.com
  variantSource: https://feeds.feedburner.com/ExampleBlog

Step 5: Generate variants
  1. https://feeds.feedburner.com/ExampleBlog (score: 195)

Step 6: Test variants
  Test #1: https://feeds.feedburner.com/ExampleBlog
    GET https://feeds.feedburner.com/ExampleBlog
    Content hash: lll222 ✓ (matches)

Result: {
  url: "https://feeds.feedburner.com/ExampleBlog",
  reason: "content_verified"
}
```

### Notes
- Self URL was outdated, redirected to FeedBurner
- Platform handler applied to redirect destination
- Discovers canonical FeedBurner URL through self URL chain
- Combines redirect following with platform normalization

### How Other Readers Handle This

| Reader | Stored URL | Reason |
|--------|-----------|--------|
| NewsBlur | `https://example.com/feed` | Self URL only for PubSubHubbub, not followed |
| Miniflux | `https://example.com/feed` | Self URL extracted but not fetched/followed |
| FreshRSS | `https://example.com/feed` | Self URL used as-is without HTTP request |
| tt-rss | `https://example.com/feed` | Self URL completely ignored |
| **feedcanon** | `https://feeds.feedburner.com/ExampleBlog` | **Self URL redirect + platform handler** |

---

## Case 37: Platform Handler Throws Exception

### Input
```
User enters: https://example.com/feed
Platform handler: Throws exception during match()
```

### Expected Behavior
```
Result: https://example.com/feed
```

### Why This Works
- Platform handler error is caught and handled gracefully
- Algorithm continues with original URL when handler fails
- Prevents broken handlers from crashing the canonicalization

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| NewsBlur | Strong exception handling - catches URLError, socket.timeout, InvalidURL |
| Miniflux | No panic recovery in content rewrite handlers - can crash on malformed HTML |
| tt-rss | Catches exceptions gracefully with retry logic for specific errors |

---

## Case 38: Multiple Platform Handlers Match

### Input
```
User enters: https://multi.example.com/feed
Handler 1: Matches, normalizes to first.example.com
Handler 2: Matches, normalizes to second.example.com
```

### Expected Behavior
```
Result: https://first.example.com/feed
```

### Why This Works
- Handlers are tested in order, first match wins
- Only one handler is applied per URL
- Allows priority ordering of platform handlers

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| NewsBlur | Single qurl library used consistently, no competing handlers |
| Miniflux | 12+ predefined rewrite rules executed sequentially in order |
| tt-rss | Plugin-based architecture with user-ordered sequential filters |

---

## Case 39: IDN/Punycode Mismatch

### Input
```
User enters: https://xn--mnchen-3ya.example.com/feed
Self URL: https://xn--mnchen-3ya.example.com/feed
```

### Expected Behavior
```
Result: https://xn--mnchen-3ya.example.com/feed
```

### Why This Works
- Unicode and Punycode hostnames are normalized during processing
- Default tiers include convertToPunycode: true
- IDN domains are converted to ASCII for consistent comparison

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| NewsBlur | No explicit IDN/Punycode normalization found |
| Miniflux | Relies on Go's net/url - no explicit Punycode conversion |
| tt-rss | Strong support with idn_to_ascii() and UTS46 variant |

---

## Case 40: Port Number Mismatch

### Input
```
User enters: https://example.com/feed
Self URL: https://example.com:8443/feed
Both return same content
```

### Expected Behavior
```
Result: https://example.com:8443/feed
```

### Why This Works
- Self URL validates (same content) and becomes variant source
- Non-standard ports are preserved (tiers only strip :80/:443)
- Port in self URL is authoritative if content matches

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| NewsBlur | Ports handled via config, not normalized in canonical URL |
| Miniflux | Bug: non-standard ports stripped in media proxy (#2769) |
| tt-rss | Configurable ALLOW_PORTS - default only 80/443 for feeds |

---

## Case 41: IPv6 Address URL

### Input
```
User enters: https://[2001:db8::1]/feed
```

### Expected Behavior
```
Result: https://[2001:db8::1]/feed
```

### Why This Works
- IPv6 addresses in bracket notation are valid URLs
- URL parsing handles IPv6 correctly
- No special normalization needed for IPv6

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| NewsBlur | Limited support (Redis module only) |
| Miniflux | Not explicitly handled - Go's net/url handles bracket notation |
| tt-rss | Incomplete - only blocks ::1 loopback, TODO for fc00::/7 and fe80::/10 |

---

## Case 42: URL with Unusual but Valid Characters

### Input
```
User enters: https://example.com/feed%20file.xml
Self URL: https://example.com/feed%20file.xml
```

### Expected Behavior
```
Result: https://example.com/feed%20file.xml
```

### Why This Works
- Percent-encoded characters are valid URL components
- Encoding normalization standardizes to uppercase hex
- Unusual but valid characters are preserved

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| NewsBlur | Feed content encoding fixes, unclear URL percent-encoding handling |
| Miniflux | Uses Go's url.Parse() implicit decoding - query strings not re-encoded (#540) |
| tt-rss | Path encoding normalized via rawurldecode/rawurlencode for validation |

---

## Case 43: Self URL with Dangerous Scheme

### Input
```
User enters: https://example.com/feed
Self URL: javascript:alert(1)
```

### Expected Behavior
```
Result: https://example.com/feed
```

### Why This Works
- Non-HTTP(S) schemes are rejected during URL resolution
- javascript:, data:, file: schemes are not valid feed URLs
- Algorithm falls back to responseUrl for invalid self URLs

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| NewsBlur | Checks address.startswith("http") but no explicit scheme blocking |
| Miniflux | Whitelist of 35+ allowed schemes - javascript:/data: blocked |
| tt-rss | Strict whitelist - only http/https for feeds |

---

## Case 44: Malformed/Unparseable Self URL

### Input
```
User enters: https://example.com/feed
Self URL: not a valid url at all :::
```

### Expected Behavior
```
Result: https://example.com/feed
```

### Why This Works
- URL parsing fails gracefully
- Malformed self URL is ignored
- Algorithm continues with responseUrl

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| NewsBlur | Multiple error handlers - returns error codes 551/552 |
| Miniflux | Silent suppression - invalid URLs stripped via continue statements |
| tt-rss | Uses parse_url() - returns false for malformed, silent failures |

---

## Case 45: Self URL with Credentials

### Input
```
User enters: https://example.com/feed
Self URL: https://user:pass@example.com/feed
Both return same content
```

### Expected Behavior
```
Result: https://user:pass@example.com/feed
```

### Why This Works
- Self URL validates and becomes variant source
- Default tiers have stripAuthentication: false
- Credentials are preserved in canonical URL

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| NewsBlur | No explicit user:pass@ stripping found - credentials preserved |
| Miniflux | HTTP Basic Auth supported - credentials may show in logs (#105) |
| tt-rss | Credentials preserved - separate auth params in fetch() |

---

## Case 46: Relative Self URL with Path Traversal

### Input
```
User enters: https://example.com/blog/posts/feed.xml
Self URL: ../../feed.xml
Both return same content
```

### Expected Behavior
```
Result: https://example.com/feed.xml
```

### Why This Works
- Relative URL resolved against responseUrl base
- ../../feed.xml from /blog/posts/feed.xml → /feed.xml
- Resolved self URL validates and becomes canonical

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| NewsBlur | No explicit ../ resolution found |
| Miniflux | Uses Go's url.ResolveReference() which normalizes ../ automatically |
| tt-rss | No path normalization - ../ passed through unchanged |

---

## Case 47: existsFn Returns True for Non-First Variant

### Input
```
User enters: https://www.example.com/feed
existsFn: Returns true for www version only
First variant (no www): Returns different content
```

### Expected Behavior
```
Result: https://www.example.com/feed
```

### Why This Works
- existsFn is checked for each variant
- When existsFn returns true, that variant is returned immediately
- Enables database-driven early termination

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| NewsBlur | Hash-based duplicate detection rather than URL comparison |
| Miniflux | No custom canonicalization - exact URL matching |
| tt-rss | No variant generation - single URL processing path |

---

## Case 48: Self URL Resolves to Localhost

### Input
```
User enters: https://example.com/feed
Self URL: https://localhost/feed
validateUrlFn: Blocks localhost
```

### Expected Behavior
```
Result: https://example.com/feed
```

### Why This Works
- validateUrlFn can block localhost/private IPs for SSRF protection
- Self URL fails validation and is ignored
- Algorithm falls back to responseUrl

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| NewsBlur | No SSRF protection or localhost blocking found |
| Miniflux | Default allows localhost - 127.0.0.1/8 for metrics only |
| tt-rss | SSRF prevention via has_disallowed_ip() - blocks most private IPs |

---

## Case 49: Mixed Case Hostname

### Input
```
User enters: https://Example.COM/feed
Self URL: https://EXAMPLE.COM/feed
```

### Expected Behavior
```
Result: https://example.com/feed
```

### Why This Works
- Hostnames are case-insensitive per RFC
- Default tiers include lowercaseHostname: true
- All hostnames normalized to lowercase

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| NewsBlur | No explicit hostname lowercasing found |
| Miniflux | Case-insensitive only in specific contexts (favicon matching) |
| tt-rss | Scheme lowercased, but hostname case preserved |

---

## Case 50: All Tiers Produce Identical URL

### Input
```
User enters: https://example.com/feed
All tiers: Produce https://example.com/feed
```

### Expected Behavior
```
Result: https://example.com/feed
Only 1 fetch (no variant testing needed)
```

### Why This Works
- Set deduplicates identical variants
- Variant equals variantSource, skipped in loop
- No unnecessary fetches for degenerate case

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| All | Not applicable - no variant generation in other readers |

---

## Case 51: Self URL Redirects to Different Domain

### Input
```
User enters: https://old.example.com/feed
Self URL: https://alias.example.com/feed
Self URL redirects to: https://new.example.com/feed
All return same content
```

### Expected Behavior
```
Result: https://new.example.com/feed
```

### Why This Works
- Self URL is fetched and followed through redirects
- Final destination (after redirects) becomes variant source
- Discovers canonical URL through self URL redirect chain

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| NewsBlur | Follows redirects but uses hash-based deduplication |
| Miniflux | Follows redirects via HTTP client |
| tt-rss | Validates each redirect URL for SSRF protection |

---

## Case 52: Variant Testing Exhausts All Options

### Input
```
User enters: https://www.example.com/feed/
All variants: Return different content
```

### Expected Behavior
```
Result: https://www.example.com/feed/
```

### Why This Works
- Each variant tested, none match responseHash
- winningUrl remains as variantSource
- Original working URL preserved when variants fail

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| All | Not applicable - no variant testing in other readers |

---

## Case 53: Self URL Redirect Chain

### Input
```
User enters: https://example.com/feed
Self URL: https://redirect1.example.com/feed
Self URL redirects to: https://redirect2.example.com/feed
All return same content
```

### Expected Behavior
```
Result: https://redirect2.example.com/feed
```

### Why This Works
- fetchFn follows the entire redirect chain
- selfResponse.url is the final destination
- Multi-hop redirects resolved to ultimate canonical

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| NewsBlur | Follows redirect chains via HTTP client |
| Miniflux | Follows redirect chains via Guzzle |
| tt-rss | Follows redirects with SSRF validation per hop |

---

## Case 54: First Matching Variant Wins

### Input
```
User enters: https://www.example.com/feed/
Tier 0: https://example.com/feed (matches)
Tier 1: https://www.example.com/feed (would also match)
```

### Expected Behavior
```
Result: https://example.com/feed
```

### Why This Works
- Variants tested in tier order (cleanest first)
- First matching variant wins, loop breaks
- Ensures cleanest working URL is canonical

### How Other Readers Handle This

| Reader | Behavior |
|--------|----------|
| All | Not applicable - no tiered variant testing in other readers |

---

## Summary Table

| Case | Input Characteristic | Result | Requests |
|------|---------------------|--------|----------|
| 1 | FeedBurner alias | Canonical feedburner domain | 1 |
| 2 | Polluted URL, works clean | Cleanest variant | 2 |
| 3 | Polluted + good self URL | Self URL (cleanest) | 2 |
| 4 | Bad self URL | Response URL | 1 |
| 5 | Self URL different feed | Response URL | 1 |
| 6 | Input redirects | Final destination | 1 |
| 7 | HTTP, HTTPS works | HTTPS | 2 |
| 8 | HTTP, HTTPS fails | HTTP | 2 |
| 9 | WWW mismatch | Non-WWW | 2 |
| 10 | feed:// protocol | https:// equivalent | 1 |
| 11 | Multiple FeedBurner users | Same canonical | 1 each |
| 12 | Relative self URL | Resolved absolute | 1 |
| 13 | Functional query param | Keep param | 2 |
| 14 | No self URL | Response URL | 1 |
| 15 | Complex auth URL | Original URL | N |
| 16 | Redirect loop | Fallback | 1+ |
| 17 | Dynamic timestamps | Feed signature match | 1-2 |
| 18 | Multiple self URLs | Match responseUrl or first | 1 |
| 19 | Self URL returns HTML | ResponseUrl (skip HTML) | 1-2 |
| 20 | Self URL redirects | Follow to final destination | 1-2 |
| 21 | Platform canonical dead | Fallback to original input | 2+ |
| 22 | Case sensitivity mismatch | Prefer lowercase if works | 2 |
| 23 | Scheme-relative input | Default to HTTPS | 1 |
| 24 | Standard port in URL | Strip default port | 1 |
| 25 | Credentials in URL | Strip, flag requiresAuth | 1-2 |
| 26 | Response redirects to FeedBurner | Platform-normalized FeedBurner | 2 |
| 27 | Self URL is FeedBurner alias | Platform-normalized FeedBurner | 2 |
| 28 | HTTPS returns different content | HTTP (content mismatch) | 2 |
| 29 | Self URL fails verification | Response URL | 1 |
| 30 | Variant matches responseUrl | Response URL (optimized) | 1-2 |
| 31 | Parser returns undefined | Response URL | 1 |
| 32 | Self URL with fragment | Fragment stripped | 1 |
| 33 | Self URL protocol differs | HTTPS preferred | 2 |
| 34 | All variants fail | Original working URL | N |
| 35 | Variant redirects | Tested variant URL | 2 |
| 36 | Self URL redirects to FeedBurner | Platform-normalized FeedBurner | 3 |
| 37 | Platform handler throws | Original URL (graceful fallback) | 1 |
| 38 | Multiple handlers match | First handler wins | 1 |
| 39 | IDN/Punycode mismatch | Punycode normalized | 1 |
| 40 | Port number mismatch | Self URL port preserved | 2 |
| 41 | IPv6 address URL | IPv6 preserved | 1 |
| 42 | Unusual valid characters | Encoded chars preserved | 1 |
| 43 | Dangerous scheme self URL | Response URL (scheme rejected) | 1 |
| 44 | Malformed self URL | Response URL (parse failed) | 1 |
| 45 | Self URL with credentials | Credentials preserved | 2 |
| 46 | Relative path traversal | Resolved path | 2 |
| 47 | existsFn early match | Matched variant | 1-2 |
| 48 | Localhost self URL | Response URL (SSRF blocked) | 1 |
| 49 | Mixed case hostname | Lowercase normalized | 1 |
| 50 | All tiers identical | Single URL (optimized) | 1 |
| 51 | Self URL redirects | Redirect destination | 2 |
| 52 | All variants fail | Original working URL | N |
| 53 | Self URL redirect chain | Final destination | 2 |
| 54 | First matching variant | Cleanest tier wins | 2 |

---

## Request Budget Strategy

| Scenario | Typical Requests |
|----------|------------------|
| Already canonical | 1 |
| Simple cleanup (www, slash) | 2 |
| HTTPS upgrade | 2 |
| Multiple fallbacks | 3-5 |
| Complex/authenticated | N (until match) |

**Default budget**: 3 requests (1 initial + 2 tests)
**Configurable**: `maxRequests` option for callers with different needs

---

## Platform Handler Note

```
Platform handlers assume canonical domain outlives aliases.
If a platform changes significantly (e.g., Google kills FeedBurner),
update or remove the handler. The normalized URL failing would
indicate the original alias likely doesn't work either.
```

---

_Last updated: December 2024 (expanded to 54 cases)_
