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
5. Keep the URL the response came from, following only permanent redirects (see [Redirects](/guides/customization/data-fetching#redirects))

If any step fails, the function returns `undefined`. A URL your `existsFn` knows ends the search, at whichever phase adopts it.

::: details Errors and feed pseudo-schemes
- **Errors.** The promise never rejects. An error thrown by `existsFn`, `cleanUrlFn` or a callback at any phase, or by the parser's `parse` or `getSelfUrl` on the initial response, makes the function return `undefined`. A `getSignature` error, or a `parse` error on a later response, only skips that URL, and the search continues.
- **`feed://` and `itpc://`.** A feed pseudo-scheme doesn't say which transport to use. When the `https://` fetch throws or returns a non-2xx status, Feedcanon tries the same URL over `http://` once before giving up, so a host that only serves http still resolves. When a rewrite maps both forms to the same URL, as `bloggerRewrite` does by forcing https, that URL is fetched once. An explicit `https://` input, or `feed:https://`, is never retried over http. The `feed` scheme is [provisionally registered with IANA](https://www.iana.org/assignments/uri-schemes/prov/feed), from draft-obasanjo-feed-uri-scheme.
:::

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

The parser extracts this self URL from the feed content. This declared URL often represents the feed author's preferred canonical form. A server can also declare it in the HTTP `Link` response header.

::: details Self URL sources and the Link header
The default parser reads the self URL from:

- The Atom link whose `rel` is `self` or its IANA form `http://www.iana.org/assignments/relation/self`, in any case for the short name ([RFC 4287 §4.2.7.2](https://www.rfc-editor.org/rfc/rfc4287#section-4.2.7.2), [RFC 8288 §2.1.1](https://www.rfc-editor.org/rfc/rfc8288#section-2.1.1))
- `atom:link` in RSS and RDF, with the same matching
- `feed_url` in [JSON Feed 1.1](https://www.jsonfeed.org/version/1.1/)

A relative self URL resolves against the root element's `xml:base`, which itself resolves against the URL the feed came from ([RFC 3986 §5.1](https://www.rfc-editor.org/rfc/rfc3986#section-5.1)).

A server can also declare the self URL in the HTTP `Link` response header ([RFC 8288](https://www.rfc-editor.org/rfc/rfc8288#section-3)):

```
Link: <https://example.com/feed.xml>; rel="self"
```

When the header has a self link, it takes precedence over the one in the feed, as [WebSub](https://www.w3.org/TR/websub/#discovery) specifies. The feed's self link is tried only when the header's fails validation. The header's `rel` matches the same way as the feed's, IANA form included. A relative URL in the header is resolved against the response URL. Both go through the same rewrites and cleaning.
:::

### 3. Self URL Validation

If a self URL exists and differs from the URL kept in Phase 1, Feedcanon validates it:

1. Fetch the self URL
2. Compare the response with the initial fetch
3. If it matches, use the self URL as the base for URL normalization

The comparison uses a two-tier matching strategy:
- **Exact match**: responses are byte-for-byte identical
- **Signature match**: the parsed feeds are the same once volatile fields are left out

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
  ↓ Tier 2: Strip www, trailing slash
https://example.com/feed?id=123&utm_source=twitter
  ↓ Tier 3: Strip trailing slash
https://www.example.com/feed?id=123&utm_source=twitter
  ↓ Tier 4: Keep www and trailing slash
https://www.example.com/feed/?id=123&utm_source=twitter
```

Only Tier 1 drops the query. To remove tracking params from the other tiers too, pass a `cleanUrlFn`, which runs on the response URL before the tiers (see [URL Tiers](/guides/customization/url-tiers#strip-tracking-params)).

::: details Deviations from URI equivalence
Some tiers drop parts of a URL that [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986) and [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) treat as significant. That's safe because Feedcanon never returns such a candidate unseen: it fetches each one and keeps it only if it serves the same feed, even when your `existsFn` already knows the URL.

- **Empty query.** A bare `?` is dropped, though [RFC 3986 §6.2.3](https://www.rfc-editor.org/rfc/rfc3986#section-6.2.3) keeps it significant.
- **`www.` and trailing slash.** A host and a path segment are significant ([RFC 3986 §3.3](https://www.rfc-editor.org/rfc/rfc3986#section-3.3)), so `/feed/` and `/feed` can be different resources. Feedcanon tries the shorter form and keeps it only when the feed matches.
- **http and https.** Different protocols name different origins ([RFC 9110 §4.2.2](https://www.rfc-editor.org/rfc/rfc9110#section-4.2.2)). Feedcanon treats them as one feed when both serve it and prefers https.
:::

### 6. Candidate Testing

Each candidate is tested in order:

1. Check if the URL exists in your database (via `existsFn`)
   - If found and it serves the same feed, return it
2. Fetch the candidate URL
3. Compare with the initial response using the two-tier matching
4. Return the first candidate that matches

This ensures the cleanest working URL is selected.

::: details Known candidates and redirects
- **A candidate `existsFn` knows** is fetched before it is returned, or its response reused if this call already fetched it. One that serves a different feed or fails to fetch is skipped.
- **A candidate that redirects permanently** is not where the feed lives, so the search moves to its redirect target, whether `existsFn` knows the candidate or not. The target is checked against your `existsFn` like any candidate, and its own cleaner candidates are tested once, so every entry URL of a feed reaches the same result. When the target is the candidate's own form under the other protocol, the URL your `existsFn` knows is returned, so the feed is not stored twice.
- **An HTTPS candidate that redirects permanently to HTTP** uses the HTTPS form of that target when it serves the feed. Otherwise the HTTP target is used.
:::

### 7. HTTPS Upgrade

If the winning URL uses HTTP, Feedcanon attempts an HTTPS upgrade:

1. Replace `http://` with `https://`
2. Fetch and compare with the initial response
3. If it matches, return the HTTPS URL

This ensures secure connections when available.

::: details Redirects and cleaner candidates
- **An HTTPS URL that redirects back to HTTP** is not served over HTTPS, so the HTTP URL is kept.
- **Cleaner candidates that failed over HTTP** get their HTTPS forms tested once the upgrade matches, as in candidate testing. The first that matches is returned, otherwise the HTTPS URL. One that redirects permanently to an HTTP URL is ignored, unless `existsFn` knows that URL. An HTTP and an HTTPS entry URL of the same feed reach the same result this way.
- **An HTTPS URL that redirects permanently** returns its target instead, as in candidate testing.
- **Cost.** When the HTTP winner is already the cleanest candidate, the upgrade costs one request.
- **A permanent redirect target served over HTTP** is returned under its HTTPS form when that serves the feed.
:::

## Matching Strategy

Feedcanon uses two methods to compare feed responses:

### Exact Body Match

The fastest comparison: responses must be byte-for-byte identical. This catches most cases where servers return the same content for different URLs.

### Signature Match

When bodies differ (e.g., timestamps, cache headers in content), Feedcanon falls back to comparing feed signatures. The default parser serializes the whole parsed feed, with the parts that change between requests or between URLs taken out:

- Volatile fields are left out: `lastBuildDate`, `pubDate`, `link` and `generator` in RSS, `updated` and `generator` in Atom, `link` in RDF, `feed_url` in JSON Feed
- The self link is cleared
- URLs on the host of either compared feed or on the site's host are reduced to their path, so differences in protocol, `www` or trailing slash do not count

If signatures match, the feeds are considered equivalent even if the raw content differs.

## Example Flow

With `rewrites: [feedburnerRewrite]`:

```
Input: https://feedproxy.google.com/example?utm_source=rss

Phase 1: Rewrite → https://feeds.feedburner.com/example (domain normalized, query cleared), then fetch
Phase 2: Extract self URL → https://feeds.feedburner.com/example
Phase 3: Validate self URL → same as response URL, skip
Phase 4: URL probes → no probes configured, skip
Phase 5: Generate candidates → every tier gives https://feeds.feedburner.com/example
Phase 6: Test candidates → same as the URL already fetched, no extra request
Phase 7: HTTPS upgrade → already HTTPS ✓

Result: https://feeds.feedburner.com/example
```

With WordPress probe enabled:

```
Input: https://example.com/?feed=rss2

Phase 1: Fetch → https://example.com/?feed=rss2
Phase 2: Extract self URL → https://example.com/?feed=rss2
Phase 3: Validate self URL → same as response URL, skip
Phase 4: URL probes → WordPress probe matches
  - Candidate: https://example.com/feed → matches ✓
  - Use /feed as base
Phase 5: Generate candidates from https://example.com/feed
Phase 6: Test candidates → https://example.com/feed works ✓
Phase 7: HTTPS upgrade → already HTTPS ✓

Result: https://example.com/feed
```
