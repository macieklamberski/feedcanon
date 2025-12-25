# Feedcanon

Find the canonical URL for any web feed by comparing actual content. Turn messy feed URLs into their cleanest form.

Many URLs can point to the same feed, varying by protocol, www prefixes, trailing slashes, order of params, or domain aliases. Feedcanon compares actual feed content, respects the feed's declared self URL, and tests simpler URL alternatives to find the cleanest working one. Perfect for feed readers that need consistent, deduplicated subscriptions.

## Features

### How It Works

1. Fetch the input URL and parse the feed to establish reference content.
2. Extract the feed's declared self URL (`atom:link rel="self"`) and validate it serves identical content.
3. Generate URL variants ordered from cleanest to least clean.
4. Test variants in order—the first one serving identical content wins.
5. Upgrade HTTP to HTTPS if both serve identical content.

### URL Normalization

- Strip www prefix — `www.example.com` → `example.com`
- Strip trailing slashes — `/feed/` → `/feed`
- Strip tracking params — remove 100+ known tracking parameters (UTM, Facebook, Google Ads, etc.)
- Collapse slashes — `//feed///rss` → `/feed/rss`
- Strip fragments — remove `#hash` and text fragments
- Sort query params — alphabetically sort remaining query parameters
- Normalize encoding — standardize percent-encoded characters
- Unicode support — NFC for consistent representation
- Punycode support — convert internationalized domain names

### Customization

- **Custom fetch** — use your own HTTP client (Axios, Got, Ky, etc.)
- **Custom parser** — bring your own parser (Feedsmith by default).
- **Custom tiers** — define your own URL normalization variants.
- **Custom platforms** — add handlers to normalize domain aliases (like FeedBurner).
- **Database lookup** — use `existsFn` to check if a URL already exists in your database.
- **Progress callbacks** — monitor the process with `onFetch`, `onMatch`, and `onExists` callbacks.
- **Type-safe** — full TypeScript support with exported types.
