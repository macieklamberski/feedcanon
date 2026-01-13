---
title: "Customization: Feed Parsing"
---

# Customize Feed Parsing

By default, Feedcanon uses [Feedsmith](https://github.com/macieklamberski/feedsmith) to parse feeds. You can use any feed parser by providing a custom `parser` that implements the adapter interface.

## Interface

The `parser` option must implement `ParserAdapter<T>`:

```typescript
type ParserAdapter<T> = {
  parse: (body: string) => Promise<T | undefined> | T | undefined
  getSelfUrl: (parsed: T) => string | undefined
  getSignature: (parsed: T) => object
}
```

### parse

Parse the feed body and return your feed type, or `undefined` if parsing fails. Both sync and async parsers are supported:

```typescript
parse: (body: string) => Promise<Feed | undefined> | Feed | undefined
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
    parse: (body) => rssParser.parseString(body).catch(() => undefined),
    getSelfUrl: (feed) => feed.feedUrl,
    getSignature: (feed) => ({
      title: feed.title,
      items: feed.items?.map((i) => i.guid),
    }),
  },
})
```
