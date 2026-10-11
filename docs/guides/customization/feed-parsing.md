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
  getSelfUrl: (parsed: T, responseUrl?: string) => string | undefined
  getSignature: (parsed: T, responseUrl: string, comparedUrls?: Array<string>) => string
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
getSelfUrl: (feed: Feed, responseUrl?: string) => string | undefined
```

The `responseUrl` argument is the URL the feed was fetched from. A relative self URL is resolved against it afterwards, so most parsers can ignore it. The default parser uses it to resolve the self link against the feed's `xml:base` first ([RFC 4287 §2](https://www.rfc-editor.org/rfc/rfc4287#section-2)). Called without it, the default parser applies only an absolute `xml:base`. Feedsmith keeps only the `xml:base` on the root element, so a base set on the channel or on the link itself is ignored.

A self link in the response's `Link` header takes precedence. This one is tried only when that one fails validation.

### getSignature

Return a string representing the feed's identity. Two feeds are treated as the same when their signatures are equal. Used to compare feeds when exact body matching fails:

```typescript
getSignature: (feed: Feed, responseUrl: string, comparedUrls?: Array<string>) => string
```

The `responseUrl` argument is the URL the feed was fetched from. The `comparedUrls` argument holds the URLs of the feeds it is compared with. The default parser neutralizes URLs on the hosts of both, so two copies that differ only in protocol, `www` or trailing slash still match, even when they are served from different hosts. A custom parser can ignore both.

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
