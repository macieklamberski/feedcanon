---
title: "Customization: Data Fetching"
---

# Customize Data Fetching

By default, Feedcanon uses native `fetch` to perform HTTP requests. You can use any HTTP client by providing a custom `fetchFn` that handles requests and returns responses.

The default fetch gives up after 30 seconds, and the timeout covers reading the body too. It sends an `Accept` header that prefers feed media types ([RFC 9110 §12.5.1](https://www.rfc-editor.org/rfc/rfc9110#section-12.5.1)), unless the `headers` you pass set one. It fetches any http or https URL it's given, including the self URL a feed declares. That URL can point at a private address, like `localhost` or a cloud metadata endpoint. If you run Feedcanon on URLs from untrusted sources, pass a `fetchFn` that blocks private addresses and caps the body size.

Below are copy-paste examples for popular HTTP clients. See the [`FetchFnResponse`](https://github.com/macieklamberski/feedcanon/blob/main/src/types.ts) type for the full interface.

## Redirects

The default fetch follows up to 20 redirects itself and lists each one in the response's `redirects` field, as the URL that was requested and the status it returned. Feedcanon reads that list to decide which URL to keep. A 301 or 308 is a permanent move, so the target replaces the URL that was requested. A 302, 303 or 307 is temporary, so Feedcanon keeps the URL from before that redirect, even when the chain moves on from there. A chain of 301 and then 302 ends on the 301 target.

A custom `fetchFn` can fill `redirects` the same way. Without it, Feedcanon uses the final `url` whatever the redirect status was.

The second argument, `FetchFnOptions`, carries the method, the headers and a string body. Feedcanon itself never passes it, so every request it makes is a GET. The type also allows HEAD and POST, so one fetch function can serve Feedcanon and any other code that sends those requests.

## Axios

[Axios](https://axios-http.com) throws errors for non-2xx responses by default. Use `validateStatus: () => true` to prevent this, since Feedcanon handles HTTP errors internally. Axios also parses JSON responses into objects, so set `responseType: 'text'` to keep a JSON Feed body as a string.

```typescript
import { findCanonical } from 'feedcanon'
import axios from 'axios'

const url = await findCanonical('https://example.com/feed', {
  fetchFn: async (url) => {
    const response = await axios.get<string>(url, {
      responseType: 'text',
      validateStatus: () => true,
    })

    return {
      status: response.status,
      url: response.request?.res?.responseUrl ?? url,
      body: response.data,
      headers: new Headers(response.headers as Record<string, string>),
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
