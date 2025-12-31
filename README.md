# Feedcanon

[![codecov](https://codecov.io/gh/macieklamberski/feedcanon/branch/main/graph/badge.svg)](https://codecov.io/gh/macieklamberski/feedcanon)
[![npm version](https://img.shields.io/npm/v/feedcanon.svg)](https://www.npmjs.com/package/feedcanon)
[![license](https://img.shields.io/npm/l/feedcanon.svg)](https://github.com/macieklamberski/feedcanon/blob/main/LICENSE)

Find the canonical URL for any web feed by comparing actual content. Turn messy feed URLs into their cleanest form.

Many URLs can point to the same feed, varying by protocol, www prefixes, trailing slashes, order of params, or domain aliases. Feedcanon compares actual feed content, respects the feed's declared self URL, and tests simpler URL alternatives to find the cleanest working one.

Perfect for feed readers to deduplicate subscriptions when users add the same feed via different URLs.

**[Read full docs ↗](https://feedcanon.dev)**
&nbsp;&nbsp;·&nbsp;&nbsp;
[Quick Start](#quick-start)

---

## Example

The 9 URLs below all work and return identical content. None redirect to each other, normally making each appear unique. Feedcanon compares content, normalizes URLs and resolves them to a single URL.

```dockerfile
'http://feeds.kottke.org/main' ──────────┐
'http://feeds.kottke.org/main/' ─────────┤
'https://feeds.kottke.org/main' ─────────┤
'https://feeds.kottke.org/main/' ────────┤
'https://feeds.kottke.org///main/' ──────┼──→ 'https://feeds.kottke.org/main'
'http://feeds.feedburner.com/kottke' ────┤
'http://feeds.feedburner.com/kottke/' ───┤
'https://feeds.feedburner.com/kottke' ───┤
'https://feeds.feedburner.com/kottke/' ──┘
```

## Overview

### How It Works

1. Fetch the input URL and parse the feed to establish reference content.
2. Extract the feed's declared self URL (if present).
3. Validate the self URL by fetching and comparing content.
4. Generate URL variants ordered from cleanest to least clean.
5. Test variants in order—the first one serving identical content wins.
6. Upgrade HTTP to HTTPS if both serve identical content.

### Customization

Feedcanon is designed to be flexible. Every major component can be replaced or extended.

- **Progress callbacks** — monitor the process with `onFetch`, `onMatch`, and `onExists` callbacks.
- **Database lookup** — use `existsFn` to check if a URL already exists in your database.
- **Custom fetch** — use your own HTTP client (Axios, Got, Ky, etc.)
- **Custom parser** — bring your own parser (Feedsmith by default).
- **Custom tiers** — define your own URL normalization variants.
- **Custom platforms** — add handlers to normalize domain aliases (like FeedBurner).

## Quick Start

Basic installation and common usage patterns. For a full overview, visit the [documentation website](https://feedcanon.dev).

### Installation

```bash
npm install feedcanon
```

### Basic Usage

When you just need to clean up a feed URL and get its canonical form.

```typescript
import { findCanonical } from 'feedcanon'

const url = await findCanonical('http://www.example.com/feed/?utm_source=twitter')

// 'https://example.com/feed'
```

Returns `undefined` if the feed is invalid or unreachable.

### Using Callbacks

When you want to log the canonicalization process for debugging. Or store all URL aliases that resolve to the same feed.

```typescript
import { findCanonical } from 'feedcanon'

const aliases = []

const url = await findCanonical('http://www.example.com/feed/', {
  onMatch: ({ url }) => {
    aliases.push(url)
  },
})

// url: 'https://example.com/feed'
// aliases: [
//   'http://www.example.com/feed/',
//   'https://www.example.com/feed/',
//   'https://example.com/feed',
// ]
```
