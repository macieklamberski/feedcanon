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

Return a string representing the feed's identity. Two feeds are treated as the same when their signatures are equal. Used to compare feeds when exact body matching fails:

```typescript
getSignature: (feed: Feed, url: string) => string
```

The `url` argument is the URL the feed was fetched from. The default parser uses it to neutralize the feed's own URLs, so two copies that differ only in protocol, `www` or trailing slash still match. A custom parser can ignore it.

Build the signature from fields that stay the same between requests:
- Feed title and description
- Item GUIDs or URLs
- Item timestamps

Leave out fields that change with every request or with the URL the feed was fetched from, such as the build date or the self URL.

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
