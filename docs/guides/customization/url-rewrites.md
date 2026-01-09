---
prev: Feed Parsing
next: URL Probes
---

# URL Rewrites

Rewrites transform known URLs before any other processing. They're useful for:

- Consolidating domain aliases to a single canonical domain
- Transforming platform-specific URL patterns
- Handling URL redirects at the domain level

## Interface

Each rewrite has two methods:

```typescript
type Rewrite = {
  match: (url: URL) => boolean
  rewrite: (url: URL) => URL
}
```

### match

Return `true` if this rewrite should process the URL:

```typescript
match: (url) => url.hostname === 'feeds.example.com'
```

### rewrite

Transform the URL and return it. The URL object is mutable:

```typescript
rewrite: (url) => {
  url.hostname = 'canonical.example.com'
  return url
}
```

## Built-in

> [!WARNING]
> No URL rewrites are enabled by default. To use built-in rewrites, you must explicitly pass them via the [`rewrites`](/reference/find-canonical#options) option.

### FeedBurner

Transforms various FeedBurner domain aliases. Since FeedBurner URL structure is well-known, the rewrite also normalizes URLs (strips query params, trailing slashes, etc.):

| From | To |
|------|-----|
| `https://feedproxy.google.com/example?format=xml` | `https://feeds.feedburner.com/example` |
| `https://feeds2.feedburner.com/example/` | `https://feeds.feedburner.com/example` |

### Blogger / Blogspot

Transforms Blogger and Blogspot URLs to canonical form. Since Blogger/Blogspot URL structure is well-known, the rewrite also normalizes URLs:

| From | To |
|------|-----|
| `https://example.blogspot.co.uk/feeds/posts/default` | `https://example.blogspot.com/feeds/posts/default` |
| `https://example.blogspot.de/atom.xml` | `https://example.blogspot.com/feeds/posts/default` |
| `http://blogger.com/feeds/123/posts/default` | `https://www.blogger.com/feeds/123/posts/default` |

Transformations applied:
- Country-specific TLDs (`.blogspot.co.uk`, `.blogspot.de`) → `.blogspot.com`
- Legacy paths (`/atom.xml`, `/rss.xml`) → `/feeds/posts/default`
- HTTP → HTTPS
- `blogger.com` → `www.blogger.com`
- Strips tracking params (`redirect`, `alt=atom`, `v`, pagination params)

## Examples

### Using Built-in Rewrites

```typescript
import { findCanonical, feedburnerRewrite, bloggerRewrite } from 'feedcanon'

const url = await findCanonical('https://feedproxy.google.com/example', {
  rewrites: [feedburnerRewrite, bloggerRewrite],
})
```

### Custom Domain Alias

```typescript
import { findCanonical, feedburnerRewrite } from 'feedcanon'

const url = await findCanonical('https://old.example.com/feed', {
  rewrites: [
    feedburnerRewrite,
    {
      match: (url) => url.hostname === 'old.example.com',
      rewrite: (url) => {
        url.hostname = 'new.example.com'
        return url
      },
    },
  ],
})
```
