# Miniflux v2 Edge Cases Research

Research conducted on 2025-12-19 to understand how Miniflux handles specific edge cases related to URL canonicalization and feed processing.

## Summary Table

| Case | Miniflux Behavior | Code Reference | Notes |
|------|------------------|----------------|-------|
| **37: Platform handler exceptions** | No panic recovery in content rewrite handlers | `internal/reader/rewrite/content_rewrite.go` - `ApplyContentRewriteRules()` | If any rewrite handler panics, it crashes the entire operation. No defer-recover mechanism. URL rewriting has error handling for invalid regex patterns and logs errors instead of crashing. Historical panics reported in issues #2741, #1631, #1001. |
| **38: Multiple handlers** | Has 12+ predefined rewrite rules that can be combined | `internal/reader/rewrite/content_rewrite_rules.go`, official docs | Handlers: `add_image_title`, `add_dynamic_image`, `add_dynamic_iframe`, `add_youtube_video`, `add_youtube_video_from_id`, `add_invidious_video`, `use_invidious_player`, `replace()`, `remove()`, `remove_tables`, `remove_clickbait`, plus custom URL rewriting. All executed sequentially. |
| **39: IDN/Punycode** | Relies on Go's `net/url` standard library | `internal/urllib/url.go` | No explicit IDN normalization found. Go's `net/url.Parse()` handles IDN implicitly but doesn't perform Punycode conversion or normalization automatically. No evidence of using `golang.org/x/net/idna` package. |
| **40: Port mismatches** | Bug: non-standard ports stripped in media proxy | Issue #2769 | With `BASE_URL=https://example.com:88/`, media proxy URLs incorrectly become `https://example.com/proxy/...` (missing port). Standard ports (80, 443) handling not explicitly documented. |
| **41: IPv6 URLs** | Not explicitly handled | Release 2.1.1 (URL validation improvements) | No specific IPv6 validation found. Go's `net/url` handles IPv6 bracket notation implicitly. Version 2.1.1 added "more URL validation in media proxy" but no IPv6-specific mention. |
| **42: Encoded characters** | Uses Go's `net/url` parsing (implicit decoding) | `internal/urllib/url.go`, Issue #540 | Go's `url.Parse()` handles percent-encoding. Known issue #540: query strings aren't re-encoded properly - `url.String()` doesn't encode query strings, causing malformed URLs. Media proxy uses base64 encoding for URLs (`ui/proxy.go`). |
| **43: Dangerous schemes** | Whitelist of 35+ allowed schemes | `internal/reader/sanitizer/sanitizer.go` - `validURISchemes`, `hasValidURIScheme()` | Allowed: `http:`, `https:`, `mailto:`, `tel:`, `ftp:`, `magnet:`, etc. Blocked: `javascript:`, `data:` (except image data URIs), `vbscript:`, etc. Version 2.0.25 added "Do not proxy image with a data URL". XSS vulnerability CVE-2023-27592 in broken image handling (fixed in 2.0.43). |
| **44: Malformed URLs** | Silent error suppression with fallback | `internal/reader/sanitizer/sanitizer.go` | Uses `parsedURL, _ := url.Parse()` pattern - errors ignored. When parsing fails, invalid URLs are skipped via `continue` statements, stripping them from output. No user-facing error messages. Logs warnings for invalid rewrite rules. |
| **45: Credentials in URLs** | Supported for HTTP Basic Auth | Issue #105, Client API docs | API client supports `NewClient(url, username, password)`. Issue #105 discusses HTTP Basic Auth for feeds - encoding credentials in URL is "prohibitive because the data shows up in logs". Support for feed-level credentials exists in `fetcher.NewRequestBuilder().WithUsernameAndPassword()`. |
| **46: Path traversal** | Likely uses Go's `url.ResolveReference()` | `internal/urllib/url.go` - `AbsoluteURL()` | `AbsoluteURL()` uses Go's `url.ResolveReference()` for relative→absolute conversion. Go's standard library normalizes `../` automatically. No explicit `path.Clean()` calls found. No path traversal issues in public security advisories. |
| **48: Localhost/SSRF** | Default allowed network: 127.0.0.1/8 | Man pages, Issue #888 | Metrics endpoint restricts access to `127.0.0.1/8` by default (configurable). No evidence of feed URL localhost blocking for SSRF prevention. Issue #888: Docker users can't use `127.0.0.1` for container-to-container communication (networking limitation, not security feature). Headers like `X-Forwarded-For` explicitly not trusted for IP validation. |
| **49: Mixed case hostnames** | Case-insensitive hostname matching in specific contexts | Release 2.1.1 | Version 2.1.1: "use case-insensitive matching to find (fav)icons" and simplified `isValidIframeSource` by extracting hostname and comparing directly. No evidence of explicit `strings.ToLower()` on hostnames in URL normalization. Go's `net/url` preserves hostname case in `url.Host`. |
| **50-54: Algorithm paths** | Not applicable (no custom canonicalization algorithm) | - | Miniflux doesn't implement a custom URL canonicalization algorithm with optimization paths. Uses Go's `net/url` standard library for all URL parsing, normalization, and resolution. |

## Detailed Findings

### URL Processing Architecture

Miniflux uses several layers for URL processing:

1. **`internal/urllib/url.go`** - Core URL utilities:
   - `IsRelativePath()`, `IsAbsoluteURL()`, `IsHTTPS()`
   - `AbsoluteURL()` - Converts relative→absolute using Go's `url.ResolveReference()`
   - `RootURL()`, `Domain()`, `DomainWithoutWWW()`
   - No custom normalization beyond standard library

2. **`internal/reader/sanitizer/sanitizer.go`** - Security filtering:
   - `validURISchemes` list (35+ allowed protocols)
   - `hasValidURIScheme()`, `isBlockedResource()`
   - Data URI restrictions (only image types allowed)
   - Tracking parameter removal via `urlcleaner.RemoveTrackingParameters()`
   - Silent error suppression pattern: `parsedURL, _ := url.Parse(baseURL)`

3. **`internal/reader/rewrite/`** - Content transformation:
   - `url_rewrite.go` - Regex-based URL rewriting with error handling
   - `content_rewrite.go` - HTML content manipulation (NO panic recovery)
   - Both have logging but limited error propagation

4. **`internal/http/request/`** - HTTP client:
   - Request builder with timeout, auth, proxy support
   - No visible SSRF protection or localhost blocking in handler layer

### Security Considerations

**Strengths:**
- Comprehensive URI scheme whitelist blocking dangerous protocols
- Tracking parameter stripping
- Iframe domain whitelist
- Error handling in URL rewriting (logs errors, doesn't crash)

**Weaknesses:**
- No panic recovery in content rewrite handlers (can crash on malformed HTML)
- Silent URL parse error suppression (fails closed: strips invalid URLs)
- No explicit SSRF protection for feed URLs
- No IDN normalization (relies on browser/client behavior)
- Port number bug in media proxy (#2769)
- Query string encoding issues (#540)

**Known Vulnerabilities (Fixed):**
- CVE-2023-27592: XSS via broken image URLs (fixed in 2.0.43)
- CVE-2023-27591: Metrics endpoint IP spoofing (fixed - now uses `r.RemoteAddr`)
- Open redirect via protocol-relative URLs (fixed in 2.2.15)

### Key Differences from FeedCanon

1. **No explicit canonicalization**: Miniflux doesn't implement URL canonicalization for deduplication - it relies on exact URL matching plus user-provided regex rewrite rules
2. **Security-first vs. Normalization-first**: Focuses on sanitization/security over URL normalization
3. **Silent failures**: Invalid URLs are stripped without user notification
4. **No hostname lowercasing**: Preserves original case (Go's `net/url` behavior)
5. **No port normalization**: Doesn't remove default ports or normalize port numbers (actually has bugs adding non-standard ports)

## Sources

### Code Files (Raw GitHub)
- [internal/urllib/url.go](https://raw.githubusercontent.com/miniflux/v2/main/internal/urllib/url.go)
- [internal/reader/sanitizer/sanitizer.go](https://raw.githubusercontent.com/miniflux/v2/main/internal/reader/sanitizer/sanitizer.go)
- [internal/reader/rewrite/content_rewrite.go](https://raw.githubusercontent.com/miniflux/v2/main/internal/reader/rewrite/content_rewrite.go)
- [internal/reader/rewrite/url_rewrite.go](https://raw.githubusercontent.com/miniflux/v2/main/internal/reader/rewrite/url_rewrite.go)

### Repository Structure
- [internal/urllib](https://github.com/miniflux/v2/tree/main/internal/urllib)
- [internal/reader/sanitizer](https://github.com/miniflux/v2/tree/main/internal/reader/sanitizer)
- [internal/reader/rewrite](https://github.com/miniflux/v2/tree/main/internal/reader/rewrite)
- [internal/http](https://github.com/miniflux/v2/tree/main/internal/http)

### Issues & Discussions
- [Issue #105: HTTP Basic Auth for feeds](https://github.com/miniflux/v2/issues/105)
- [Issue #540: Query strings aren't encoded](https://github.com/miniflux/v2/issues/540)
- [Issue #888: Localhost URL subscriptions (Docker)](https://github.com/miniflux/v2/issues/888)
- [Issue #1126: Rewrite Rule Replace issues](https://github.com/miniflux/v2/issues/1126)
- [Issue #1631: Panic in 2.0.40](https://github.com/miniflux/v2/issues/1631)
- [Issue #2273: Rewrite rules behaviour](https://github.com/miniflux/v2/issues/2273)
- [Issue #2741: Panic serving YouTube feed](https://github.com/miniflux/v2/issues/2741)
- [Issue #2769: Media Proxy URI port composition error](https://github.com/miniflux/v2/issues/2769)
- [PR #1001: Web manifest panic fix](https://github.com/miniflux/v2/pull/1001)
- [PR #1746: XSS fix in proxy handler](https://github.com/miniflux/v2/pull/1746)

### Security Advisories
- [CVE-2023-27592: XSS in proxy handler](https://github.com/miniflux/v2/security/advisories/GHSA-mqqg-xjhj-wfgw)
- [CVE-2023-27591: Metrics endpoint IP spoofing](https://github.com/miniflux/v2/pull/1745)
- [Open redirect via protocol-relative URLs](https://github.com/miniflux/v2/security/advisories/GHSA-wqv2-4wpg-8hc9)

### Documentation
- [Filter, Rewrite, and Scraper Rules](https://miniflux.app/docs/rules.html)
- [Miniflux v2 Releases](https://github.com/miniflux/v2/releases)
- [Release 2.0.25](https://github.com/miniflux/v2/releases/tag/2.0.25)
- [Release 2.0.43](https://github.com/miniflux/v2/releases/tag/2.0.43)
- [Release 2.0.47](https://github.com/miniflux/v2/releases/tag/2.0.47)
- [Release 2.1.1](https://github.com/miniflux/v2/releases/tag/2.1.1)
- [Release 2.1.2](https://github.com/miniflux/v2/releases/tag/2.1.2)
- [Release 2.2.10](https://github.com/miniflux/v2/releases/tag/2.2.10)
- [Release 2.2.14](https://github.com/miniflux/v2/releases/tag/2.2.14)

### Related Resources
- [Miniflux v2 main repository](https://github.com/miniflux/v2)
- [Scraper and Rewrite Rules Discussions](https://github.com/miniflux/v2/discussions/categories/scraper-and-rewrite-rules)
- [Golang net/url documentation](https://pkg.go.dev/net/url)
- [Golang x/net/idna](https://github.com/golang/net/blob/master/idna/punycode.go)

## Methodology

This research was conducted using:
1. GitHub web search for issues, PRs, and security advisories
2. Direct file access via raw.githubusercontent.com for code analysis
3. Release notes analysis across versions 2.0.x - 2.2.x
4. Security advisory review
5. Documentation review

Research limitations:
- Some internal HTTP client files returned 404 errors
- Cannot execute code or run tests
- Based on main branch as of 2025-12-19
- May not capture all unreported edge cases
