---
title: How It Works
---

# How It Works

Feedcanon finds the canonical URL for a feed through a multi-phase process. Each phase builds on the previous one to ensure the cleanest URL is returned.

## Phases

Below is an overview of the default behavior. Many aspects can be customized. See the [Guides](/guides/callbacks) for available options.

### 1. Initial Fetch

The process starts by fetching the input URL:

1. Resolve the URL protocol (`feed://` → `https://`)
2. Apply rewrites (e.g., normalize FeedBurner domains)
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
3. If it matches, use the self URL as the base for URL normalization

The comparison uses a two-tier matching strategy:
- **Exact match**: responses are byte-for-byte identical
- **Signature match**: the parsed feeds are the same once volatile fields are ignored

If the self URL fails (e.g., wrong protocol), Feedcanon tries the alternate protocol (`https://` ↔ `http://`).

### 4. URL Probes

If probes are configured, Feedcanon tests alternate URL forms:

1. Check if any probe matches the current URL
2. Generate candidate URLs from the matching probe
3. Test each candidate sequentially via fetch + content comparison
4. If a candidate returns equivalent content, use it as the new base

This is useful for converting query parameter URLs to cleaner path-based forms:

```
https://example.com/?feed=rss2
  ↓ WordPress probe generates candidate
https://example.com/feed
  ↓ Fetch and compare → matches ✓
Use /feed as base for URL normalization
```

### 5. URL Tiers

Using the validated base URL, Feedcanon generates URL candidates by applying URL normalization tiers. Candidates are ordered from cleanest (most normalized) to least clean.

```
https://www.example.com/feed/?id=123&utm_source=twitter
  ↓ Tier 1: Strip query, www, trailing slash
https://example.com/feed
  ↓ Tier 2: Strip www, trailing slash, tracking params
https://example.com/feed?id=123
  ↓ Tier 3: Strip trailing slash, tracking params
https://www.example.com/feed?id=123
  ↓ Tier 4: Strip tracking params only
https://www.example.com/feed/?id=123
```

### 6. Candidate Testing

Each candidate is tested in order:

1. Check if the URL exists in your database (via `existsFn`)
   - If found, return immediately with that URL
2. Fetch the candidate URL
3. Compare with the initial response using the two-tier matching
4. Return the first candidate that matches

This ensures the cleanest working URL is selected.

### 7. HTTPS Upgrade

If the winning URL uses HTTP, Feedcanon attempts an HTTPS upgrade:

1. Replace `http://` with `https://`
2. Fetch and compare with the initial response
3. If it matches, return the HTTPS URL

This ensures secure connections when available.

## Matching Strategy

Feedcanon uses two methods to compare feed responses:

### Exact Body Match

The fastest comparison: responses must be byte-for-byte identical. This catches most cases where servers return the same content for different URLs.

### Signature Match

When bodies differ (e.g., timestamps, cache headers in content), Feedcanon falls back to comparing feed signatures. The default parser serializes the whole parsed feed to a JSON string, with these changes:

- The self URL is left out (`atom:link rel="self"`, or `feed_url` in JSON Feed)
- RSS: `lastBuildDate`, `pubDate`, `link` and `generator` of the channel are left out
- Atom: `updated` and `generator` of the feed are left out
- RDF: `link` of the channel is left out
- URLs pointing at the feed's own host or the site's host are reduced to their path, so `http`/`https`, `www` and trailing slash differences do not matter

Everything else, including all items, must be equal.

If signatures match, the feeds are considered equivalent even if the raw content differs.

## Example Flow

With `rewrites: [feedburnerRewrite]`:

```
Input: https://feedproxy.google.com/example?utm_source=rss

Phase 1: Rewrite → https://feeds.feedburner.com/example (domain normalized, query cleared), fetch
Phase 2: Extract self URL → https://feeds.feedburner.com/example
Phase 3: Validate self URL → same as fetched URL, skip
Phase 4: URL probes → no probes configured, skip
Phase 5: Generate candidates → every tier gives https://feeds.feedburner.com/example
Phase 6: Test candidates → already verified by the initial fetch, no extra requests
Phase 7: HTTPS upgrade → already HTTPS ✓

Result: https://feeds.feedburner.com/example
```

With WordPress probe enabled:

```
Input: https://example.com/?feed=rss2

Phase 1: Fetch → https://example.com/?feed=rss2
Phase 2: Extract self URL → https://example.com/?feed=rss2
Phase 3: Validate self URL → same as input, skip
Phase 4: URL probes → WordPress probe matches
  - Candidate: https://example.com/feed → matches ✓
  - Use /feed as base
Phase 5: Generate candidates from https://example.com/feed
Phase 6: Test candidates → https://example.com/feed works ✓
Phase 7: HTTPS upgrade → already HTTPS ✓

Result: https://example.com/feed
```
