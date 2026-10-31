# Member announcements and LinkedIn publication

This module supplies a working 1200×627 PNG announcement editor, optional locally loaded photograph, editable member-welcome copy, image download, clipboard copy, consent-backed public announcement page and a server-side LinkedIn Images/Posts API adapter. It never uses the user's browser cookies or password to post.

## Available now

Open `/announcements?demo=1` for a fictional sample. Image generation, photograph upload, deterministic text generation, text editing, PNG download and clipboard copy work without API credentials. These exports do not claim to have published anything. The default is a reusable STANAIC welcome template, not a representation of GuoMing's exact article style: the supplied LinkedIn article could not be fetched during implementation. No new credentials or professional achievements are invented.

For live records, sign in as an existing owner or administrator, then open `/announcements?memberId=<approved-invitation-id>`. Only approved records from the live invitations table are accepted. The approved name and membership designation come from that record, not from arbitrary browser fields. Maintainers, viewers, demo accounts and anonymous callers cannot approve or publish live announcements.

Staff records a separate public-announcement permission reference and attests the member authorised the text, supplied photo and optional LinkedIn mention. Ordinary onboarding consent is insufficient. The button **Approve public announcement package** explicitly publishes the approved text and rendered image at `/welcome/<id>` and records the consent reference, staff actor and time. No LinkedIn post is created at this point. The public image endpoint and welcome page verify the source member remains approved and the approved name/designation still match the package; revoking membership or changing either hides the stale package, subject to the image's short cache lifetime. Publication also rechecks this snapshot. Before a post has been sent, regenerating from the current record and approving with a new request key replaces the package and resets image processing. Published or uncertain records cannot be silently overwritten.

## Connect a LinkedIn author

Configure runtime secrets/settings through the hosting environment, never in this repository:

| Variable | Meaning |
|---|---|
| `LINKEDIN_ACCESS_TOKEN` | OAuth access token issued to the app for the account/Page being used |
| `LINKEDIN_AUTHOR_URN` | Verified `urn:li:person:…` for GuoMing or `urn:li:organization:…` for the corporate Page |
| `LINKEDIN_VERSION` | Supported versioned API header, e.g. the inspected API contract `202606`; review LinkedIn's supported-version lifecycle before changing |
| `SITE_URL` | Canonical HTTPS origin used for public announcement OpenGraph images |

The connection status UI reports configuration only. It does not claim a token is valid or permissions have been granted until the provider accepts the real calls. One configured author is active per deployment. Select the matching personal/corporate voice; a mismatched destination is rejected. Multiple authors should use distinct encrypted OAuth connections in a subsequent account-connection extension rather than placing tokens in browser storage.

Required external steps:

1. Create or use a LinkedIn developer app, configure its HTTPS OAuth callback and eligible products.
2. GuoMing explicitly authorises posting from his personal account using `w_member_social` (Share on LinkedIn product); a corporate Page requires appropriate Page roles plus `w_organization_social` and eligible Community Management access.
3. Obtain author identity from the authorised app context; never derive it from an `/in/` vanity name or an `ACo…` UI identifier. Store runtime secrets securely.
4. Connect any required image-status read permission. The current Images API documentation says a versioned GET can be forbidden with only `w_member_social`. This implementation checks `AVAILABLE` before creating the post; a permission failure is reported, not bypassed or misrepresented as success. A personal token with write-only scope alone may therefore need additional approved access before this path can publish.
5. Verify a staff-approved announcement in a controlled production pilot. Test code uses mocked API calls and never posts to LinkedIn.

OAuth token issuance is outside this module's environment-token connector. The app does not create a LinkedIn developer app, accept terms, authorise GuoMing, or grant itself Page access. Reconnect/rotate credentials as required; programmatic refresh is limited to approved LinkedIn partners.

## Mentions

The optional `urn:li:person:…` field must be returned by an authorised LinkedIn integration and confirmed by the administrator. It is not scraped or guessed. The Posts API uses the `@[Exact Name](urn:li:person:…)` commentary form and LinkedIn's name matching is case-sensitive. Public profile links remain ordinary links unless a valid mention URN is present.

LinkedIn's restricted People Typeahead API supports searching a Page's followers by keyword or exact public profile URL. It requires `r_organization_followers` and select-developer access, and returns only Page followers. That lookup is not falsely represented as a generally available service in this package. If the app lacks access, manually select the person in LinkedIn's native composer for the manual posting route.

## Publishing and duplicate control

1. Approve the member's package and consent record in the server database.
2. The explicit **Publish image & announcement to LinkedIn** action validates staff authorisation, source member approval, configured destination and package status.
3. A database compare-and-set claims the upload, registers an image through `/rest/images?action=initializeUpload`, uploads the PNG to the provider-issued URL and stores the image URN.
4. The server reads image status. If processing, the UI reports pending; **Check image & publish** may resume image readiness. No post exists yet.
5. A second atomic state claim moves `image_pending` to `publishing`. It sends one `/rest/posts` request with image URN, reviewed commentary and optional mention.
6. Only a `201` response with an expected `x-restli-id` creates a `published` record. The returned post reference and URL are stored and an audit event is written.
7. Timeout, interrupted response, provider 5xx or an unrecognised successful response becomes `uncertain`. No automatic repost is allowed. A crash after claiming publication also leaves a blocked state. Check the provider first and reconcile the stored record before any new attempt. Do not blindly reset to approved.

`request_key` is unique per administrator request, and `(member_id,author_urn)` is unique per destination. Replayed approve/publish requests return the existing record rather than creating duplicate posts. A known 4xx rejection is recorded as rejected; admin remediation is required. Upload failures can retry because no post-creation request has been made. No blanket claim of exactly-once remote delivery is made.

The additive `platform_social_announcements` table is created on server use. It contains the approved PNG as base64, text, canonical source member ID, consent attestation, status, provider references and timestamps. It contains no LinkedIn token. Existing onboarding tables and authentication remain the source of staff and member authority.

## Manual sharing fallback

The link-sharing button opens LinkedIn with the approved public announcement URL. Its OpenGraph metadata references the approved PNG, so LinkedIn may render a preview. This is a URL share, not an uploaded-image post. It cannot insert a person tag or automatically press Publish. The UI labels this distinction. PNG download + copied text remain usable while the API connection is pending.

## Checks

`node --test tests/linkedin.test.mjs` covers URL and PNG validation, staff permissions, mention construction, mocked upload/post payloads, pending and uncertain provider states, and a transactional PGlite lifecycle with approval gating, publicity consent, duplicate prevention, revocation and no real network writes. Production Page scope, real media processing, final mention rendering and delivery require authorised integration testing.

Primary documentation inspected 31 October 2026:

- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-api?view=li-lms-2026-06
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/images-api?view=li-lms-2026-06
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/shares/posts-atmention-search-api?view=li-lms-2026-06
- https://learn.microsoft.com/en-us/linkedin/marketing/community-management/community-management-overview?view=li-lms-2026-08
- https://learn.microsoft.com/en-us/linkedin/shared/authentication/authorization-code-flow
- https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/profile-api
- https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/plugins/share-plugin
