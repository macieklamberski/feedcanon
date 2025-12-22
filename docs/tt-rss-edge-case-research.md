# TT-RSS Edge Case Research

This document analyzes how Tiny Tiny RSS (tt-rss) handles various edge cases related to URL processing, normalization, and security. The research focuses on the `UrlHelper.php` class, which is the primary component responsible for URL validation, normalization, and fetching.

## Research Summary Table

| Case | tt-rss Behavior | Code Reference |
|------|----------------|----------------|
| **Case 37: Platform Handler Exceptions** | No platform handler pattern exists in tt-rss. URL processing is handled directly in UrlHelper.php without a plugin-based handler architecture for URL rewriting. However, article filter plugins (like af_readability, af_redditimgur) can modify URLs post-fetch. The `fetch()` method catches exceptions (`GuzzleException`, `LengthException`, `BadResponseException`) and handles them gracefully with retry logic for specific errors (403 with auth, encoding errors). | `classes/UrlHelper.php` - `fetch()` method with try-catch blocks for `LengthException` and `GuzzleException`. Exception context preserved in `$fetch_last_error`. |
| **Case 38: Multiple Handlers** | tt-rss uses a plugin-based architecture for article filters (not URL handlers). Multiple plugins can be enabled simultaneously via `hook_article_filter`. Filters are loaded in user-specified order and applied sequentially. It's possible to reorder filters using drag and drop. The UrlHelper itself doesn't have multiple handler support - it's a single-purpose class. | Plugin system via `classes/pluginhost.php` with hooks like `hook_article_filter`, `hook_fetch_feed`. Documented at https://git.tt-rss.org/fox/tt-rss/wiki/Plugins. No specific URL handler chain in UrlHelper. |
| **Case 39: IDN/Punycode** | tt-rss normalizes international domain names using `idn_to_ascii()` with proper UTS46 variant support. The implementation first checks if the hostname is non-ASCII using `mb_detect_encoding()`, then applies IDN conversion. Uses `INTL_IDNA_VARIANT_UTS46` with `IDNA_NONTRANSITIONAL_TO_ASCII` flag when available (PHP 5.4+), otherwise falls back to basic `idn_to_ascii()`. Returns `false` if conversion fails. | `classes/UrlHelper.php` - `validate()` method: `if (function_exists("idn_to_ascii")) { if (mb_detect_encoding($tokens['host']) != 'ASCII') { if (defined('IDNA_NONTRANSITIONAL_TO_ASCII') && defined('INTL_IDNA_VARIANT_UTS46')) { $tokens['host'] = idn_to_ascii($tokens['host'], IDNA_NONTRANSITIONAL_TO_ASCII, INTL_IDNA_VARIANT_UTS46); } } }` |
| **Case 40: Port Mismatches** | tt-rss has configurable port restrictions via the `ALLOW_PORTS` configuration option. By default, only ports 80 and 443 are allowed for feed subscriptions. The `validate()` method enforces port restrictions only when `$extended_filtering` is true: `if (!in_array($tokens['port'] ?? '', [80, 443, ''])) return false;`. Users can override this via environment variable (e.g., `ALLOW_PORTS=1200,3000`). The `get_self_url()` function in Config.php preserves non-standard ports when constructing self URLs. | `classes/UrlHelper.php` - `validate()` method with port check. `classes/Config.php` - `get_self_url()` preserves `$_SERVER["HTTP_HOST"]` including port. Configuration: `ALLOW_PORTS` option documented in community forums. |
| **Case 41: IPv6 URLs** | tt-rss has **incomplete IPv6 support**. The `has_disallowed_ip()` method only checks for IPv6 loopback addresses (`::1` and `0:0:0:0:0:0:0:1`). A TODO comment explicitly states: "Improve IPv6 support (fc00::/7 unique local, fe80::/10 link-local)". Unique local addresses (`fc00::/7`) and link-local addresses (`fe80::/10`) are **not validated**, creating potential SSRF vulnerabilities for IPv6 endpoints. | `classes/UrlHelper.php` - `has_disallowed_ip()` method: `'::1'` and `'0:0:0:0:0:0:0:1'` checks, plus comment: "TODO: Improve IPv6 support (fc00::/7 unique local, fe80::/10 link-local)". |
| **Case 42: Encoded Characters** | tt-rss normalizes percent-encoded characters in URL paths by decoding then re-encoding consistently. The implementation uses `rawurldecode()` followed by `rawurlencode()` for each path segment: `$tokens_filter_var['path'] = implode('/', array_map(rawurlencode(...), array_map(rawurldecode(...), explode('/', $tokens['path']))));`. This ensures consistent encoding before passing to `filter_var()` for validation. However, this normalization is only applied to path components, not query strings or fragments. | `classes/UrlHelper.php` - `validate()` method creates alternate tokens for validation with normalized percent-encoding in paths. |
| **Case 43: Dangerous Schemes** | tt-rss uses a **whitelist approach** for URL schemes. The `validate()` method only allows `http` and `https` schemes: `if (!in_array(strtolower($tokens['scheme']), ['http', 'https'])) return false;`. For special contexts (like `<a href>` in sanitized content), additional schemes are permitted: `magnet`, `mailto`, `tel`. Base64 data URIs (`data:image/*;base64,...`) are restricted to `<img src>` attributes only. `javascript:` and generic `data:` schemes are implicitly blocked. | `classes/UrlHelper.php` - `validate()` method: `if (!in_array(strtolower($tokens['scheme']), ['http', 'https'])) return false;`. Community discussion at https://community.tt-rss.org/t/data-image-in-src-breaks-the-image/4724 documents data URI handling. |
| **Case 44: Malformed URLs** | tt-rss handles malformed URLs by relying on PHP's `parse_url()` function, which returns `false` for seriously malformed URLs. The `validate()` method checks for presence of required components (host, scheme) rather than catching parse errors explicitly: `if (empty($tokens['host'])) return false;`. When `parse_url()` fails or returns incomplete tokens, validation returns `false`. No exceptions are thrown - failures are silent. Error messages are clarified in commit 3dd4169b5f. | `classes/UrlHelper.php` - `validate()` method: `$tokens = parse_url($url);` followed by checks like `if (empty($tokens['host'])) return false;`. Commit: https://git.tt-rss.org/verifiedjoseph/tt-rss/commit/3dd4169b5f25252bdec2037867c11814286afb75 |
| **Case 45: Credentials in URLs** | tt-rss **does not strip credentials** from URLs (`user:pass@host`). The `parse_url()` function extracts credentials into separate tokens (`$tokens['user']`, `$tokens['pass']`), but the `validate()` method does not explicitly remove or sanitize them. The `fetch()` method supports HTTP authentication via separate `$login` and `$pass` parameters with configurable auth types (basic, digest, any). Credentials in the URL itself are **preserved** and may be passed through. | `classes/UrlHelper.php` - `validate()` method uses `parse_url()` which extracts credentials but doesn't remove them. `fetch()` method has separate `$login`, `$pass` parameters with auth type handling. No explicit credential stripping found. |
| **Case 46: Path Traversal** | tt-rss **does not normalize path traversal sequences** (`../`, `./`). The `rewrite_relative()` method handles relative URLs by appending `dirname()` of the base path per RFC 3986 Section 5.2.2, but it does not resolve or normalize `..` segments. The method distinguishes between absolute paths (`/test.html`), dot-slash paths (`./test.html`), and relative paths, but constructs new URLs without normalizing traversal operators. Two commented lines in the code suggest normalization was considered but disabled. | `classes/UrlHelper.php` - `rewrite_relative()` method uses `dirname($parts['path'])` to construct base paths but doesn't normalize `../` sequences. Note: code contains commented-out normalization logic. |
| **Case 48: Localhost/SSRF** | tt-rss **implements SSRF prevention** via `has_disallowed_ip()`. The method blocks: (1) Literal `'localhost'` string, (2) IPv4 loopback range (`127.*`), (3) IPv6 loopback (`::1`, `0:0:0:0:0:0:0:1`), (4) Link-local addresses (`169.254.*`), (5) Private IPv4 ranges (`10.*`, `192.168.*`, `172.16-31.*`) when using non-standard ports. **Standard ports (80/443) bypass private IP restrictions** - a design decision to allow internal feed access. Optional hostname resolution via `gethostbyname()` when `$validate_resolved_ip` is true. The `fetch()` method validates each redirect URL to prevent SSRF via redirect chains. | `classes/UrlHelper.php` - `has_disallowed_ip()` method with checks for: `str_starts_with($host, '127.')`, `'::1'`, `'169.254.'`, private ranges with regex `'172.(1[6-9]|2[0-9]|3[0-1]).'`. Port-based bypass for standard ports. Redirect validation in `fetch()` via `on_redirect` callback. |
| **Case 49: Mixed Case Hostnames** | tt-rss uses `strtolower()` for **scheme normalization** (`strtolower($tokens['scheme'])`) but hostname casing appears **unchanged** in the main `validate()` method. The `has_disallowed_ip()` method applies `strtolower()` to hostnames when comparing against literal strings like `'localhost'`. PHP's `parse_url()` preserves hostname case, and there's no explicit normalization to lowercase before validation. This could lead to case-sensitivity issues in URL comparisons. | `classes/UrlHelper.php` - `validate()` method: `strtolower($tokens['scheme'])` for scheme comparison. `has_disallowed_ip()` applies `strtolower()` for string comparisons. No explicit hostname lowercasing in validation. |
| **Case 50-54: Algorithm Paths** | tt-rss **does not implement variant generation or canonicalization optimization patterns** similar to feedcanon. The UrlHelper focuses on validation and fetching, not canonicalization. URL processing is sequential and deterministic - there are no tiered algorithms or variant testing patterns. The `rewrite_relative()` method handles relative URL resolution per RFC 3986 but doesn't generate multiple URL variants. The `fetch()` method has retry logic for specific errors (403 with auth, encoding errors) but this is error recovery, not optimization. Plugin filters can modify URLs post-fetch, but this is done sequentially in user-defined order, not through parallel variant testing. | No comparable algorithm found. UrlHelper is focused on validation/fetch, not canonicalization. Plugin system allows sequential URL modification via `hook_article_filter`, but no variant generation pattern exists. |

## Key Findings

### Security Implementation

1. **SSRF Protection**: Moderate - Blocks most localhost/private IPs but has IPv6 gaps and allows private IPs on standard ports
2. **Scheme Validation**: Strong - Strict whitelist of allowed schemes (http/https only for feeds)
3. **IDN Handling**: Strong - Proper UTS46 variant support with fallback
4. **Path Traversal**: None - No normalization of `../` sequences
5. **Credential Handling**: Weak - Credentials preserved in URLs, not stripped

### Notable Gaps

1. **Incomplete IPv6 Support**: Explicitly documented as TODO - fc00::/7 and fe80::/10 not blocked
2. **No Path Normalization**: Traversal sequences passed through unchanged
3. **Credentials Not Sanitized**: User:pass@ preserved in URLs
4. **Case Sensitivity**: Hostnames not normalized to lowercase
5. **Port Bypass**: Private IPs accessible on standard ports (design decision, not bug)

### Architecture Differences from feedcanon

1. **No Canonicalization**: tt-rss validates and fetches URLs but doesn't canonicalize them
2. **No Variant Generation**: Single URL processing path, no optimization attempts
3. **Plugin-Based Extension**: URL modification happens via plugins, not built-in handlers
4. **Sequential Processing**: Filters applied in order, not parallel variant testing
5. **Fetch-Focused**: Primary purpose is reliable fetching with retry logic, not URL cleanup

## Code References

### Main File

- **classes/UrlHelper.php**: Primary URL handling class
  - `validate($url, $extended_filtering = false)`: URL validation with scheme/host/IDN/encoding checks
  - `fetch($url, $options)`: URL fetching with Guzzle, exception handling, and retry logic
  - `rewrite_relative($url, $rel_url)`: Relative URL resolution per RFC 3986
  - `has_disallowed_ip($host, $port, $scheme)`: SSRF prevention via IP/hostname checking

### Plugin System

- **classes/pluginhost.php**: Plugin architecture with hooks
  - `hook_article_filter`: Modify article data including URLs
  - `hook_fetch_feed`: Override feed fetching mechanism
  - Documentation: https://git.tt-rss.org/fox/tt-rss/wiki/Plugins

### Configuration

- **classes/Config.php**: Configuration including self URL construction
  - `get_self_url()`: Constructs fully-qualified tt-rss URLs preserving ports

## Community Issues & Discussions

1. **Port Restrictions**: https://github.com/HenryQW/Awesome-TTRSS/pull/207 - Allow non-80/443 ports
2. **Data URI Handling**: https://community.tt-rss.org/t/data-image-in-src-breaks-the-image/4724
3. **Non-Latin Characters**: https://community.tt-rss.org/t/empty-links-due-to-validate-url-filter-var/3859
4. **Relative URL Issues**: https://community.tt-rss.org/t/af-readability-relative-urls-not-rewritten-correctly/5322

## Sources

- [Tiny Tiny RSS GitHub Repository](https://github.com/tt-rss/tt-rss)
- [tt-rss Official Documentation](https://tt-rss.org/docs/)
- [tt-rss Community Forums](https://community.tt-rss.org/)
- [FeedIron Plugin (URL Rewriting)](https://github.com/feediron/ttrss_plugin-feediron)
- [Guzzle HTTP Client Documentation](https://docs.guzzlephp.org/en/stable/quickstart.html)
- [PHP parse_url() Manual](https://www.php.net/manual/en/function.parse_url.php)
- [PHP idn_to_ascii() Manual](https://github.com/php/doc-en/blob/master/reference/intl/idn/idn-to-ascii.xml)
- [FreshRSS IDN Deprecation Issue](https://github.com/FreshRSS/FreshRSS/issues/1699)
- [OWASP Path Traversal](https://owasp.org/www-community/attacks/Path_Traversal)

## Research Methodology

This research was conducted by:

1. Analyzing the raw source code of `classes/UrlHelper.php` from the tt-rss main branch
2. Searching GitHub for related issues, pull requests, and commit history
3. Reviewing community forum discussions about URL handling edge cases
4. Examining plugin implementations (FeedIron, af_readability, af_redditimgur)
5. Cross-referencing with related PHP RSS readers (FreshRSS, Full-Text RSS)
6. Analyzing exception handling patterns in Guzzle HTTP client integration

The findings represent the state of tt-rss as of the main branch on December 19, 2025.
