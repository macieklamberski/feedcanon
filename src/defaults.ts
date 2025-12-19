import { createHash } from 'node:crypto'
import { feedburnerHandler } from './platforms/feedburner.js'
import type {
  CanonicalizeMethods,
  EquivalentMethods,
  HashFn,
  NormalizeOptions,
  PlatformHandler,
  VerifyFn,
} from './types.js'

// Known feed-related protocol schemes that should be converted to https://.
export const defaultFeedProtocols = ['feed:', 'rss:', 'pcast:', 'itpc:']

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
  'ref',
  'ref_src',
  'ref_url',
  'source',
  'ncid',
  'sr_share',
  'via',

  // Hubspot.
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

  // Adobe.
  'cid',
  's_kwcid',
  'ef_id',

  // Outbrain / Taboola.
  'obOrigUrl',
  'dicbo',

  // Yahoo.
  'yclid',

  // Cache busters.
  '_',

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
  'itm_campaign',
  'itm_medium',
  'itm_source',
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
  protocol: true,
  authentication: false,
  www: true,
  port: true,
  trailingSlash: true,
  singleSlash: true,
  slashes: true,
  hash: true,
  textFragment: true,
  queryOrder: true,
  strippedParams: defaultStrippedParams,
  emptyQuery: true,
  encoding: true,
  case: true,
  unicode: true,
  punycode: true,
  platforms: defaultPlatforms,
}

export const defaultEquivalentMethods: EquivalentMethods = {
  normalize: defaultNormalizeOptions,
  redirects: true,
  responseHash: true,
  feedDataHash: false,
}

export const defaultCanonicalizeMethods: CanonicalizeMethods = {
  normalize: defaultNormalizeOptions,
  redirects: true,
  responseHash: true,
  feedDataHash: false,
  upgradeHttps: false,
}

export const defaultVerifyFn: VerifyFn = () => {
  return true
}

export const defaultHashFn: HashFn = async (content) => {
  return createHash('md5').update(content).digest('hex')
}
