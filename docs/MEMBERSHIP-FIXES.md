# Membership form and designation fixes

Mishra ji reported that a member could not enter their mail ID or role, and that an administrator could not allocate the role on the existing record.

## Implemented

- The member form now has an editable **Your contact email** field and **Requested role / programme** field.
- The original invitation email remains visible as a read-only identity field. A contact-address change does not transfer invitation access, replace the secure-link recipient, or silently verify a new email address.
- Member-supplied contact email and requested designation persist in the profile and are shown in the submitted summary and administrator review.
- Administrators and owners can open an existing active record and select **Save membership designation**. This works after profile submission as well as before it.
- The assignment endpoint checks `invite` permission server-side. Maintainers, viewers and invitees cannot assign the approved title. Each change records an audit event.
- Requested and approved membership designations are explicitly labelled separately. Neither field grants administrator access. Staff permissions remain restricted to the existing owner-managed staff flow.
- The database-backed public demo follows the same boundaries. It accepts only fictional example.org/example.com/example.net contact addresses and never changes live membership data.

No database migration is needed because the new member fields are stored in the existing profile JSON. No live email sending is enabled by these changes. A different contact address must be independently verified before it is used for secure account access or invitation delivery.

## Validation

Integration tests cover submitted values, invalid contact email, invitation identity preservation, secure receipt destination, administrator assignment on an existing record, audit evidence, maintainer/viewer/member denial and prevention of software-role injection. The isolated Postgres-backed demo has a corresponding persistence and access-boundary test.
