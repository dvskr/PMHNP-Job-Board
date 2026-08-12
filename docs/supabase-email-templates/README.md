# Supabase auth email templates

Paste ready bodies for the emails Supabase sends itself (Authentication > Emails
in the dashboard). These are not used by the app's own Resend templates in
`lib/email-templates-v2.ts`. They exist so that mail leaving Supabase looks like
one product with mail leaving Resend, and so that the button is actually visible
in Outlook.

## The bug these templates fix

An employer on Outlook reported that the password reset email showed no button:
"Says click below, but there is nothing there."

Outlook on Windows renders mail through Word. Word ignores CSS backgrounds on
`<a>` elements. A link styled as a button therefore keeps its padding and its
white text but loses its fill, so white text sits on white paper and the button
disappears. The padding is still there, so the recipient sees a blank gap.

Every template here defends three times, in order of reliability:

1. `bgcolor` on the `<td>` that wraps the link. `bgcolor` is an HTML attribute,
   not CSS, so Word honours it.
2. A VML `<v:roundrect>` inside an `<!--[if mso]>` conditional. VML is the only
   way Outlook draws rounded corners. Non Outlook clients never see it, because
   the real button sits in the matching `<!--[if !mso]><!-- -->` block.
3. The raw URL printed as visible, copyable text under the button. This is the
   one that actually guarantees the email works. If every button technique
   fails, the recipient can still copy a link.

Do not replace the button table with a bare styled `<a>`. That is the bug.

## File to dashboard field mapping

Dashboard path: Supabase project > Authentication > Emails. Pick the template in
the left hand list, paste the file into the **Message body** field, and set the
**Subject heading** to the value below.

| File | Dashboard template | Subject heading |
| --- | --- | --- |
| `confirm-signup.html` | Confirm signup | Confirm your PMHNP Hiring account |
| `magic-link.html` | Magic Link | Your PMHNP Hiring sign in link |
| `invite-user.html` | Invite user | You have been invited to PMHNP Hiring |
| `change-email-address.html` | Change Email Address | Confirm your new PMHNP Hiring email address |
| `reset-password.html` | Reset Password | Reset your PMHNP Hiring password |
| `reauthentication.html` | Reauthentication | Your PMHNP Hiring confirmation code |

Paste the whole file, HTML comment header included. The comment does not render
in any client and it is the only thing that tells the next person why the markup
looks like this.

## The two rules that must never be broken

### 1. `{{ .ConfirmationURL }}` appears in all three places

In every link bearing template (all of the above except `reauthentication.html`)
the placeholder must be present in each of these three places:

1. the `href` on the `<v:roundrect>` inside the mso conditional,
2. the `href` on the `<a>` inside the non mso button table,
3. the visible fallback line at the bottom, where it is both the `href` and the
   link text.

That is four literal occurrences of `{{ .ConfirmationURL }}` per file, because
the fallback line uses it twice. Miss the VML one and Outlook users get a button
that draws but goes nowhere. Miss the fallback one and the email has no rescue
path.

### 2. The visible URL fallback is never removed

The block that reads "If the button does not appear or does not work, copy and
paste this link into your browser" plus the raw URL under it is not decoration
and it is not clutter. It is the only part of the email that survives a client
we have never tested. Removing it to make the email look tidier reintroduces the
original support ticket. If someone asks for it to go, the answer is no.

`reauthentication.html` is the single exception, and only because it has no URL
at all. See below.

## Reauthentication is deliberately different

Supabase's Reauthentication email does not expose `{{ .ConfirmationURL }}`. It
carries a short code in `{{ .Token }}` that the person types back into the page
they are already on. There is no link, so there is no button, so the invisible
button bug cannot happen there. Pasting `{{ .ConfirmationURL }}` into it would
render an empty string and hand the recipient a dead control.

What does carry over is the fill technique: the code panel uses the `bgcolor`
attribute on its `<td>`, so Word based Outlook still paints it. Keep `bgcolor`
if you restyle that panel.

## What the app actually triggers today

Worth knowing before assuming a template is live:

- **Confirm signup**: fires from `supabase.auth.signUp` in
  `components/auth/SignUpForm.tsx`. Live.
- **Reset Password**: fires from `resetPasswordForEmail` in
  `app/api/auth/forgot-password/route.ts` and both settings pages. Live.
- **Magic Link**: no `signInWithOtp` call exists in the app. Note that
  `app/api/auth/send-confirmation/route.ts` calls
  `admin.generateLink({ type: 'magiclink' })`, which only *generates* a link and
  mails it through Resend with the app's own template. It does not trigger this
  Supabase template. So the Magic Link template is currently dormant, and this
  file is the correct body for whenever it is switched on.
- **Invite user**: no `inviteUserByEmail` call exists in the app. Only fires
  from a manual dashboard invite. The app has no invite acceptance screen, so an
  invited user lands on the redirect target with a session established by
  `app/auth/confirm/page.tsx`. Build the acceptance flow before inviting anyone
  at volume.
- **Change Email Address**: there is no user facing email change endpoint yet
  (see `lib/auth/email-change-policy.ts`). Only fires from a support or admin
  side change. When an endpoint is added, `evaluateEmailChange` has to gate it,
  because a domain change can otherwise reset the free post quota.
- **Reauthentication**: nothing in the app calls
  `supabase.auth.reauthenticate()`. Dormant.

## Do not invent expiry times

None of the new templates state how long a link lasts, on purpose. Link lifetime
is a project setting (Authentication > Sign In / Providers > Email > Email OTP
Expiration), not a fixed Supabase constant, and it can be changed at any time
without anyone touching these files. Copy that promises "expires in N hours"
becomes a lie the moment that field is edited.

Two consequences:

- If you want to state a duration, read the current value in the dashboard
  first, and accept that the copy now has to be updated whenever that value
  changes.
- `reset-password.html`, which shipped earlier, does say "This link expires in
  1 hour". That number was not verified against this project's setting as part
  of this change. Confirm it in the dashboard, then either leave it or correct
  it. It is the only expiry claim in the folder.

## Verifying a change

There is a static test at
`tests/regressions/supabase-auth-email-templates.test.ts`. It reads these files
and fails if a template loses its `bgcolor` attribute, its VML fallback, any of
the required `{{ .ConfirmationURL }}` occurrences, or the visible URL block. Run
`npx vitest run tests/regressions/supabase-auth-email-templates.test.ts`.

The test cannot tell you whether the email looks right. Before shipping a
visual change, send yourself a real one and check it in, at minimum:

- Outlook on Windows, the desktop app, which is the Word renderer and the whole
  reason for this markup,
- Gmail on the web,
- Gmail or Mail on a phone.

Confirm in each: the button has a teal fill, the label is readable, and the raw
URL under it is visible and selectable.

## Brand shell

All files share one shell so the whole estate reads as one product. If you
change a colour, change it in every file.

| Part | Colour |
| --- | --- |
| Page background | `#F5F0EB` |
| Card | `#FFFFFF` |
| Header band | `#F6D5C3` |
| Button fill | `#0D6B62` |
| Note card | `#FEF6E7` |
| Footer | `#1F2937` |
| Heading text | `#1F2937` |
| Body text | `#374151` |

Copy rules that apply inside these files as much as anywhere else: no em dashes
or en dashes in anything the recipient reads. Use colons, commas, or "X to Y".
