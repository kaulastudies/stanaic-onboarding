# Private manuscript attachments

Authors can attach an anonymised PDF or UTF-8 `.txt` file to an existing text-manuscript submission from the journal workspace. This supplements the submission's text and abstract; it does not replace them.

- Maximum 2 MB per file, 30 files and 10 MB per workspace. Public demonstration workspaces share a 50 MB attachment ceiling, enforced transactionally across uploads.
- Bytes are stored separately from operational JSON state in the existing PostgreSQL database. No additional storage credential is needed.
- An author may attach before review and during requested revisions. Review-stage attachments are locked. Stored files retain their manuscript version, SHA-256 checksum and uploader reference.
- Only the author, editorial staff and assigned reviewers can download. Membership administrators, unrelated learners and unassigned reviewers cannot access files. Download URLs are authenticated; knowing the file ID is insufficient.
- Reviewer listings and download filenames omit the original author-supplied filename. Authors must remove identifying text and document metadata before upload; the system does not claim automatic anonymisation.
- Content is served as a private attachment with no-store and no-sniff headers, never inline. Unsupported types, binary text and PDFs containing detected interactive/encrypted features are rejected. This is a bounded format check, not a malware scan or a guarantee that a PDF is harmless.
- Attachment publication is not automatic. Public articles continue to use the accepted manuscript text after author proof/licence approval; private review files are not exposed on the public article page.
- Demo files belong to the isolated six-hour workspace and are removed when that workspace expires. Retention, archival preservation and external scanning for larger institutional use remain deployment-policy work.

Endpoints (all under `/api/platform` so isolated demo cookies retain their existing boundary):

| Endpoint | Method | Purpose |
|---|---|---|
| `/files/list?mode=demo&submissionId=…` | GET | Role-scoped file metadata |
| `/files/upload` | POST | Same-origin JSON `{mode,submissionId,name,base64,anonymised:true}` |
| `/files/download/:id?mode=demo` | GET | Authenticated private download |

Omit `mode=demo` for verified live accounts. Limits are checked again on the server under the workspace row lock. Duplicate bytes within the same submission version reuse the prior file record.
