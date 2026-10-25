# Commission recipient identity review

Affiliate and creator accounts require an explicit Affimaro owner identity approval before **new payout requests, business payout approval, bank payment recording or new Stripe transfer submission**. Order attribution, earned commission and business commission approval continue to operate. Existing bank/Stripe payment records are retained. No existing account is automatically verified by this migration.

Brands and agencies keep the existing business application review. They do not submit recipient identity documents through this workflow. A payment provider can impose its own account verification requirements; this manual review does not replace those requirements or certify regulatory compliance.

## Customer and owner workflow

- Customers open Earnings → Identity verification in `/partner/identity` or `/creator/identity` on the independent application.
- The form collects legal name, residence country/territory, government document type, front/photo page and selfie holding the document. Identity cards and driving licences also require the back.
- The customer attests these are their own details and authorizes manual review. The account must already have approved platform admission and an affiliate or creator primary role.
- The independent owner opens `/owner/identity` on the separate owner host. Account metadata can be filtered without decrypting documents. Opening private details and photos requires a recent authenticated sign-in, including enrolled MFA.
- Approval requires opening each current photo and explicitly confirming the decision. The owner compares the name, face, document validity/expiry and matching selfie. No automatic document authenticity or liveness verification is claimed.
- The owner can approve, decline, request changes, or withdraw an approval. Notes are visible to the recipient. Changing a prior approval blocks new payouts. Resubmitting an approved verification requires explicit acknowledgement and immediately returns it to pending.
- A declined/changes-requested/withdrawn account can resubmit. Pending submissions can only be replaced if the evidence is unavailable or expired. Every replacement has a new submission ID and a guarded revision. Approval from an older submission cannot verify a replacement.

## Private evidence handling

Photos are prepared in the browser as JPEG, with a maximum 1,600-pixel edge, and sent only to a same-origin authenticated upload endpoint. Each resulting file is limited to 512,000 bytes, and the complete multipart request to 1,560,000 bytes. Server JPEG checks enforce dimensions, markers and file bounds and strip application/comment metadata. These checks do not constitute a malware scan or full document validation.

Profile and photo ciphertext uses a dedicated HKDF/AES-GCM context derived from the existing original payment data key. Existing payment payloads, encrypted destinations, credentials, authentication encryption and payment key are unchanged. No new external identity provider or key is needed. The existing deployment migrates D1 before publishing the new Worker.

Files stay in private D1 rows, with opaque generated IDs and authenticated, non-cacheable image endpoints. No public storage URLs are created. Only the subject and platform owner may read current pending files; business partners cannot. The identity queue, financial dashboards and CSV exports contain no legal profile or photo ciphertext. Native Sites does not accept identity uploads; the independent application enforces recent authentication at its bridge.

Evidence becomes inaccessible after seven days. Bounded cleanup of expired evidence runs during subsequent submissions and reviews; this is not an exact-time scheduled deletion. Saving any review decision atomically deletes the submission's images. The minimal encrypted profile, status and review history remain until account closure removes the profile and evidence. Review notes/history can be retained with the existing operational closure record. The public privacy overview describes this use before collection. Do not put document numbers in review notes.

## Payment and recovery boundaries

New requests, approval and recording use both service-level checks and SQL guards inside the write transaction. Stripe eligibility is checked again immediately before a new transfer POST. Existing transfer lookups and reconciliation are still allowed after identity approval is withdrawn: a transfer already accepted by the provider must be accounted for without sending a duplicate. Existing idempotency keys, request bodies, transfer matching, ledger coverage, source-sync and pilot limits remain in force.

Bank/Wise records are manual: Affimaro cannot prevent a business sending money outside the application. The application withholds unpaid recipient destination details from the business while verification is unapproved and blocks recording a new completed payment. The recipient can still inspect their own saved destination, and the parties can inspect completed payment history.

## Validation

Use synthetic image fixtures and provider stubs only. Never upload real identity documents, approve a production identity, send a real email or create a real payment as a QA shortcut. Relevant source guidance: [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html), [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/).
