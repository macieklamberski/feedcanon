---
prev: Using Callbacks
next: Feed Parsing
---

# Data Fetching

By default, Feedcanon uses native `fetch` to perform HTTP requests. You can use any HTTP client by providing a custom `fetchFn` that handles requests and returns responses.

Below are copy-paste examples for popular HTTP clients. See the [`FetchFnResponse`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts#L82) type for the full interface.

## Axios

[Axios](https://axios-http.com) throws errors for non-2xx responses by default. Use `validateStatus: () => true` to prevent this, since Feedcanon handles HTTP errors internally.

```typescript
import { findCanonical } from 'feedcanon'
import axios from 'axios'

const url = await findCanonical('https://example.com/feed', {
  fetchFn: async (url) => {
    const response = await axios.get(url, {
      validateStatus: () => true,
    })

    return {
      status: response.status,
      url: response.request?.res?.responseUrl ?? url,
      body: response.data,
      headers: new Headers(response.headers.toJSON() as Record<string, string>),
    }
  },
})
```

## Got

[Got](https://github.com/sindresorhus/got) throws errors for non-2xx responses by default. Use `throwHttpErrors: false` to prevent this.

```typescript
import { findCanonical } from 'feedcanon'
import got from 'got'

const url = await findCanonical('https://example.com/feed', {
  fetchFn: async (url) => {
    const response = await got(url, {
      throwHttpErrors: false,
    })

    return {
      status: response.statusCode,
      url: response.url,
      body: response.body,
      headers: new Headers(response.headers as Record<string, string>),
    }
  },
})
```

## Ky

[Ky](https://github.com/sindresorhus/ky) is a fetch wrapper that throws errors for non-2xx responses by default. Use `throwHttpErrors: false` to prevent this.

```typescript
import { findCanonical } from 'feedcanon'
import ky from 'ky'

const url = await findCanonical('https://example.com/feed', {
  fetchFn: async (url) => {
    const response = await ky.get(url, {
      throwHttpErrors: false,
    })

    return {
      status: response.status,
      url: response.url,
      body: await response.text(),
      headers: response.headers,
    }
  },
})
```
