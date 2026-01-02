import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Feedcanon',
  description:
    'Find the canonical URL for any web feed by comparing actual content. Turn messy feed URLs into their cleanest form.',
  lastUpdated: true,
  cleanUrls: true,
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
              { text: 'URL Variants', link: '/guides/customization/url-variants' },
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
