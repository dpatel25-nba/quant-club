# Research Tools member accounts

The website supports approved members signing in with email and password through Supabase Auth. Overview, Membership and Apply remain public. All six research data APIs verify membership on the server.

## Enable accounts

1. Create a Supabase project. In Authentication settings, disable public sign-ups and set the access-token lifetime to 3,600 seconds or less. Configure a strong password policy and Supabase's authentication rate limits.
2. Create member accounts in Authentication → Users. Use confirmed email addresses for members whose identity you have verified. Distribute their credentials privately; do not commit credentials to this repository.
3. Grant each member `app_metadata.research_access: true` using Supabase's admin API. This is **app metadata**, not user metadata. For example, in a trusted admin script with the Supabase SDK:

   ```js
   await supabase.auth.admin.updateUserById(memberUserId, {
     app_metadata: { research_access: true }
   });
   ```

   The admin client requires a Supabase secret/service-role key. Keep that key solely in your trusted administration environment. This website does not need it. See [Supabase's admin API](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid).
4. In the website's Vercel project, add `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` from Supabase's project connection settings. Use the publishable key, **not** a secret/service-role key. Add `APP_ORIGIN` if the website uses an origin other than `https://quant-club.vercel.app`; it must match the browser's origin exactly, without a trailing slash.
5. Redeploy. `/api/auth` should return `{"mode":"accounts","user":null}` before sign-in. Check an approved account, an unapproved account, sign-out and a Research Tools deep link. Anonymous data API requests must return 401.

Both Supabase variables absent preserves existing club-password access. Partial configuration fails closed with 503. Once accounts are configured, the club password no longer grants access. Removing both variables deliberately re-enables the legacy gate.

## Access and sessions

- Approval requires a verified email and `app_metadata.research_access === true`. Revoke access by setting that flag to false; the next API request checks the provider again.
- Sessions use a Secure, HttpOnly, SameSite=Lax cookie with a one-hour maximum lifetime. Tokens are never returned to browser JavaScript. There is no automatic refresh: members sign in again when their session ends.
- Sign-out clears this browser's cookie and requests local provider logout. Supabase access JWTs can remain valid until their original expiry; revoking the approval flag blocks future research API requests immediately.
- Account approval is checked on every data request. The browser checks session status every minute while visible and when returning to the tab. Logout or account changes reload the page to clear in-memory research data.
- Research notes and model drafts remain local to the browser, namespaced by account ID. They do not sync across devices. This separates ordinary account use; local storage is not encrypted or protected from someone with browser-profile access. Existing shared-password drafts remain in the legacy namespace; export them before switching and import under the intended account.
- Login/logout require same-origin JSON requests. Per-instance login throttling supplements Supabase's provider rate limits; it is not a distributed rate limiter. Protected responses cannot be cached by the shared CDN.
- Password resets are currently handled by club organizers through the auth administration workflow. There is no public registration or self-service recovery UI.

## Local verification

Run `node --experimental-default-type=module test/check_auth.mjs` (Node 22+) for the production auth code with fake provider responses. Browser coverage is in `test/check_auth_browser.py` and the existing research-tool regression tests. All tests use synthetic credentials. No production member credentials are required.

For local end-to-end provider testing use HTTPS and set `APP_ORIGIN` to that exact origin. The production cookie always remains Secure and uses the `__Host-` prefix.
