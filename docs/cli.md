---
title: CLI
---

# CLI

Feedcanon ships a `feedcanon` command that finds the canonical URL of a feed from a terminal and shows every request it made along the way. It's useful for checking how a feed resolves before writing any code, or for attaching the steps to a bug report.

## Usage

Run it without installing:

::: code-group

```bash [npm]
npx feedcanon https://example.com/feed
```

```bash [yarn]
yarn dlx feedcanon https://example.com/feed
```

```bash [pnpm]
pnpm dlx feedcanon https://example.com/feed
```

```bash [bun]
bunx feedcanon https://example.com/feed
```

:::

Or install the package and call `feedcanon` directly:

```bash
feedcanon <url> [options]
```

The command takes one URL. To check several feeds, call it once for each.

## Options

| Flag | Description |
|------|-------------|
| `--json` | Print one JSON object instead of the URL and summary |
| `--verbose` | Log every request to stderr, also when it is not a terminal |
| `--no-rewrites` | Turn off the Blogger and FeedBurner rewrites |
| `--no-probes` | Turn off the WordPress probe |
| `-h`, `--help` | Show help |

## Rewrites and Probes

The CLI turns on [`bloggerRewrite`](/guides/customization/url-rewrites#blogger-blogspot), [`feedburnerRewrite`](/guides/customization/url-rewrites#feedburner) and [`wordpressProbe`](/guides/customization/url-probes#wordpress) by default. `findCanonical` turns them on only when you pass them. Someone running the CLI is usually checking a real feed and wants the URL worth storing, so the CLI includes them.

To get the result `findCanonical` gives with its defaults, pass both flags:

```bash
npx feedcanon https://example.com/?feed=rss2 --no-rewrites --no-probes
```

## Output

Stdout gets the canonical URL, then a summary line with the number of requests and the size of the downloaded responses:

```bash
npx feedcanon https://example.com/?feed=rss2

# https://example.com/feed
# 2 requests, 48.3 kB
```

To use the URL alone in a script, take the first line:

```bash
url=$(npx feedcanon https://example.com/?feed=rss2 | head -1)
```

When no canonical URL is found, stdout stays empty and the message and summary go to stderr.

### Request Log

In a terminal, every request is logged to stderr as it finishes: the method, the URL, the status, the time it took, and, after a redirect, each redirect status and the URL it ended at. A URL that serves the same feed as the input gets a `match` line:

```
GET http://www.example.com/feed/?utm_source=x 301 → 200 412 ms → https://www.example.com/feed/?utm_source=x
match http://www.example.com/feed/?utm_source=x
GET https://example.com/feed 200 380 ms
match https://example.com/feed
```

A request that fails without a response shows its error in place of the status. When stderr is not a terminal, the log is skipped unless you pass `--verbose`.

### JSON

With `--json`, stdout gets one object instead: the input URL, the result, every request and the totals. The result is `null` when no canonical URL is found.

```bash
npx feedcanon https://example.com/feed --json

# {
#   "url": "https://example.com/feed",
#   "result": "https://example.com/feed",
#   "requests": [
#     {
#       "method": "GET",
#       "url": "https://example.com/feed",
#       "status": 200,
#       "responseUrl": "https://example.com/feed",
#       "redirects": [],
#       "bytes": 24180,
#       "ms": 380
#     }
#   ],
#   "totals": {
#     "requests": 1,
#     "bytes": 24180,
#     "ms": 381
#   }
# }
```

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | A canonical URL was found |
| `1` | No canonical URL was found, for example because the feed could not be fetched or parsed |
| `2` | Invalid arguments: a missing URL, an extra argument or an unknown flag |
