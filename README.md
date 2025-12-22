# Feedcanon

[![codecov](https://codecov.io/gh/macieklamberski/feedcanon/branch/main/graph/badge.svg)](https://codecov.io/gh/macieklamberski/feedcanon)
[![npm version](https://img.shields.io/npm/v/feedcanon.svg)](https://www.npmjs.com/package/feedcanon)
[![license](https://img.shields.io/npm/l/feedcanon.svg)](https://github.com/macieklamberski/feedcanon/blob/main/LICENSE)

Find the canonical URL for any web feed by comparing actual content. Turn messy feed URLs into their cleanest, most reliable form.

Many URLs can point to the same feed—varying by protocol, www prefixes, trailing slashes, unnecessary params, or domain aliases. This library compares actual feed content, considers the feed's declared self URL, and tests simpler URL alternatives to find the cleanest working one. Perfect for feed readers that need consistent, deduplicated subscriptions.
