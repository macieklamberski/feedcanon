---
prev: URL Rewrites
next: URL Normalization Tiers
---

# URL Probes

Probes test alternate URL forms for known services or URL patterns to find cleaner canonical URLs.

## When to Use

Probes are useful for:

- Converting query parameters to path-based URLs
- Testing platform-specific URL patterns
- Finding cleaner URL forms that serve identical content

Unlike platform handlers which transform URLs before fetching, probes generate candidates that are tested against the original response.

## Interface

Each probe has two methods:

```typescript
type Probe = {
  match: (url: URL) => boolean
  getCandidates: (url: URL) => Array<string>
}
```

### match

Return `true` if this probe should process the URL:

```typescript
match: (url) => url.searchParams.has('feed')
```

### getCandidates

Return candidate URLs to test, ordered by preference (cleanest first):

```typescript
getCandidates: (url) => {
  const candidate = new URL(url)
  candidate.pathname = '/feed'
  candidate.searchParams.delete('feed')
  return [candidate.href]
}
```

## How Probes Work

1. Each probe's `match` function is checked in order
2. The first matching probe generates candidates
3. Candidates are tested sequentially via fetch + content comparison
4. First candidate returning equivalent content becomes the new base URL
5. If no candidates work, the original URL is kept

Only the first matching probe is used—subsequent probes are skipped.

## Built-in

> [!WARNING]
> No URL probes are enabled by default. To use built-in probes, you must explicitly pass them via the [`probes`](/reference/find-canonical#options) option.

### WordPress

Converts WordPress query parameter feeds to path-based URLs:

```typescript
import { wordpressProbe } from 'feedcanon'

// Regular feeds
'https://example.com/?feed=rss2'  → 'https://example.com/feed'
'https://example.com/?feed=atom'  → 'https://example.com/feed/atom'

// Comment feeds
'https://example.com/?feed=comments-rss2' → 'https://example.com/comments/feed'
'https://example.com/?feed=comments-atom' → 'https://example.com/comments/feed/atom'

// Category/tag feeds
'https://example.com/category/news/?feed=rss2' → 'https://example.com/category/news/feed'
```

The probe also handles redundant parameters when the path already contains `/feed`:

```typescript
'https://example.com/feed/?feed=rss2' → 'https://example.com/feed'
```

## Examples

### Using WordPress Probe

```typescript
import { findCanonical, wordpressProbe } from 'feedcanon'

const url = await findCanonical('https://example.com/?feed=rss2', {
  probes: [wordpressProbe],
})
// Returns: 'https://example.com/feed' (if it serves same content)
```

### Custom Probe

Create a probe for a custom URL pattern:

```typescript
import { findCanonical } from 'feedcanon'
import type { Probe } from 'feedcanon'

const customProbe: Probe = {
  match: (url) => url.pathname.endsWith('.rss'),
  getCandidates: (url) => {
    const candidate = new URL(url)
    candidate.pathname = candidate.pathname.replace('.rss', '.xml')
    return [candidate.href]
  },
}

const url = await findCanonical('https://example.com/feed.rss', {
  probes: [customProbe],
})
```

### Combining Probes

Use multiple probes together—the first matching probe is used:

```typescript
import { findCanonical, wordpressProbe } from 'feedcanon'

const url = await findCanonical('https://example.com/?feed=rss2', {
  probes: [wordpressProbe, customProbe],
})
```

### Disable Probes

Probes are optional and disabled by default. To explicitly disable:

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('https://example.com/?feed=rss2', {
  probes: [],
})
```
