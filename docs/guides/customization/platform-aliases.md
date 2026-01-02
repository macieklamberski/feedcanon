---
prev: URL Variants
next: URL Probes
---

# Platform Aliases

Platform handlers normalize URLs before any other processing. They're useful for:

- Consolidating domain aliases to a single canonical domain
- Normalizing platform-specific URL patterns
- Handling URL redirects at the domain level

## Interface

Each platform handler has two methods:

```typescript
type PlatformHandler = {
  match: (url: URL) => boolean
  normalize: (url: URL) => URL
}
```

### match

Return `true` if this handler should process the URL:

```typescript
match: (url) => url.hostname === 'feeds.example.com'
```

### normalize

Transform the URL and return it. The URL object is mutable:

```typescript
normalize: (url) => {
  url.hostname = 'canonical.example.com'
  return url
}
```

## Built-in

### FeedBurner

Normalizes various FeedBurner domain aliases:

```typescript
// Input URLs:
'https://feedproxy.google.com/example'
'https://feeds2.feedburner.com/example'

// All normalize to:
'https://feeds.feedburner.com/example'
```

## Examples

### Custom Domain Alias

```typescript
import { findCanonical } from 'feedcanon'
import { defaultPlatforms } from 'feedcanon/defaults'

const url = await findCanonical('https://old.example.com/feed', {
  platforms: [
    ...defaultPlatforms,
    {
      match: (url) => url.hostname === 'old.example.com',
      normalize: (url) => {
        url.hostname = 'new.example.com'
        return url
      },
    },
  ],
})
```

### Remove Platforms

Disable the default platform handlers by setting empty array:

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('https://feedproxy.google.com/example', {
  platforms: [], // No platform normalization
})
```
