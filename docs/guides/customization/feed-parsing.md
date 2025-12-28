---
prev: Data Fetching
next: URL Variants
---

# Feed Parsing

By default, Feedcanon uses [Feedsmith](https://github.com/macieklamberski/feedsmith) to parse feeds. You can use any feed parser by providing a custom `parser` that implements the adapter interface.

## Interface

The `parser` option must implement `ParserAdapter<T>`:

```typescript
type ParserAdapter<T> = {
  parse: (body: string) => T | undefined
  getSelfUrl: (parsed: T) => string | undefined
  getSignature: (parsed: T) => object
}
```

### parse

Parse the feed body and return your feed type, or `undefined` if parsing fails:

```typescript
parse: (body: string) => Feed | undefined
```

### getSelfUrl

Extract the self URL from the parsed feed. This is typically the `atom:link rel="self"` or similar declaration:

```typescript
getSelfUrl: (feed: Feed) => string | undefined
```

### getSignature

Return an object representing the feed's identity. Used to compare feeds when exact body matching fails:

```typescript
getSignature: (feed: Feed) => object
```

The signature should include stable identifiers like:
- Feed title and description
- Feed URL
- Item GUIDs or URLs
- Item timestamps

## Examples

### rss-parser

```typescript
import { findCanonical } from 'feedcanon'
import Parser from 'rss-parser'

const rssParser = new Parser()

const url = await findCanonical('https://example.com/feed', {
  parser: {
    parse: (body) => {
      try {
        // rss-parser is async, but we need sync
        // Consider using Feedsmith or fast-xml-parser instead
        return undefined
      } catch {
        return undefined
      }
    },
    getSelfUrl: (feed) => feed.feedUrl,
    getSignature: (feed) => ({
      title: feed.title,
      items: feed.items?.map((i) => i.guid),
    }),
  },
})
```

::: warning
Most feed parsers are asynchronous. The `parse` function in `ParserAdapter` is synchronous. Consider using [Feedsmith](https://github.com/macieklamberski/feedsmith) (the default) or another synchronous parser.
:::

## Default Parser

Feedcanon uses [Feedsmith](https://github.com/macieklamberski/feedsmith) by default, which supports RSS 0.9x, RSS 1.0, RSS 2.0, Atom 0.3, Atom 1.0, JSON Feed 1.0, and JSON Feed 1.1.

The default implementation:

```typescript
import { parseFeed } from 'feedsmith'
import type { ParserAdapter, FeedsmithFeed } from 'feedcanon'

export const defaultParser: ParserAdapter<FeedsmithFeed> = {
  parse: (body) => {
    try {
      return parseFeed(body)
    } catch {}
  },

  getSelfUrl: (parsed) => {
    switch (parsed.format) {
      case 'atom':
        return parsed.feed.links?.find((link) => link.rel === 'self')?.href
      case 'rss':
      case 'rdf':
        return parsed.feed.atom?.links?.find((link) => link.rel === 'self')?.href
      case 'json':
        return parsed.feed.feed_url
    }
  },

  getSignature: (parsed) => parsed.feed,
}
```
