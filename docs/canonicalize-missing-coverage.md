# Missing Test Coverage Analysis

Analysis of critical paths not yet covered by existing tests in `canonicalize.test.ts`.

---

## Critical Missing Paths (High Priority)

### 1. Input URL Protocol Handling

**Not tested:** Feed protocols in INPUT URL (not just self URL)

```typescript
// Case: feed:// protocol in input URL
const value = 'feed://example.com/rss.xml'
// Should convert to https://example.com/rss.xml and fetch
```

```typescript
// Case: feed:https:// wrapped protocol
const value = 'feed:https://example.com/rss.xml'
// Should unwrap to https://example.com/rss.xml
```

```typescript
// Case: rss:// protocol
const value = 'rss://example.com/feed'
```

```typescript
// Case: pcast:// protocol (podcasts)
const value = 'pcast://example.com/podcast.xml'
```

```typescript
// Case: itpc:// protocol (iTunes)
const value = 'itpc://example.com/podcast.xml'
```

### 2. Input URL Without Protocol

**Not tested:** Bare domain and protocol-relative input URLs

```typescript
// Case: Bare domain input
const value = 'example.com/feed.xml'
// Should add https:// and fetch
```

```typescript
// Case: Protocol-relative input
const value = '//example.com/feed.xml'
// Should add https: and fetch
```

### 3. Invalid Input URL (Early Return)

**Not tested:** Invalid input URL returns undefined without fetch

```typescript
// Case: Completely invalid URL
const value = 'not a url at all :::'
// Should return undefined immediately, no fetch attempted
```

```typescript
// Case: file:// scheme input
const value = 'file:///etc/passwd'
// Should return undefined (non-HTTP rejected)
```

```typescript
// Case: javascript: scheme input
const value = 'javascript:alert(1)'
// Should return undefined
```

### 4. Comparison Tier 3 Edge Cases

**Not tested:** parser.parse fails on COMPARED body (not initial)

```typescript
// Case: Compared body fails to parse (Tier 3 catch block L104-106)
// Initial body parses fine, but variant/self body throws
const options = {
  parser: {
    parse: (body) => {
      if (body.includes('invalid')) throw new Error('Parse error')
      return body
    },
    getSelfUrl: () => 'https://example.com/rss.xml',
    getSignature: (feed) => ({ content: feed }),
  },
  fetchFn: createMockFetch({
    'https://example.com/feed': { body: '<valid>feed</valid>' },
    'https://example.com/rss.xml': { body: '<invalid>feed</invalid>' },
  }),
}
// Self URL should be rejected, fall back to responseUrl
```

**Not tested:** parser.parse returns undefined on COMPARED body

```typescript
// Case: Compared body returns undefined from parse (L98 check)
const options = {
  parser: {
    parse: (body) => body.includes('valid') ? body : undefined,
    getSelfUrl: () => 'https://example.com/rss.xml',
    getSignature: (feed) => ({ content: feed }),
  },
  fetchFn: createMockFetch({
    'https://example.com/feed': { body: '<valid>feed</valid>' },
    'https://example.com/rss.xml': { body: '<nope>feed</nope>' },
  }),
}
// Tier 3 should not match, fall back to responseUrl
```

### 5. Self URL Validation - Empty Body Response

**Not tested:** Self URL fetch succeeds but returns empty body

```typescript
// Case: Self URL returns 200 but empty body
const options = {
  fetchFn: createMockFetch({
    'https://example.com/feed': { body: '<feed>content</feed>' },
    'https://example.com/rss.xml': { body: '' },  // Empty!
  }),
  parser: createMockParser('https://example.com/rss.xml'),
}
// compareWithInitialResponse should return false (L78 check)
// Should fall back to responseUrl
```

### 6. Self URL Protocol Fallback - Second Protocol Different Content

**Not tested:** First protocol fails, second succeeds with DIFFERENT content

```typescript
// Case: HTTPS fails (4xx), HTTP succeeds but different content
const options = {
  fetchFn: createMockFetch({
    'https://example.com/feed': { body: '<feed>original</feed>' },
    'https://other.example.com/rss': { status: 404 },
    'http://other.example.com/rss': { body: '<feed>different</feed>' },
  }),
  parser: createMockParser('https://other.example.com/rss'),
}
// Should fall back to responseUrl after both protocol variants fail to match
```

### 7. prepareUrl Returns Undefined for Self URL Redirect

**Not tested:** Self URL redirects to invalid URL (L136 fallback)

```typescript
// Case: Self URL redirect destination fails prepareUrl
const options = {
  fetchFn: async (url) => {
    if (url === 'https://example.com/feed') {
      return { status: 200, url, body: '<feed/>', headers: new Headers() }
    }
    if (url === 'https://self.example.com/rss') {
      // Redirect to file:// URL (will fail prepareUrl)
      return { status: 200, url: 'file:///invalid', body: '<feed/>', headers: new Headers() }
    }
    throw new Error('Unexpected')
  },
  parser: createMockParser('https://self.example.com/rss'),
}
// Should use initialResponseUrl as fallback
```

---

## Medium Priority Missing Paths

### 8. Variant Fetch Throws Explicitly

**Partially tested:** Mocks just don't have URL, but no explicit throw test for variants

```typescript
// Case: Variant fetch throws network error
const options = {
  fetchFn: async (url) => {
    if (url === 'https://www.example.com/feed') {
      return { status: 200, url, body: '<feed/>', headers: new Headers() }
    }
    if (url === 'https://example.com/feed') {
      throw new Error('Connection refused')
    }
    throw new Error('Unexpected')
  },
}
// Should skip variant and continue to next
```

### 9. HTTPS Upgrade - prepareUrl Returns Undefined

**Not tested:** HTTPS upgrade URL fails prepareUrl (L201-203)

```typescript
// Case: HTTP winning URL, but HTTPS version fails prepareUrl
// This is an edge case - hard to trigger since if HTTP works, HTTPS should parse
// Would require platform handler to return undefined for HTTPS specifically
```

### 10. Input URL with Authentication

**Not tested:** Input URL contains credentials

```typescript
// Case: Input URL has embedded credentials
const value = 'https://user:pass@example.com/feed'
// Should preserve credentials and work
```

### 11. Input URL with Query Params That Get Stripped

**Not tested:** Input URL has tracking params, variant without them works

```typescript
// Case: Input has UTM params, clean variant exists
const value = 'https://example.com/feed?utm_source=twitter&utm_medium=social'
// Variant https://example.com/feed should be tested and win
```

### 12. Response URL Invalid After Platform Handler

**Not tested:** Initial fetch succeeds but response URL becomes invalid (L46-47)

```typescript
// Case: Platform handler returns invalid URL for response
const badHandler = {
  match: () => true,
  normalize: () => { throw new Error('oops') }  // or returns garbage
}
// Should return undefined
```

---

## Low Priority / Edge Cases

### 13. parser.getSignature Throws

**Not tested:** getSignature throws during comparison

```typescript
// Case: getSignature throws for compared feed
const options = {
  parser: {
    parse: (body) => body,
    getSelfUrl: () => 'https://example.com/rss',
    getSignature: (feed) => {
      if (feed.includes('bomb')) throw new Error('Signature error')
      return { content: feed }
    },
  },
}
// Would cause uncaught exception - potential bug?
```

### 14. existsFn Throws

**Not tested:** existsFn throws exception

```typescript
// Case: existsFn throws
const options = {
  existsFn: async () => { throw new Error('DB connection failed') },
}
// Would bubble up as unhandled - potential bug?
```

### 15. Empty Tiers Array

**Not tested:** Empty tiers array provided

```typescript
// Case: No tiers configured
const options = {
  tiers: [],
}
// Only variantSource would be in Set, should still work
```

### 16. Self URL Returns Status 1xx or 3xx

**Not tested:** Self URL fetch returns 1xx or 3xx status

```typescript
// Case: Self URL returns 301 status (redirect not followed by mock)
// In real fetch, redirects are followed, but edge case
```

---

## Summary

| Priority | Count | Categories |
|----------|-------|------------|
| Critical | 7 | Input protocols, invalid input, comparison edge cases, empty body |
| Medium | 5 | Variant throws, HTTPS edge, auth, query params, response invalid |
| Low | 4 | getSignature throws, existsFn throws, empty tiers, 3xx status |
| **Total** | **16** | |

### Recommended Test Order

1. Feed protocols in input URL (very common in real usage)
2. Bare domain / protocol-relative input (user error handling)
3. Invalid input URL early return (security + efficiency)
4. Comparison Tier 3 edge cases (robustness)
5. Self URL empty body response (real-world scenario)
6. Self URL protocol fallback with different content (complex path)
7. Input URL with tracking params (common scenario)
