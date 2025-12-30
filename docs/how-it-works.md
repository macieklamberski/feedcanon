---
prev: Quick Start
next: Using Callbacks
---

# How It Works

Feedcanon finds the canonical URL for a feed through a multi-phase process. Each phase builds on the previous one to ensure the cleanest URL is returned.

## Phases

Below is an overview of the default behavior. Many aspects can be customized—see the [Guides](/guides/callbacks) for available options.

### 1. Initial Fetch

The process starts by fetching the input URL:

1. Resolve the URL protocol (`feed://` → `https://`)
2. Apply platform handlers (e.g., normalize FeedBurner domains)
3. Fetch the content and verify it returns a successful response (2xx)
4. Parse the feed to ensure it's valid

If any step fails, the function returns `undefined`.

### 2. Self URL Extraction

Many feeds declare their canonical URL using `atom:link rel="self"`:

```xml
<feed xmlns="http://www.w3.org/2005/Atom">
  <link
    href="https://example.com/feed.xml"
    rel="self"
    type="application/atom+xml"
  />
  ...
</feed>
```

The parser extracts this self URL from the feed content. This declared URL often represents the feed author's preferred canonical form.

### 3. Self URL Validation

If a self URL exists and differs from the request URL, Feedcanon validates it:

1. Fetch the self URL
2. Compare the response with the initial fetch
3. If it matches, use the self URL as the base for variant generation

The comparison uses a two-tier matching strategy:
- **Exact match** — responses are byte-for-byte identical
- **Signature match** — feeds have the same structure (title, items, etc.)

If the self URL fails (e.g., wrong protocol), Feedcanon tries the alternate protocol (`https://` ↔ `http://`).

### 4. Variant Generation

Using the validated base URL, Feedcanon generates URL variants by applying normalization tiers. Variants are ordered from cleanest (most normalized) to least clean.

```
https://www.example.com/feed/?utm_source=twitter
  ↓ Tier 1: Strip www, trailing slash, tracking params
https://example.com/feed
  ↓ Tier 2: Strip trailing slash, tracking params
https://www.example.com/feed
  ↓ Tier 3: Strip trailing slash only
https://www.example.com/feed?utm_source=twitter
```

### 5. Variant Testing

Each variant is tested in order:

1. Check if the URL exists in your database (via `existsFn`)
   - If found, return immediately with that URL
2. Fetch the variant URL
3. Compare with the initial response using the two-tier matching
4. Return the first variant that matches

This ensures the cleanest working URL is selected.

### 6. HTTPS Upgrade

If the winning URL uses HTTP, Feedcanon attempts an HTTPS upgrade:

1. Replace `http://` with `https://`
2. Fetch and compare with the initial response
3. If it matches, return the HTTPS URL

This ensures secure connections when available.

## Matching Strategy

Feedcanon uses two methods to compare feed responses:

### Exact Body Match

The fastest comparison—responses must be byte-for-byte identical. This catches most cases where servers return the same content for different URLs.

### Signature Match

When bodies differ (e.g., timestamps, cache headers in content), Feedcanon falls back to comparing feed signatures. The default parser extracts:

- Feed title and description
- Feed URL and site URL
- Items with their GUIDs, URLs, and timestamps

If signatures match, the feeds are considered equivalent even if the raw content differs.

## Example Flow

```
Input: https://feedproxy.google.com/example?utm_source=rss

Phase 1: Fetch → normalized to feeds.feedburner.com/example?utm_source=rss
Phase 2: Extract self URL → https://feeds.feedburner.com/example
Phase 3: Validate self URL → matches ✓
Phase 4: Generate variants:
  - https://feeds.feedburner.com/example (cleanest)
  - https://feeds.feedburner.com/example?utm_source=rss
Phase 5: Test variants → https://feeds.feedburner.com/example works ✓
Phase 6: HTTPS upgrade → already HTTPS ✓

Result: https://feeds.feedburner.com/example
```
