import { defineConfig } from 'vitepress'

const indexMdRegex = /index\.md$/
const mdRegex = /\.md$/
const trailingSlashRegex = /\/$/

const hostname = 'https://feedcanon.dev'

export default defineConfig({
  title: 'Feedcanon',
  titleTemplate: ':title',
  description:
    'Find the canonical URL for any web feed by comparing actual content. Turn messy feed URLs into their cleanest form.',
  lastUpdated: true,
  cleanUrls: true,
  sitemap: {
    hostname,
  },
  transformHead: ({ pageData }) => {
    const canonicalUrl = `${hostname}/${pageData.relativePath}`
      .replace(indexMdRegex, '')
      .replace(mdRegex, '')
      .replace(trailingSlashRegex, '')

    return [['link', { rel: 'canonical', href: canonicalUrl }]]
  },
  head: [
    ['meta', { property: 'og:site_name', content: 'Feedcanon' }],
    [
      'script',
      { type: 'application/ld+json' },
      JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'Feedcanon',
        url: hostname,
      }),
    ],
    [
      'script',
      {
        defer: '',
        src: 'https://ping.lamberski.com/js/script.js',
        'data-domain': 'feedcanon.dev',
      },
    ],
  ],
  themeConfig: {
    outline: {
      level: [2, 3],
    },
    sidebar: [
      {
        text: 'Get Started',
        items: [
          { text: 'Introduction', link: '/' },
          { text: 'Quick Start', link: '/quick-start' },
          { text: 'How It Works', link: '/how-it-works' },
        ],
      },
      {
        text: 'Guides',
        items: [
          { text: 'Using Callbacks', link: '/guides/callbacks' },
          {
            text: 'Customization',
            collapsed: false,
            items: [
              { text: 'Data Fetching', link: '/guides/customization/data-fetching' },
              { text: 'Feed Parsing', link: '/guides/customization/feed-parsing' },
              { text: 'URL Rewrites', link: '/guides/customization/url-rewrites' },
              { text: 'URL Probes', link: '/guides/customization/url-probes' },
              { text: 'URL Tiers', link: '/guides/customization/url-tiers' },
            ],
          },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'findCanonical', link: '/reference/find-canonical' },
          { text: 'Utilities', link: '/reference/utilities' },
        ],
      },
    ],
    search: {
      provider: 'local',
    },
    socialLinks: [
      {
        icon: 'npm',
        link: 'https://www.npmjs.com/package/feedcanon',
      },
      {
        icon: 'github',
        link: 'https://github.com/macieklamberski/feedcanon',
      },
      {
        icon: 'x',
        link: 'https://x.com/macieklamberski',
      },
    ],
  },
})
