import { feedburnerHandler } from './platforms/feedburner.js'
import type { NormalizeOptions, PlatformHandler } from './types.js'

// Platform handlers for domain-specific URL normalization.
export const defaultPlatforms: Array<PlatformHandler> = [feedburnerHandler]

// Tracking parameters to strip when comparing URLs for similarity.
export const defaultStrippedParams = [
  // Google Analytics / UTM.
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'utm_reader',
  'utm_name',
  'utm_cid',
  'utm_viz_id',

  // Google Ads.
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'gclsrc',
  'gad_source',
  'gad_campaignid',

  // Google Search Results.
  'srsltid',

  // Meta / Facebook.
  'fbclid',
  'fb_action_ids',
  'fb_action_types',
  'fb_source',
  'fb_ref',

  // Google Analytics cookies.
  '_ga',
  '_gl',
  '_bk',
  '_ke',

  // Email marketing.
  'mc_cid',
  'mc_eid',
  'mkt_tok',

  // Microsoft / LinkedIn.
  'msclkid',

  // Twitter / X.
  'twclid',

  // TikTok.
  'ttclid',

  // Instagram.
  'igshid',

  // Matomo / Piwik.
  'mtm_campaign',
  'mtm_cid',
  'mtm_content',
  'mtm_group',
  'mtm_keyword',
  'mtm_medium',
  'mtm_placement',
  'mtm_source',
  'pk_campaign',
  'pk_cid',
  'pk_content',
  'pk_keyword',
  'pk_medium',
  'pk_source',

  // General tracking / referral.
  'ncid',
  'sr_share',
  // 'ref', // Too generic, often functional.
  // 'ref_src', // Too generic, often functional.
  // 'ref_url', // Too generic, often functional.
  // 'source', // Too generic, often functional.
  // 'via', // Too generic, often functional.

  // HubSpot.
  'hsa_acc',
  'hsa_ad',
  'hsa_cam',
  'hsa_grp',
  'hsa_kw',
  'hsa_mt',
  'hsa_net',
  'hsa_src',
  'hsa_tgt',
  'hsa_ver',
  'hsCtaTracking',
  '__hstc',
  '__hsfp',
  '__hssc',

  // Adobe.
  'cid',
  's_kwcid',
  'ef_id',

  // Outbrain / Taboola.
  'obOrigUrl',
  'dicbo',

  // Yahoo.
  'yclid',

  // Affiliate networks.
  'awinaffid',
  'awinmid',
  'clickref',
  'afftrack',

  // Internal tracking systems.
  'itm_source',
  'itm_medium',
  'itm_campaign',
  'itm_content',
  'itm_channel',
  'itm_audience',
  'int_source',
  'int_medium',
  'int_campaign',
  'int_content',
  'int_placement',
  'int_campaign_type',
  'int_keycode',

  // G2i tracking.
  'g2i_source',
  'g2i_medium',
  'g2i_campaign',
  'g2i_or_o',
  'g2i_or_p',

  // WordPress internal.
  'doing_wp_cron',
  'preview',
  'preview_id',
  'preview_nonce',
  'replytocom',

  // Cache busters.
  '_',
  'timestamp',
  'ts',
  'cb',
  'cachebuster',
  'nocache',
  'rand',
  'random',
  'forceByPassCache',
  'sucurianticache',
  'cleancache',
  'rebuildcache',
  'kontrol_health_check_timestamp',

  // Translation services.
  '_x_tr_sl',
  '_x_tr_tl',
  '_x_tr_hl',

  // Misc.
  'action_object_map',
  'action_ref_map',
  'action_type_map',
  'algo_expid',
  'algo_pvid',
  'at_campaign',
  'at_custom1',
  'at_custom2',
  'at_custom3',
  'at_custom4',
  'at_medium',
  'at_preview_index',
  'campaign_id',
  'click_sum',
  'fref',
  'gs_l',
  'hmb_campaign',
  'hmb_medium',
  'hmb_source',
  'ml_subscriber',
  'ml_subscriber_hash',
  'oly_anon_id',
  'oly_enc_id',
  'rb_clickid',
  'referer',
  'referrer',
  'spm',
  'trk',
  'vero_conv',
  'vero_id',
  'wickedid',
  'xtor',
]

export const defaultNormalizeOptions: NormalizeOptions = {
  stripProtocol: true,
  stripAuthentication: false,
  stripWww: true,
  stripTrailingSlash: true,
  stripRootSlash: true,
  collapseSlashes: true,
  stripHash: true,
  sortQueryParams: true,
  stripQueryParams: defaultStrippedParams,
  stripEmptyQuery: true,
  normalizeEncoding: true,
  lowercaseHostname: true,
  normalizeUnicode: true,
  convertToPunycode: true,
}

// Normalization tiers ordered from cleanest to least clean.
export const defaultTiers: Array<NormalizeOptions> = [
  // Tier 1: Most aggressive - strip www, trailing slash, tracking params.
  {
    stripProtocol: false,
    stripAuthentication: false,
    stripWww: true,
    stripTrailingSlash: true,
    stripRootSlash: true,
    collapseSlashes: true,
    stripHash: true,
    sortQueryParams: true,
    stripQueryParams: defaultStrippedParams,
    stripEmptyQuery: true,
    normalizeEncoding: true,
    lowercaseHostname: true,
    normalizeUnicode: true,
    convertToPunycode: true,
  },
  // Tier 2: Keep www, strip trailing slash.
  {
    stripProtocol: false,
    stripAuthentication: false,
    stripWww: false,
    stripTrailingSlash: true,
    stripRootSlash: true,
    collapseSlashes: true,
    stripHash: true,
    sortQueryParams: true,
    stripQueryParams: defaultStrippedParams,
    stripEmptyQuery: true,
    normalizeEncoding: true,
    lowercaseHostname: true,
    normalizeUnicode: true,
    convertToPunycode: true,
  },
  // Tier 3: Keep www and trailing slash.
  {
    stripProtocol: false,
    stripAuthentication: false,
    stripWww: false,
    stripTrailingSlash: false,
    stripRootSlash: true,
    collapseSlashes: true,
    stripHash: true,
    sortQueryParams: true,
    stripQueryParams: defaultStrippedParams,
    stripEmptyQuery: true,
    normalizeEncoding: true,
    lowercaseHostname: true,
    normalizeUnicode: true,
    convertToPunycode: true,
  },
]
