import type { Got } from 'got'
import type { FetchFn, FetchFnOptions } from './types.js'

// Options for native fetch adapter.
export type NativeFetchAdapterOptions = {
  timeout?: number
  headers?: Record<string, string>
}

// Creates a fetch adapter using native fetch API.
export const createNativeFetchAdapter = (adapterOptions?: NativeFetchAdapterOptions): FetchFn => {
  return async (url: string, options?: FetchFnOptions) => {
    const controller = new AbortController()
    const timeout = adapterOptions?.timeout

    const timeoutId = timeout ? setTimeout(() => controller.abort(), timeout) : undefined

    try {
      const response = await fetch(url, {
        method: options?.method || 'GET',
        headers: {
          ...adapterOptions?.headers,
          ...options?.headers,
        },
        signal: controller.signal,
      })

      return {
        headers: response.headers,
        body: await response.text(),
        url: response.url,
        status: response.status,
      }
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }
}

// Options for got adapter.
export type GotAdapterOptions = {
  timeout?: number
  headers?: Record<string, string>
}

// Creates a fetch adapter using got library.
export const createGotAdapter = (got: Got, adapterOptions?: GotAdapterOptions): FetchFn => {
  return async (url: string, options?: FetchFnOptions) => {
    const response = await got(url, {
      method: options?.method || 'GET',
      headers: {
        ...adapterOptions?.headers,
        ...options?.headers,
      },
      timeout: adapterOptions?.timeout ? { request: adapterOptions.timeout } : undefined,
      followRedirect: true,
      throwHttpErrors: false,
    })

    return {
      headers: new Headers(response.headers as Record<string, string>),
      body: response.body,
      url: response.url,
      status: response.statusCode,
    }
  }
}
