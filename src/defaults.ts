import { createHash } from 'node:crypto'
import type { FetchFn, HashFn, NormalizeOptions, VerifyFn } from './types.js'

// Known feed-related protocol schemes that should be converted to https://.
export const defaultFeedProtocols = ['feed:', 'rss:', 'pcast:', 'itpc:']

export const defaultNormalizeOptions: NormalizeOptions = {
  protocol: true,
  authentication: true,
  www: true,
  port: true,
  trailingSlash: true,
  singleSlash: true,
  slashes: true,
  hash: true,
  textFragment: true,
  encoding: true,
  case: true,
  unicode: true,
  punycode: true,
  queryOrder: true,
  emptyQuery: true,
}

export const defaultFetchFn: FetchFn = async (url, options) => {
  const response = await fetch(url, {
    method: options?.method || 'GET',
    headers: options?.headers,
  })

  return {
    headers: response.headers,
    body: await response.text(),
    url: response.url,
    status: response.status,
  }
}

export const defaultHashFn: HashFn = async (content) => {
  return createHash('md5').update(content).digest('hex')
}

export const defaultVerifyFn: VerifyFn = () => {
  return true
}

// Default methods to use for areEquivalent.
export const defaultEquivalentMethods = {
  normalize: true,
  redirects: true,
  responseHash: true,
  feedDataHash: true,
}

// Default methods to use for canonicalize.
export const defaultCanonicalizeMethods = {
  normalize: true,
  redirects: true,
  responseHash: true,
  feedDataHash: true,
  upgradeHttps: true,
}

// Default tracking parameters to strip from URLs.
export const defaultStrippedParams = [
  // UTM parameters (Google Analytics).
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_id',
  'utm_source_platform',
  'utm_creative_format',
  'utm_marketing_tactic',

  // Social media click identifiers.
  'fbclid', // Facebook
  'twclid', // Twitter
  'gclid', // Google Ads
  'dclid', // DoubleClick
  'msclkid', // Microsoft Ads
  'li_fat_id', // LinkedIn
  'igshid', // Instagram
  'ttclid', // TikTok
  'wbraid', // Google Ads (web-to-app)
  'gbraid', // Google Ads (iOS)

  // Marketing/Analytics platforms.
  '_ga', // Google Analytics
  '_gl', // Google Analytics linker
  '_hsenc', // HubSpot
  '_hsmi', // HubSpot
  '__hstc', // HubSpot
  '__hsfp', // HubSpot
  'hsCtaTracking', // HubSpot
  'mc_cid', // Mailchimp campaign
  'mc_eid', // Mailchimp email
  '_ke', // Klaviyo
  'trk_contact', // Mailjet
  'trk_msg', // Mailjet
  'trk_module', // Mailjet
  'trk_sid', // Mailjet
  'vero_id', // Vero
  'vero_conv', // Vero
  'oly_enc_id', // Omeda
  'oly_anon_id', // Omeda
  'rb_clickid', // Rockerbox
  'irclickid', // Impact Radius
  's_kwcid', // Adobe Analytics

  // Additional analytics/tracking.
  'ref', // Generic referrer
  'source', // Generic source
  'campaign', // Generic campaign
  'click_id', // Generic click ID
  'affiliate_id', // Affiliate tracking
  'tracking_id', // Generic tracking
  'partner', // Partner tracking
  'promo', // Promo code tracking
  'cid', // Campaign ID
  'eid', // Email ID
  'sid', // Session ID

  // Matomo/Piwik.
  'mtm_source',
  'mtm_medium',
  'mtm_campaign',
  'mtm_content',
  'mtm_cid',
  'mtm_keyword',
  'mtm_group',
  'mtm_placement',
  'pk_source',
  'pk_medium',
  'pk_campaign',
  'pk_content',
  'pk_cid',
  'pk_keyword',

  // Iterable.
  'iterable_click_id',
  'iterable_msg_id',

  // Braze.
  'braze_cid',

  // Mixpanel.
  'mp_source',

  // Drip.
  '__s',

  // Marketo.
  'mkt_tok',

  // Pardot.
  'pi_list_email',

  // Eloqua.
  'elqTrackId',
  'elqTrack',
  'elq',

  // Sailthru.
  'stc',

  // Customer.io.
  'cio_id',

  // ActiveCampaign.
  'vgo_ee',

  // Segment.
  'ajs_uid',
  'ajs_aid',
  'ajs_prop_',

  // Miscellaneous tracking.
  '_openstat', // Yandex
  'yclid', // Yandex
  'wickedid', // Wicked Reports
  'wickedsource', // Wicked Reports
]
