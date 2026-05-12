import type { BotIdentification } from './types'

/**
 * Bot / link-preview detection for short-link redirect requests.
 *
 * The patterns below intentionally split into two buckets:
 *
 *   1. PREVIEW_BOTS — social platforms that fetch the URL to build the
 *      link card (open-graph image, title, description). One fetch per
 *      share, often within milliseconds of posting. These MUST be excluded
 *      from real-click totals; otherwise every Facebook share registers
 *      as one phantom click before any human has seen it.
 *
 *   2. SEARCH_AND_AI_BOTS — Googlebot, GPTBot, etc. Same treatment as
 *      preview bots: log them with `is_bot=true` so we can see crawl
 *      pressure if /r/ ever leaks into search indexes despite the
 *      noindex header on the redirect.
 *
 * Returning a labelled match (not just a boolean) means the persisted
 * `bot_name` column is grep-able for "which networks dominate preview
 * traffic?" without re-parsing UA strings at query time.
 */

interface BotPattern {
  readonly pattern: RegExp
  readonly name: string
}

// Order matters — more-specific UAs must come before substrings they contain.
// TelegramBot's real UA is literally "TelegramBot (like TwitterBot)"; if
// Twitterbot ran first, every Telegram fetch would be mislabelled.
const PREVIEW_BOTS: ReadonlyArray<BotPattern> = Object.freeze([
  { pattern: /facebookexternalhit/i, name: 'facebookexternalhit' },
  { pattern: /facebookcatalog/i, name: 'facebookcatalog' },
  { pattern: /\bfacebot\b/i, name: 'facebot' },
  { pattern: /Meta-ExternalAgent/i, name: 'meta-externalagent' },
  { pattern: /LinkedInBot/i, name: 'linkedinbot' },
  { pattern: /TelegramBot/i, name: 'telegrambot' },
  { pattern: /Twitterbot/i, name: 'twitterbot' },
  { pattern: /Slackbot/i, name: 'slackbot' },
  { pattern: /Discordbot/i, name: 'discordbot' },
  { pattern: /WhatsApp/i, name: 'whatsapp' },
  { pattern: /Pinterest(?:bot)?/i, name: 'pinterestbot' },
  { pattern: /redditbot/i, name: 'redditbot' },
  { pattern: /SkypeUriPreview/i, name: 'skype-preview' },
  { pattern: /vkShare/i, name: 'vk-share' },
  { pattern: /Embedly/i, name: 'embedly' },
  { pattern: /Iframely/i, name: 'iframely' },
])

const SEARCH_AND_AI_BOTS: ReadonlyArray<BotPattern> = Object.freeze([
  { pattern: /Googlebot/i, name: 'googlebot' },
  { pattern: /AdsBot-Google/i, name: 'adsbot-google' },
  { pattern: /Google-InspectionTool/i, name: 'google-inspection' },
  { pattern: /Bingbot/i, name: 'bingbot' },
  { pattern: /BingPreview/i, name: 'bing-preview' },
  { pattern: /DuckDuckBot/i, name: 'duckduckbot' },
  { pattern: /Yandex(?:Bot|Images)/i, name: 'yandex' },
  { pattern: /Baiduspider/i, name: 'baidu' },
  { pattern: /Applebot/i, name: 'applebot' },
  { pattern: /OAI-SearchBot/i, name: 'oai-search' },
  { pattern: /GPTBot/i, name: 'gptbot' },
  { pattern: /ChatGPT-User/i, name: 'chatgpt-user' },
  { pattern: /ClaudeBot/i, name: 'claudebot' },
  { pattern: /anthropic-ai/i, name: 'anthropic-ai' },
  { pattern: /PerplexityBot/i, name: 'perplexitybot' },
  { pattern: /Bytespider/i, name: 'bytespider' },
  { pattern: /CCBot/i, name: 'ccbot' },
])

const HEADLESS_AND_MONITORING: ReadonlyArray<BotPattern> = Object.freeze([
  { pattern: /HeadlessChrome/i, name: 'headless-chrome' },
  { pattern: /\bPhantomJS\b/i, name: 'phantomjs' },
  { pattern: /\bPlaywright\b/i, name: 'playwright' },
  { pattern: /UptimeRobot/i, name: 'uptimerobot' },
  { pattern: /Pingdom/i, name: 'pingdom' },
  { pattern: /Better-Uptime/i, name: 'betteruptime' },
  { pattern: /StatusCake/i, name: 'statuscake' },
  { pattern: /\bcurl\//i, name: 'curl' },
  { pattern: /\bwget\//i, name: 'wget' },
  { pattern: /python-requests/i, name: 'python-requests' },
])

const ALL_PATTERNS: ReadonlyArray<BotPattern> = Object.freeze([
  ...PREVIEW_BOTS,
  ...SEARCH_AND_AI_BOTS,
  ...HEADLESS_AND_MONITORING,
])

const NO_MATCH: BotIdentification = Object.freeze({ isBot: false, botName: null })

/**
 * Classify a UA string. An empty or missing UA is treated as a bot
 * (`unknown`) because real browsers always send a non-empty UA, and the
 * conservative choice is to keep these out of real-click totals.
 */
export function identifyBot(userAgent: string | null | undefined): BotIdentification {
  if (!userAgent || userAgent.trim().length === 0) {
    return Object.freeze({ isBot: true, botName: 'unknown-or-missing' })
  }
  for (const { pattern, name } of ALL_PATTERNS) {
    if (pattern.test(userAgent)) {
      return Object.freeze({ isBot: true, botName: name })
    }
  }
  return NO_MATCH
}
