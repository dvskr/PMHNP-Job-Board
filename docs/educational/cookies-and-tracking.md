# Cookies, Tracking, and the Cookieless Web

> **Audience:** founder + future maintainers.
> **Last updated:** 2026-04-30.
> **TL;DR:** We use first-party cookies only. We're already on the right side of every privacy regulator's roadmap. The "cookieless future" everyone panics about is mostly someone else's problem.

---

## 1. What a cookie actually is

A cookie is a key-value text pair (typically <4 KB) stored by the browser. The browser **automatically re-sends it** on every subsequent request to the same domain. That auto-re-sending is the entire mechanism — there is no magic.

```
First request:    GET /jobs            ← no cookie
Server response:  Set-Cookie: sb-session=abc123; HttpOnly; Secure
Second request:   GET /messages
                  Cookie: sb-session=abc123  ← browser sent it back
```

That single round-trip is why the server knows it's "you" on the next page without making you log in again.

## 2. Cookie attributes that matter

| Attribute | What it does | Why it matters |
|---|---|---|
| `HttpOnly` | JavaScript cannot read this cookie | Defends against XSS — even if an attacker injects JS, they can't steal the cookie |
| `Secure` | Only sent over HTTPS | Defends against network sniffing |
| `SameSite=Lax` / `Strict` / `None` | When the cookie travels across sites | Defends against CSRF (cross-site request forgery) |
| Expiry | When the browser deletes the cookie | "Session" cookies die when the browser closes; persistent ones survive for the duration set |
| `Path` and `Domain` | Which URLs the cookie attaches to | Scoping — `path=/api` only sends on API calls, not on `/jobs` |

## 3. First-party vs third-party cookies

- **First-party** = set by the domain you're on. `pmhnphiring.com` setting a cookie when you visit `pmhnphiring.com`.
- **Third-party** = set by a *different* domain embedded on the page. Like a Facebook "Like" button hosted on `facebook.com`, embedded on your page, setting a `facebook.com` cookie.

Modern browsers (Safari, Firefox, Brave, soon Chrome) **block third-party cookies by default**. We use only first-party cookies, so this doesn't affect us.

> **Subtle but important:** GA4's `_ga` cookie is **first-party** — even though Google operates the analytics, the cookie lives on `pmhnphiring.com`. The data is sent to Google via a separate request, but the cookie itself is ours. This is why GA4 still works in Safari/Firefox.

## 4. The cookies we set

Complete inventory as of 2026-04-30. If you add a new one, update this table.

| Cookie | Set by | Purpose | HttpOnly | Lifetime |
|---|---|---|---|---|
| `sb-<project>-auth-token` | Supabase Auth | Logged-in session | ✓ | ~1 hour, auto-refreshed |
| `pmhnp_consent_v2` | `POST /api/consent` | User's privacy choice (categories) | ✓ | 1 year |
| `pmhnp_consent_region` | middleware | Banner-mode hint (strict vs implied) | ✗ | 1 day |
| `pmhnp_privacy_signal` | middleware | Records browser GPC/DNT signal | ✗ | 30 days |
| `_ga`, `_ga_<id>` | GA4 SDK | Anonymous user/session ID for analytics | ✗ | 2 years (only set after consent) |

That is the **entire** inventory. No cross-site trackers, no ad pixels, no Hotjar / FullStory / Segment, no LinkedIn Insight or Meta Pixel.

## 5. Why we show a banner at all

The cookie itself is not the regulated thing. The **purpose** is. Under EU law (GDPR + ePrivacy Directive):

- **Strictly necessary** cookies (login, security, the consent cookie itself) → no consent needed
- **Anything else** (analytics, marketing, personalization, embedded video / maps) → consent needed *before* the cookie is set

That's why the banner exists. It's also why GA4 ships **Consent Mode v2** — the SDK has a built-in concept of "denied" state that fires "cookieless pings" with no identifier instead of full events. Google still knows a page-view happened, but can't tie events together into a per-user journey.

## 6. Default behaviour by region

We classify visitors into two regions in `middleware.ts`:

| Region | Countries | Banner | Default consent |
|---|---|---|---|
| **Strict** | EU 27 + EEA + UK + CH + CA + BR + AU | Shows | All denied; user must opt in |
| **Implied** | US (except California GPC users) + RoW | **Suppressed** | Analytics + personalization auto-granted; ads stay denied |

This is the maximum legally-allowed friction reduction. Pre-ticking toggles in the strict-region banner is **explicitly prohibited** under GDPR (Article 4(11) + the CJEU's *Planet49* ruling, October 2019). Even our "Customize" panel defaults to OFF for fresh visitors in strict regions — that's a hard legal line, not a UX choice.

## 7. How "tracking" actually happens

Take a single Apply button click as the example:

1. User loads `/jobs/<slug>` — page bundle includes our analytics code
2. User clicks "Apply Now"
3. Two things fire:
   - `gtag('event', 'job_apply', {...})` — JavaScript pushes an event into the GA4 dataLayer; the SDK sends a tiny `GET https://www.google-analytics.com/g/collect?...` with the user's `_ga` ID + the event payload
   - `fetch('/api/jobs/<id>/track-apply', { method: 'POST' })` — our own endpoint increments a counter (and only with consent records the click row)
4. Google aggregates events with the same `_ga` ID into "sessions" — what page they entered on, what they clicked, where they bounced

The cookie is doing one job in this flow: **giving each visitor a stable anonymous ID** so 50 page-views by you look like 1 user, not 50 strangers. That's it.

## 8. Third-party cookie deprecation — what it means

Third-party cookies powered the entire ad-tech industry for 20 years via **cross-site tracking**:

1. You visit `nytimes.com` which embeds a Doubleclick pixel → Doubleclick sets a third-party cookie `id=abc123`
2. You then visit `pmhnphiring.com` which also embeds Doubleclick → Doubleclick reads its OWN cookie `id=abc123` → now knows you visited both
3. Multiply by 5,000 sites → Doubleclick has a profile of your entire browsing history → sells it to advertisers

Privacy regulators and browser vendors decided that's unacceptable.

### Browser timeline (as of 2026-04)

| Browser | Status |
|---|---|
| Safari | Third-party cookies blocked by default since 2020 (ITP) |
| Firefox | Blocked since 2022 (Total Cookie Protection) |
| Brave / DuckDuckGo / Tor | Always blocked |
| Chrome | Originally planned full deprecation by 2024. Pivoted mid-2024 to a one-time user prompt. As of late 2025 / 2026, deprecation is still in flight but on no fixed timeline. |

Roughly **70% of web traffic** already operates with third-party cookies blocked.

### Two things often conflated

| Question | Needs third-party cookies? | How we handle it |
|---|---|---|
| **Where did this visitor come from?** | No | UTM parameters in the URL + `Referer` header; GA4 acquisition reports |
| **Is this the same visitor I served an ad to last week on a different site?** | Yes — and breaking | This is what dies |

So "where is my traffic coming from?" is a **solved problem regardless of cookie deprecation**. UTM-tag every campaign link and you're done.

What dies with deprecation:

- **Retargeting** ("show ads to people who visited my site but didn't sign up") — needs cross-site identity
- **Conversion attribution from third-party pixels** — needs the pixel to recognize the same user later
- **Cross-device tracking** via shared identifiers

### What replaces it

| Pre-deprecation | Post-deprecation replacement |
|---|---|
| Meta Pixel sets a `facebook.com` cookie at click time, recognizes it on conversion | **Conversions API (CAPI)** — your *server* sends Facebook the conversion event with a Facebook-issued click ID (`fbclid` URL param) so they reconnect the dots without needing a cookie |
| Doubleclick pixel for Google Ads attribution | **GA4 Enhanced Conversions** + **gclid URL param** — same idea on the Google side |
| Audience targeting "people who visited site X" | **Custom Audiences via hashed email** — you SHA-256 emails, push to Meta, they match against their hashed users |
| Cross-site behaviour profiling | **Privacy Sandbox / Topics API** (Google's replacement) — coarse interest categories at the browser level, no per-user ID |
| Cross-device tracking | **First-party logged-in identity** — only as good as your login adoption |

### What this means for us

| Today | When we start paid ads |
|---|---|
| Nothing to do. We don't run ads, we have no third-party trackers, browser blocking doesn't break anything for us. | UTM-tag every ad campaign (Day 1). Wire **server-side tagging + Conversions API** (Week 1). Skip client-side pixels as primary measurement — they'll give bad numbers on Safari/Firefox. |

See [when-to-expand-infra.md](when-to-expand-infra.md) for the trigger thresholds.

## 9. Mental model

The web is a city of shops. Third-party cookies were essentially a private detective following each shopper around between shops, taking notes on everything they did, and reporting back. Browsers fired the detective.

You can still:
- Ask each shopper "how did you find us?" — UTM
- Notice they came in from a specific neighbour's door — `Referer`
- Track what they do *inside your shop* — first-party analytics, totally fine
- Run an ad campaign and tell the ad network "this purchase happened" via direct API call — CAPI

You can't:
- Have the ad network tail every visitor across 5,000 unrelated shops to build a behaviour profile

For a niche job board with no plans to do creepy retargeting? **The cookieless world is engineered around the patterns we'd use anyway.**

## 10. Common questions

**Q: Will GA4 stop working in Safari?**
No. `_ga` is first-party. GA4's accuracy in Safari has been degraded for years (ITP shortens cookie lifetimes), but it works. With Consent Mode v2 + Enhanced Measurement, the gaps are filled in by Google's modeling.

**Q: If I never run ads, do I need to do anything before deprecation?**
No. We're already prepared.

**Q: Is HttpOnly + Secure + SameSite enough for the auth cookie?**
Yes for ordinary attacks. For more, add CSP (we already have it), and consider `__Host-` cookie prefix if you ever standardise on a single domain (Supabase doesn't fully support `__Host-` yet so we don't use it).

**Q: Why don't we use Google Tag Manager (the *client* container)?**
Because GTM is a tag injector — anything someone with GTM admin access types becomes JavaScript on every page. That's a huge supply-chain risk for a tiny benefit. We hard-code our analytics calls in code-reviewed source files instead. If we ever do server-side tagging it'll be sGTM, which is a different beast.

**Q: Local storage vs cookies — which should I use?**
- Cookies: when the server needs to read the value (session auth, our consent flag). HttpOnly cookies are the only XSS-resistant option.
- localStorage: when only client-side code needs the value (UI prefs, draft state). Easier to set/clear, but every byte is XSS-readable.

**Q: When do I put a value in a session cookie vs a persistent cookie?**
- Session: it should disappear when the user closes their tab. Login state is a session-ish concept (we make it ~1 hour with refresh).
- Persistent: it should survive browser restarts. Consent state, region detection, GA's anonymous ID.
