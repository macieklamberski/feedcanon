---
title: "Customization: Feed Parsing"
---

# Customize Feed Parsing

By default, Feedcanon uses [Feedsmith](https://github.com/macieklamberski/feedsmith) to parse feeds. You can use any feed parser by providing a custom `parser` that implements the adapter interface.

## Interface

The `parser` option must implement `ParserAdapter<T>`:

```typescript
type ParserAdapter<T> = {
  parse: (body: string) => MaybePromise<T | undefined>
  getSelfUrl: (parsed: T) => string | undefined
  getSignature: (parsed: T, url: string) => string
}
```

### parse

Parse the feed body and return your feed type, or `undefined` if parsing fails. Both sync and async parsers are supported:

```typescript
parse: (body: string) => MaybePromise<Feed | undefined>
```

### getSelfUrl

Extract the self URL from the parsed feed. This is typically the `atom:link rel="self"` or similar declaration:

```typescript
getSelfUrl: (feed: Feed) => string | undefined
```

### getSignature

Return a string representing the feed's identity. Two feeds are treated as the same feed when their signatures are equal. Used to compare feeds when exact body matching fails. The second argument is the URL the feed was fetched from:

```typescript
getSignature: (feed: Feed, url: string) => string
```

Build the signature from stable identifiers like:
- Feed title and description
- Item GUIDs or URLs
- Item titles

Leave out values that change between requests or between URL variants of the same feed, such as build timestamps or the feed's own URL. Use the `url` argument when you need to remove the feed's own host from the signature.

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
    getSignature: (feed) => {
      return JSON.stringify({
        title: feed.title,
        items: feed.items?.map((item) => item.guid),
      })
    },
  },
})
```
