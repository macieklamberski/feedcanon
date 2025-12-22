# NewsBlur Edge Case Research

Research findings on how NewsBlur handles URL edge cases. Based on analysis of the samuelclay/NewsBlur GitHub repository.

## Research Summary

| Case | NewsBlur Behavior | Code Reference | Evidence Quality |
|------|------------------|----------------|------------------|
| Case 37: Platform handler exceptions | Catches multiple exception types during URL fetching | `utils/feed_fetcher.py` | **Strong** - Explicit exception handling found |
| Case 38: Multiple handlers | Uses single `qurl` function for URL manipulation | `utils/feed_fetcher.py` | **Moderate** - No evidence of multiple competing handlers |
| Case 39: IDN/Punycode | No explicit IDN/Punycode normalization found | N/A | **Weak** - No code evidence found |
| Case 40: Port mismatches | Configuration-based, not normalized in canonical URL | Issues #1761, #132, #1414 | **Moderate** - Port handling is config/deployment concern |
| Case 41: IPv6 URLs | Limited support (Redis module only) | `node/node_modules/redis/index.js` | **Weak** - Only Redis connection handling found |
| Case 42: Encoded characters | Encoding fixes for feed content, unclear for URLs | `utils/feed_fetcher.py` | **Moderate** - Feed encoding handling exists |
| Case 43: Dangerous schemes | No explicit blocking of javascript:/data: URLs | N/A | **Weak** - No security validation found |
| Case 44: Malformed URLs | Exception handling for unparseable URLs | Issue #1053, `utils/feed_fetcher.py` | **Strong** - Multiple error handlers |
| Case 45: Credentials in URLs | No explicit stripping found | N/A | **Weak** - No code evidence |
| Case 46: Path traversal | No explicit ../ resolution found | N/A | **Weak** - No code evidence |
| Case 48: Localhost/SSRF | No blocking of localhost/private IPs | N/A | **Weak** - No protection found |
| Case 49: Mixed case hostnames | No explicit hostname lowercasing found | N/A | **Weak** - No code evidence |
| Case 50-54: Algorithm paths | Uses feed hash for duplicate detection | `apps/rss_feeds/models.py` | **Moderate** - Hash-based approach |

## Detailed Findings

### Case 37: Platform handler exceptions

**Finding**: NewsBlur has comprehensive exception handling for URL operations.

**Evidence**:
- Catches `urllib.error.URLError`, `socket.timeout`, `UnicodeEncodeError`, `http.client.InvalidURL`
- Handles `requests.adapters.ConnectionError` and `TimeoutError`
- Feedparser `bozo_exception` handling for `SAXException` and `NonXMLContentType`

**Code**: `utils/feed_fetcher.py`

**Sources**:
- [feed_fetcher.py](https://github.com/samuelclay/NewsBlur/blob/main/utils/feed_fetcher.py)
- [Issue #1053](https://github.com/samuelclay/NewsBlur/issues/1053)

---

### Case 38: Multiple handlers

**Finding**: NewsBlur uses a single URL manipulation library (`qurl`) consistently.

**Evidence**:
- `qurl(address, add={...})` for adding query parameters
- `qurl(new_feed_link, remove=["_"])` for removing parameters
- No evidence of multiple competing URL rewriters

**Code**: `utils/feed_fetcher.py`

**Sources**:
- [feed_fetcher.py](https://github.com/samuelclay/NewsBlur/blob/main/utils/feed_fetcher.py)

---

### Case 39: IDN/Punycode

**Finding**: No explicit internationalized domain name handling found.

**Evidence**: Search for IDN/punycode returned no relevant NewsBlur code.

**Sources**:
- Search yielded only external IDN libraries, not NewsBlur-specific code

---

### Case 40: Port mismatches

**Finding**: Ports are handled through configuration, not normalized in canonical URLs.

**Evidence**:
- Multiple issues about port configuration in Docker deployments
- Issue #132: App runs HTTP (80) but URLs hardcoded to HTTPS (443)
- Issue #1414: Users changing haproxy ports (8080:80, 8443:443)
- No evidence of port normalization in feed URL comparison

**Sources**:
- [Issue #132](https://github.com/samuelclay/NewsBlur/issues/132)
- [Issue #1414](https://github.com/samuelclay/NewsBlur/issues/1414)
- [Issue #1761](https://github.com/samuelclay/NewsBlur/issues/1761)

---

### Case 41: IPv6 URLs

**Finding**: Limited IPv6 support found only in Redis connection handling.

**Evidence**:
- Redis module: `cnx_options.family = (!options.family && net.isIP(cnx_options.host)) || (options.family === 'IPv6' ? 6 : 4);`
- No feed URL IPv6 handling found

**Code**: `node/node_modules/redis/index.js`

**Sources**:
- [redis/index.js](https://github.com/samuelclay/NewsBlur/blob/23bdbb85a1e87275ee65266dc02505a8d6c6d81e/node/node_modules/redis/index.js)

---

### Case 42: Encoded characters

**Finding**: NewsBlur handles character encoding for feed content, unclear for URL percent-encoding.

**Evidence**:
- `preprocess_feed_encoding()` function fixes misencoded UTF-8 in feed content
- Corrects HTML entity double-encoding: `corrected = unescaped.encode("latin1").decode("utf-8", errors="replace")`
- Issue #1359: Invalid encoding in response handling
- No specific URL percent-encoding normalization found

**Code**: `utils/feed_fetcher.py`, `utils/json_functions.py`

**Sources**:
- [feed_fetcher.py](https://github.com/samuelclay/NewsBlur/blob/main/utils/feed_fetcher.py)
- [Issue #1359](https://github.com/samuelclay/NewsBlur/issues/1359)

---

### Case 43: Dangerous schemes

**Finding**: No explicit blocking of dangerous URL schemes (javascript:, data:, etc).

**Evidence**:
- Code checks for `address.startswith("http")` but doesn't block other schemes
- Issue #1833: Open redirect vulnerability reported (security concern)
- No explicit scheme validation against dangerous protocols

**Sources**:
- [feed_fetcher.py](https://github.com/samuelclay/NewsBlur/blob/main/utils/feed_fetcher.py)
- [Issue #1833 - Open Redirect](https://github.com/samuelclay/NewsBlur/issues/1833)

---

### Case 44: Malformed URLs

**Finding**: Multiple layers of exception handling for malformed URLs.

**Evidence**:
- Issue #1053: `IllegalArgumentException: unexpected url` for malformed string "x214w22k71g60836m2mfwk0x2cec ogin"
- Catches `http.client.InvalidURL` during feed fetching
- Feedparser handles malformed XML/RSS with bozo flags
- Returns error codes: 551 (Broken feed), 552 (Non-xml feed)

**Sources**:
- [Issue #1053](https://github.com/samuelclay/NewsBlur/issues/1053)
- [feed_fetcher.py](https://github.com/samuelclay/NewsBlur/blob/main/utils/feed_fetcher.py)

---

### Case 45: Credentials in URLs

**Finding**: No evidence of user:pass@ stripping in feed URLs.

**Evidence**: Search found authentication handling for NewsBlur itself, not for feed URLs with embedded credentials.

**Sources**:
- [settings.py](https://github.com/samuelclay/NewsBlur/blob/master/newsblur_web/settings.py)

---

### Case 46: Path traversal

**Finding**: No explicit path normalization or ../ resolution found.

**Evidence**: No code found handling path traversal patterns in URLs.

---

### Case 48: Localhost/SSRF

**Finding**: No SSRF protection or localhost blocking found.

**Evidence**:
- Issues about localhost access are deployment/config related, not security
- No IP address filtering or private network blocking
- External SSRF prevention resources found, but not implemented in NewsBlur

**Sources**:
- [Issue #1537](https://github.com/samuelclay/NewsBlur/issues/1537)
- [Issue #1711](https://github.com/samuelclay/NewsBlur/issues/1711)

---

### Case 49: Mixed case hostnames

**Finding**: No explicit hostname case normalization found.

**Evidence**: Search for `lower()` on hostnames yielded no results.

---

### Case 50-54: Algorithm paths

**Finding**: NewsBlur uses hash-based duplicate detection rather than canonical URL comparison.

**Evidence**:
- Function `Feed.generate_hash_address_and_link()` for hash generation
- Feed models check for duplicates using hashes
- Issue #957: OPML import checks for duplicates
- Hash-based approach may not rely on URL normalization

**Code**: `apps/rss_feeds/models.py`, `apps/rss_feeds/views.py`

**Sources**:
- [models.py](https://github.com/samuelclay/NewsBlur/blob/master/apps/rss_feeds/models.py)
- [views.py](https://github.com/samuelclay/NewsBlur/blob/master/apps/rss_feeds/views.py)
- [Issue #957](https://github.com/samuelclay/NewsBlur/issues/957)

---

## Key Observations

### What NewsBlur Does Well
1. **Exception handling**: Comprehensive error catching for malformed feeds and network errors
2. **Feed parsing resilience**: Handles broken XML/RSS with feedparser bozo detection
3. **Encoding fixes**: Corrects common feed encoding issues

### What NewsBlur Doesn't Do
1. **URL normalization**: No comprehensive URL canonicalization found
2. **Security validation**: No blocking of dangerous schemes or SSRF protection
3. **IDN handling**: No internationalized domain name normalization
4. **Case normalization**: No hostname lowercasing
5. **Credential stripping**: No user:pass@ removal from URLs

### Architecture Notes
- NewsBlur uses hash-based duplicate detection, which may reduce need for precise URL canonicalization
- Focus is on resilience (handling broken feeds) rather than URL normalization
- Security concerns (open redirect issue) suggest URL validation could be improved

---

## Research Methodology

**Approach**: Web search of GitHub repository + issue tracker analysis

**Limitations**:
- Could not access full source code directly
- Some searches returned no results (may exist but not indexed)
- Evidence quality varies (strong for issues/exceptions, weak for missing features)

**Evidence Quality Levels**:
- **Strong**: Explicit code/issues found
- **Moderate**: Indirect evidence or partial implementation
- **Weak**: No evidence found (absence of evidence)

---

## Sources

All findings based on the NewsBlur GitHub repository (samuelclay/NewsBlur):
- [Main Repository](https://github.com/samuelclay/NewsBlur)
- [utils/feed_fetcher.py](https://github.com/samuelclay/NewsBlur/blob/main/utils/feed_fetcher.py)
- [apps/rss_feeds/models.py](https://github.com/samuelclay/NewsBlur/blob/master/apps/rss_feeds/models.py)
- Various GitHub issues referenced inline

---

*Research conducted: 2025-12-19*
