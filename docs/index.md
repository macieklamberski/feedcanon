# Feedcanon

Find the canonical URL for any web feed by comparing actual content. Turn messy feed URLs into their cleanest form.

Many URLs can point to the same feed, varying by protocol, www prefixes, trailing slashes, order of params, or domain aliases. Feedcanon compares actual feed content, respects the feed's declared self URL, and tests simpler URL alternatives to find the cleanest working one.

Perfect for feed readers to deduplicate subscriptions when users add the same feed via different URLs.

## Example

The 9 URLs below all work and return identical content. None redirect to each other, normally making each appear unique. Feedcanon compares content, normalizes URLs and resolves them to a single URL.

```
http://feeds.kottke.org/main ──────────┐
http://feeds.kottke.org/main/ ─────────┤
https://feeds.kottke.org/main ─────────┤
https://feeds.kottke.org/main/ ────────┤
https://feeds.kottke.org///main/ ──────┼──→ https://feeds.kottke.org/main
http://feeds.feedburner.com/kottke ────┤
http://feeds.feedburner.com/kottke/ ───┤
https://feeds.feedburner.com/kottke ───┤
https://feeds.feedburner.com/kottke/ ──┘
```

## Overview

### How It Works

1. Fetch the input URL and parse the feed to establish reference content.
2. Extract the feed's declared self URL (if present).
3. Validate the self URL by fetching and comparing content.
4. Generate URL candidates ordered from cleanest to least clean.
5. Test candidates in order—the first one serving identical content wins.
6. Upgrade HTTP to HTTPS if both serve identical content.

See [How It Works](/how-it-works) for detailed explanation of each step.

### Customization

Feedcanon is designed to be flexible. Every major component can be replaced or extended.

- **Progress callbacks** — monitor the process with `onFetch`, `onMatch`, and `onExists` callbacks.
- **Database lookup** — use `existsFn` to check if a URL already exists in your database.
- **Custom fetch** — use your own HTTP client (Axios, Got, Ky, etc.)
- **Custom parser** — bring your own parser (Feedsmith by default).
- **Custom tiers** — define your own URL normalization tiers.
- **Custom rewrites** — add rewrites to normalize domain aliases (like FeedBurner).
