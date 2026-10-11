---
title: Quick Start
---

# Quick Start

Basic installation and common usage patterns.

## Installation

Feedcanon works in both Node and modern browsers as an ES module.

Install the package using your preferred package manager:

::: code-group

```bash [npm]
npm install feedcanon
```

```bash [yarn]
yarn add feedcanon
```

```bash [pnpm]
pnpm add feedcanon
```

```bash [bun]
bun add feedcanon
```

:::

## Basic Usage

When you just need to clean up a feed URL and get its canonical form.

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('http://www.example.com/feed/?utm_source=twitter')

// 'https://example.com/feed'
```

Returns `undefined` if the feed is invalid or unreachable, or if `existsFn`, `cleanUrlFn` or a callback throws. A parser that throws on the initial response does the same. It never rejects.

## Using Callbacks

When you want to log the canonicalization process for debugging. Or store all URL aliases that resolve to the same feed.

```typescript
import { findCanonical } from 'feedcanon'

const aliases = []

// Every protocol, www and trailing slash variant serves the same feed.
const url = await findCanonical('http://www.example.com/feed/', {
  onMatch: ({ url }) => {
    aliases.push(url)
  },
})

// url: 'https://example.com/feed'
// aliases: [
//   'http://www.example.com/feed/',
//   'http://example.com/feed',
//   'https://example.com/feed',
// ]
```

See [Using Callbacks](/guides/callbacks) for the full guide.

## Using the CLI

To check a feed from a terminal, run the `feedcanon` command. It prints the canonical URL and logs every request it made:

```bash
npx feedcanon http://www.example.com/feed/
```

See [CLI](/cli) for the options and output.
