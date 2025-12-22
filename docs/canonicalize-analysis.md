# Canonicalize Function Analysis

Complete analysis of the `canonicalize` function, its components, states, and test coverage.

## 1. Phases Overview

The function has 6 distinct phases:

1. **Initial Fetch** - Fetch input URL
2. **Self URL Extraction** - Parse feed, extract self URL
3. **Self URL Validation** - Verify self URL returns same content
4. **Variant Generation** - Create normalized URL variants
5. **Variant Testing** - Find cleanest working variant
6. **HTTPS Upgrade** - Try upgrading HTTP to HTTPS

---

## 2. Input Components & Their States

### A. `inputUrl` (string)

| State | Result |
|-------|--------|
| Valid HTTP/HTTPS URL | Proceeds |
| Feed protocol (feed://, rss://, pcast://, itpc://) | Converted to HTTPS |
| Protocol-relative (//example.com) | HTTPS added |
| Bare domain (example.com/feed) | HTTPS added |
| Invalid/malformed | `undefined` |
| Dangerous scheme (javascript:, data:, file:) | `undefined` |
| With IDN/Punycode hostname | Normalized |
| With percent-encoded chars | Normalized |
| With authentication (user:pass@) | Preserved |
| With non-standard port | Preserved |
| With fragment (#section) | Stripped |
| With tracking params | Stripped in variants |
| With www prefix | Stripped in tier 1 |
| With trailing slash | Stripped in tiers 1-2 |
| Mixed case hostname | Lowercased |

### B. `fetchFn` (async function)

| Behavior | Result |
|----------|--------|
| Not provided | Uses `defaultFetchFn` |
| Returns 2xx | Proceeds |
| Returns 4xx/5xx | `undefined` (initial) or skip (variants) |
| Throws exception | `undefined` (initial) or skip (variants) |
| Response URL differs (redirect) | Uses redirect destination |
| Returns empty body | Proceeds (comparison fails) |
| Returns undefined body | Proceeds (comparison fails) |

### C. `parser` (ParserAdapter<T>)

| State | Result |
|-------|--------|
| Not provided | No self URL extraction |
| `parse()` throws | `undefined` |
| `parse()` returns undefined | No self URL, proceeds |
| `parse()` returns valid feed | Extracts self URL |

### D. `hashFn` (function)

| State | Result |
|-------|--------|
| Not provided | Uses MD5 |
| Returns consistent hash | Used for tier 2 comparison |
| Throws exception | Comparison fails, falls back |

### E. `existsFn` (async function)

| State | Result |
|-------|--------|
| Not provided | Skipped |
| Returns `true` | Returns that variant immediately |
| Returns `false` | Continues testing |

### F. `tiers` (NormalizeOptions[])

| State | Result |
|-------|--------|
| Not provided | Uses `defaultTiers` (3 tiers) |
| Custom tiers | Generates variants per tier |
| All produce same URL | Deduped, single variant |

### G. `platforms` (PlatformHandler[])

| State | Result |
|-------|--------|
| Not provided | Uses `[feedburnerHandler]` |
| Handler matches | URL normalized (first match wins) |
| Handler throws | Continues with original URL |
| Multiple match | First handler applied |

---

## 3. Self URL States

| Self URL State | Action |
|----------------|--------|
| Not present (undefined) | Use responseUrl as variantSource |
| Empty string | Use responseUrl as variantSource |
| Same as responseUrl | Use responseUrl (no extra fetch) |
| Different, valid HTTP/HTTPS | Validate with fetch |
| Feed protocol (feed://, etc.) | Convert to HTTPS, validate |
| Protocol-relative | Resolve to HTTPS, validate |
| Relative path | Resolve against responseUrl base |
| With path traversal (../) | Resolve correctly |
| Dangerous scheme | Rejected, use responseUrl |
| Malformed | Rejected, use responseUrl |
| With authentication | Preserved if validates |
| Different port | Preserved if validates |
| With fragment | Fragment stripped |
| FeedBurner alias | Normalized to canonical domain |

---

## 4. Self URL Validation Outcomes

| Scenario | variantSource |
|----------|---------------|
| Self URL fetch succeeds + content matches | Self URL response destination |
| Self URL fetch succeeds + content differs | initialResponseUrl |
| Self URL fetch returns 4xx/5xx | Try alternate protocol |
| Self URL fetch throws | Try alternate protocol |
| Alternate protocol succeeds + matches | Alternate URL response destination |
| Both protocols fail | initialResponseUrl |
| Self URL redirects + content matches | Redirect destination |
| Self URL redirects + content differs | initialResponseUrl |

---

## 5. Response Comparison (3 Tiers)

| Tier | Condition | Result |
|------|-----------|--------|
| 1 | `body1 === body2` | Match |
| 2 | `hash(body1) === hash(body2)` | Match |
| 3 | `JSON.stringify(sig1) === JSON.stringify(sig2)` | Match |
| - | All tiers fail | No match |

### Edge cases

- Either body empty/undefined → No match
- Hash throws → Falls through to tier 3
- Parser throws on compared body → No match
- Parser returns undefined for compared → No match

---

## 6. Variant Testing Outcomes

| Scenario | Result |
|----------|--------|
| existsFn returns true | Return that variant immediately |
| Variant === variantSource | Skip (already verified) |
| Variant === responseUrl | Use as winningUrl, break |
| Fetch succeeds + matches | Use as winningUrl, break |
| Fetch succeeds + differs | Continue to next |
| Fetch returns 4xx/5xx | Continue to next |
| Fetch throws | Continue to next |
| All variants fail/differ | Use variantSource |

---

## 7. HTTPS Upgrade Outcomes

| Scenario | Result |
|----------|--------|
| winningUrl already HTTPS | Skip upgrade, return winningUrl |
| HTTPS fetch succeeds + matches | Return HTTPS URL |
| HTTPS fetch succeeds + differs | Return HTTP URL |
| HTTPS fetch returns 4xx/5xx | Return HTTP URL |
| HTTPS fetch throws | Return HTTP URL |
| prepareUrl returns undefined | Return HTTP URL |

---

## 8. Complete Flow Decision Tree

```
inputUrl
├─ Invalid/non-HTTP → undefined
└─ Valid → initialRequestUrl
   │
   fetchFn(initialRequestUrl)
   ├─ Throws → undefined
   ├─ Non-2xx → undefined
   └─ Success
      │
      responseUrl (after prepareUrl)
      ├─ Invalid → undefined
      └─ Valid
         │
         parser provided?
         ├─ No → selfRequestUrl = undefined
         └─ Yes
            │
            parser.parse()
            ├─ Throws → undefined
            ├─ Returns undefined → selfRequestUrl = undefined
            └─ Returns feed
               │
               parser.getSelfUrl()
               ├─ Returns undefined/empty → selfRequestUrl = undefined
               └─ Returns URL
                  │
                  prepareUrl(selfUrl, responseUrl)
                  ├─ Invalid → selfRequestUrl = undefined
                  └─ Valid → selfRequestUrl set
         │
         Self URL validation needed?
         (selfRequestUrl && selfRequestUrl !== responseUrl && body exists)
         ├─ No → variantSource = responseUrl
         └─ Yes
            │
            For each protocol variant (HTTPS, HTTP or HTTP, HTTPS):
            │
            fetchFn(urlToTry)
            ├─ Throws → try next
            ├─ Non-2xx → try next
            └─ Success
               │
               compareWithInitialResponse()
               ├─ No match → try next
               └─ Match → variantSource = prepareUrl(response.url) or responseUrl
            │
            All fail → variantSource = responseUrl
         │
         Generate variants from variantSource
         │
         For each variant:
         │
         existsFn check
         ├─ Returns true → RETURN variant
         └─ Returns false / not provided
            │
            variant === variantSource? → skip
            variant === responseUrl? → winningUrl = responseUrl, break
            │
            fetchFn(variant)
            ├─ Throws → continue
            ├─ Non-2xx → continue
            └─ Success
               │
               compareWithInitialResponse()
               ├─ No match → continue
               └─ Match → winningUrl = variant, break
         │
         No match found → winningUrl = variantSource
         │
         HTTPS upgrade needed? (winningUrl starts with http://)
         ├─ No → RETURN winningUrl
         └─ Yes
            │
            prepareUrl(https version)
            ├─ Invalid → RETURN winningUrl (http)
            └─ Valid
               │
               fetchFn(httpsUrl)
               ├─ Throws → RETURN winningUrl (http)
               ├─ Non-2xx → RETURN winningUrl (http)
               └─ Success
                  │
                  compareWithInitialResponse()
                  ├─ No match → RETURN winningUrl (http)
                  └─ Match → RETURN httpsUrl
```

---

## 9. Summary Counts

| Component | Variants |
|-----------|----------|
| Input URL states | ~15 |
| fetchFn behaviors | ~6 |
| Parser states | ~4 |
| Self URL states | ~14 |
| Self URL validation outcomes | ~8 |
| Comparison tiers | 3 |
| Variant testing outcomes | ~7 |
| HTTPS upgrade outcomes | ~5 |
| **Total combinations (theoretical)** | **~35,000+** |
| **Meaningful unique paths** | **~100-150** |
