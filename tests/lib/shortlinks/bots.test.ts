import { describe, it, expect } from 'vitest'
import { identifyBot } from '@/lib/shortlinks/bots'

describe('identifyBot — empty / missing UA', () => {
  it('classifies missing UA as a bot to keep noise out of real totals', () => {
    expect(identifyBot(null)).toEqual({ isBot: true, botName: 'unknown-or-missing' })
    expect(identifyBot(undefined)).toEqual({ isBot: true, botName: 'unknown-or-missing' })
    expect(identifyBot('')).toEqual({ isBot: true, botName: 'unknown-or-missing' })
    expect(identifyBot('   ')).toEqual({ isBot: true, botName: 'unknown-or-missing' })
  })
})

describe('identifyBot — link-preview bots', () => {
  it.each([
    ['facebookexternalhit', 'facebookexternalhit/1.1 (+https://www.facebook.com/externalhit_uatext.php)'],
    ['facebookcatalog', 'facebookcatalog/1.0'],
    ['meta-externalagent', 'Mozilla/5.0 (compatible; Meta-ExternalAgent/1.1)'],
    ['linkedinbot', 'LinkedInBot/1.0 (compatible; Mozilla/5.0; Jakarta Commons-HttpClient/3.1 +http://www.linkedin.com)'],
    ['twitterbot', 'Twitterbot/1.0'],
    ['slackbot', 'Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)'],
    ['discordbot', 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)'],
    ['whatsapp', 'WhatsApp/2.21.10.16 A'],
    ['telegrambot', 'TelegramBot (like TwitterBot)'],
    ['pinterestbot', 'Pinterest/0.2 (+https://www.pinterest.com/bot.html)'],
    ['redditbot', 'redditbot/0.1'],
  ])('flags %s', (name, ua) => {
    const r = identifyBot(ua)
    expect(r.isBot).toBe(true)
    expect(r.botName).toBe(name)
  })
})

describe('identifyBot — search and AI crawlers', () => {
  it.each([
    ['googlebot', 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'],
    ['bingbot', 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)'],
    ['gptbot', 'Mozilla/5.0 (compatible; GPTBot/1.0)'],
    ['claudebot', 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)'],
    ['perplexitybot', 'PerplexityBot/1.0'],
    ['applebot', 'Applebot/0.1 (+http://www.apple.com/go/applebot)'],
  ])('flags %s', (name, ua) => {
    const r = identifyBot(ua)
    expect(r.isBot).toBe(true)
    expect(r.botName).toBe(name)
  })
})

describe('identifyBot — headless / monitoring', () => {
  it.each([
    ['headless-chrome', 'Mozilla/5.0 HeadlessChrome/120.0.0.0 Safari/537.36'],
    ['curl', 'curl/8.4.0'],
    ['wget', 'Wget/1.20.3 (linux-gnu)'],
    ['python-requests', 'python-requests/2.28.1'],
  ])('flags %s', (name, ua) => {
    const r = identifyBot(ua)
    expect(r.isBot).toBe(true)
    expect(r.botName).toBe(name)
  })
})

describe('identifyBot — real browsers (not bots)', () => {
  it.each([
    ['chrome desktop', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'],
    ['safari mobile', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'],
    ['firefox', 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'],
    ['edge', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'],
    ['android chrome', 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'],
  ])('passes %s through', (_name, ua) => {
    const r = identifyBot(ua)
    expect(r.isBot).toBe(false)
    expect(r.botName).toBeNull()
  })
})

describe('identifyBot — return shape', () => {
  it('returns a frozen object', () => {
    const r = identifyBot('curl/8.0')
    expect(Object.isFrozen(r)).toBe(true)
  })
})
