import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Feedcanon',
  description:
    'Find the canonical URL for any web feed by comparing actual content. Turn messy feed URLs into their cleanest form.',
  lastUpdated: true,
  cleanUrls: true,
  head: [
    [
      'script',
      {
        async: '',
        src: 'https://stats.lamberski.com/script.js',
        'data-website-id': 'b2baac98-7d57-4277-9aa3-98d7b96b5425',
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
              { text: 'URL Normalization Tiers', link: '/guides/customization/url-tiers' },
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
        icon: 'github',
        link: 'https://github.com/macieklamberski/feedcanon',
      },
      {
        icon: 'npm',
        link: 'https://www.npmjs.com/package/feedcanon',
      },
    ],
  },
})
