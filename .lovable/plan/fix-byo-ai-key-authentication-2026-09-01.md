# Fix BYO AI key authentication

## Goal
Stop valid non-Google keys from being routed to Google, verify credentials before saving, and show the provider's real rejection reason without crashing the tutor view.

## Changes
1. **Provider routing**
   - Treat the provider selected in Settings as authoritative.
   - Remove the unsafe `AQ.` prefix guess that currently redirects some credentials to Google.
   - Use only Google’s documented API-key header for Google AI Studio requests instead of retrying the same credential as an OAuth bearer token.

2. **Credential verification**
   - Test the selected provider/key with a minimal AI request before storing it.
   - Save only after the provider successfully responds; preserve the existing saved key if replacement validation fails.
   - Update Settings feedback so “Connected” means the credential was actually verified.

3. **Error handling**
   - Preserve the bounded provider response message for 401/403 errors so restrictions, billing, malformed keys, and wrong-provider choices are distinguishable.
   - Keep failures inside the tutor conversation rather than allowing a server-function rejection to produce a blank-screen runtime overlay.

4. **Verification**
   - Run focused type/build checks and exercise the Settings save flow plus tutor error rendering in the live app.

## Technical notes
- No keys will be logged, returned to the browser after saving, or sent to providers other than the provider explicitly selected by the student.
- Existing AI tools and provider choices remain unchanged.
