# Sign-in emails (confirm, sign-in link, reset password)

Supabase Auth sends these through Resend (custom SMTP, `smtp.resend.com`, port 587) as "Hooked on Pods".

## Why they're built this way (2026-11-24)

A friend's confirm link opened as "expired" after they found it in spam. Supabase's default links only work in the
browser that asked for the email (PKCE), so a link opened from the phone's mail app, or another browser, fails. Mail
scanners that open every link can also use one up first.

Our templates (`supabase/templates/`) fix both:

- The button goes to `/auth/confirm?token_hash=…`, which works on any device. That page shows one "Sign in" button and
  signs in only when it's tapped (a POST to `/auth/callback`), so a scanner opening the link doesn't use it up.
- Each email also carries a code (`{{ .Token }}`). The "Check your email" screen has a box for it, and "Send it again".
- An old-style `?code=` link opened in another browser now says so (`/login?error=device`): a new account is
  confirmed anyway, so the person can sign in with their password.

## Putting the templates into Supabase (dashboard, once per project)

The live (`hooked`) and test (`hooked-test`) projects read templates from the dashboard, not from this repo.
Supabase → the project → Authentication → Emails → Templates. For each of these three, set the subject and paste the
whole file into the body (Source), then Save:

| Template | Subject | File |
|---|---|---|
| Confirm sign up | Confirm your email for Hooked on Pods | `supabase/templates/confirmation.html` |
| Magic link | Your Hooked on Pods sign-in link | `supabase/templates/magic_link.html` |
| Reset password | Set a new password for Hooked on Pods | `supabase/templates/recovery.html` |

Also check Authentication → URL Configuration: Site URL `https://hookedonpods.com`, and Redirect URLs include
`https://hookedonpods.com/**`.

## Spam

DNS checked 2026-11-24: DKIM (`resend._domainkey`), SPF for the `send.` subdomain, and DMARC (`p=quarantine`, relaxed)
are all in place, so mail passes the checks. A new domain still lands in spam sometimes until it has a sending history;
"Not spam" taps from early users help. Keep auth emails plain (one button, no images).
