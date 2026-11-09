# LeeTKOB Grade Publishing API — Contract (`POST /api/labs/{labId}/publish`), Version 1

**Course:** CSC13114 · Project Milestone `PA#2` · Frozen 09 Nov 2026  
**Product Owner FAQ Alignment:** [`FAQ-01`](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-01), [`FAQ-08`](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-08), [`FAQ-09`](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-09), [`FAQ-10`](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-10), [`FAQ-11`](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-11), [`FAQ-12`](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-12), [`FAQ-13`](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-13)

This file is the specification for publishing a lab's grades (`POST /api/labs/{labId}/publish`). [`test/contract/publish.contract.test.js`](../../test/contract/publish.contract.test.js) checks the implementation against every rule in this document. If the code and this file disagree, the code is wrong. If this file is wrong, change it in a separate commit that explains why — never quietly.

---

## 1. Conventions

- Every API endpoint in this slice lives under `/api`.
- Requests and responses use UTF-8 JSON (`application/json` for `2xx` responses, `application/problem+json` for all `4xx` and `5xx` responses).
- **Authentication:** Callers authenticate via `Authorization: Bearer <token>` (exact `Bearer ` scheme prefix required).
- **Identifiers:** `labId` is a positive base-10 integer (`1, 2, 3, …`).
- **Timestamps:** `publishedAt` and `deadlineAt` are UTC timestamp strings formatted as `YYYY-MM-DD HH:MM:SS` (SQLite `datetime('now')` in UTC, e.g. `2026-11-05 03:20:11`).
- **Forward Compatibility:** Clients must ignore response fields they do not know. The server ignores request object fields it does not know.

---

## 2. Errors (RFC 9457 Problem Details)

Every `/api` response with a `4xx` or `5xx` status — including a request for an `/api` path that does not exist (even when sent without an `Authorization` header) — is an **RFC 9457 Problem Details** object with header `Content-Type: application/problem+json`:

```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{
  "type": "https://leetkob.example/problems/reviews-pending",
  "title": "Reviews pending",
  "status": 409,
  "detail": "1 submission(s) still require TA review before grades can be published",
  "pending": 1
}
```

### 2.1 Problem Details Members

| Member | Rule |
|---|---|
| `type` | `https://leetkob.example/problems/` followed by a slug from §2.2 below. No other values are emitted by any `/api` route. |
| `title` | The human-readable summary from §2.2 below. |
| `status` | An integer equal to the HTTP status code of the response. |
| `detail` | One human-readable sentence describing **this** occurrence. Never contains a stack trace, an SQL query or SQLite error message, a database table/column name, or an internal file path. |
| `pending` | Present **only** on `409 reviews-pending`: a positive integer (`>= 1`) giving the exact number of submissions in `{labId}` whose constraint review is still awaiting a TA decision (`verdict IN ('violation', 'unsure')` and `decision IS NULL`). |
| `deadlineAt` | Present **only** on `409 deadline-not-passed`: the lab's UTC submission deadline string (`YYYY-MM-DD HH:MM:SS`) that has not yet passed (`FAQ-12`). |
| `errors` | Present **only** on `400 validation`: an array of `{ "pointer", "detail" }` (for a body issue, with `""` for the root value) or `{ "parameter", "detail" }` (for a header/parameter such as `Idempotency-Key`). |

### 2.2 Problem Types (`slug` → `status`)

| Slug | Status | Title | When |
|---|---|---|---|
| `invalid-json` | 400 | Malformed JSON | Request carries a non-empty body that is not valid JSON. |
| `validation` | 400 | Invalid request | `Idempotency-Key` header is present on the request but is empty (whitespace only) or longer than 255 characters, or a non-empty JSON body fails a schema rule (such as not being a JSON object). |
| `unauthenticated` | 401 | Sign in first | On a valid `/api` route, `Authorization` header is missing, does not use the `Bearer <token>` scheme, or `<token>` does not belong to any known user. |
| `forbidden` | 403 | Only staff of this class may publish | Caller is authenticated as a `student` who is enrolled in `{labId}`'s class (`enrollments`). Because the student is enrolled in the class, they are permitted to know the lab exists, but they may never publish grades. |
| `not-found` | 404 | No such lab | No such `/api` route exists (checked before authentication), `{labId}` is not a positive integer, no lab with `{labId}` exists, **or** the caller is neither `admin`, nor on `class_staff` for `{labId}`'s class, nor an enrolled student of `{labId}`'s class (e.g. a TA of another class or a student of another class). Returning the exact same `404 not-found` status and body prevents cross-class IDOR enumeration. |
| `deadline-not-passed` | 409 | Submission deadline has not passed | The lab's submission deadline is still in the future (`labs.deadline_at > datetime('now')`, `FAQ-12` Condition 1). Includes `"deadlineAt": "<YYYY-MM-DD HH:MM:SS>"`. |
| `reviews-pending` | 409 | Reviews pending | One or more submissions in `{labId}` have `verdict` equal to `'violation'` or `'unsure'` with `decision IS NULL` (`FAQ-09`, `FAQ-12` Condition 2). Includes `"pending": <count>`. |
| `internal` | 500 | Something went wrong | Any unhandled server or database fault. `detail` is the fixed generic sentence `"Something went wrong"`. |

Clients branch on `type` (and read `pending` on `reviews-pending` or `deadlineAt` on `deadline-not-passed`), never on `title` or `detail`.

---

## 3. Resources and Domain Effects

### 3.1 `PublishResult`

Returned on `200 OK` when a lab is published (or when a publish call is safely repeated on an already-published lab):

```json
{
  "lab": 2,
  "publishedAt": "2026-11-05 03:20:11"
}
```

| Field | Type | Rule |
|---|---|---|
| `lab` | integer | Positive integer equal to `{labId}` from the request path. |
| `publishedAt` | string | Non-empty UTC timestamp (`YYYY-MM-DD HH:MM:SS`) recording the exact instant `{labId}` first transitioned from unpublished (`NULL`) to published. |

### 3.2 What Publishing Changes for Students (`FAQ-08`, `FAQ-11`, `FAQ-12`, `FAQ-13`)

- **Before `publishedAt` is set (`published_at IS NULL`):** Enrolled students only see test execution verdicts (`AC`, `WA`, `TLE`, `MLE`, `RE`, `CE`). All constraint review verdicts (`pass`, `violation`, `unsure`) and deductions are hidden (`FAQ-08`).
- **Once `publishedAt` is set (`published_at IS NOT NULL`):**
  1. Enrolled students can view their final lab mark (`max(0, 10 - sum(confirmed_deductions))`, `FAQ-11`) and each confirmed deduction (`decision = 'confirm'`), including the constraint text, deduction points, evidence source lines, and reason (`FAQ-08`).
  2. Overturned suggestions (`decision = 'overturn'`), raw `unsure` verdicts, and whether a `pass` submission was part of the random 10% audit sample remain **permanently hidden** from students (`FAQ-08`, `FAQ-10`).
  3. The 7-day student appeal window (`publishedAt` + 7 days) opens for each confirmed deduction (`FAQ-13`).
  4. Publishing applies to the **entire lab at once** and cannot be undone (`FAQ-12`).

---

## 4. Endpoint — `POST /api/labs/{labId}/publish`

Publishes a lab's grades and confirmed constraint deductions to its enrolled students (`FAQ-08`, `FAQ-12`). **There is no undo.** This endpoint is the human gate of LeeTKOB: only a TA assigned to the lab's class or an administrator may execute it, and only after the submission deadline has passed and every pending review in the queue has been decided.

### 4.1 Who May Call It (Role and Ownership Matrix)

Per `FAQ-01` and Session 6, authorization checks **both** the caller's role (`admin`, `ta`, `student`) **and** their relationship to `{labId}`'s class (`class_staff` and `enrollments`):

| Caller Role | Ownership / Relationship to `{labId}`'s Class | Status & Problem Slug | Database Side Effect |
|---|---|---|---|
| Unauthenticated | Missing `Authorization` header, non-`Bearer` scheme, or unknown token | `401 unauthenticated` | None (`published_at` unchanged) |
| `student` | Enrolled in `{labId}`'s class (`enrollments`) | `403 forbidden` | None (`published_at` unchanged) |
| `student` | Enrolled only in **other** classes (not in `{labId}`'s class) | `404 not-found` | None (`published_at` unchanged) |
| `ta` | Assigned to **other** classes (`class_staff`), **not** `{labId}`'s class | `404 not-found` | None (`published_at` unchanged) |
| `ta` | Assigned to `{labId}`'s class in `class_staff` | Allowed (`200 OK` or `409`) | Sets `published_at` iff deadline passed, `pending === 0`, and not yet published |
| `admin` | Global administrator across all classes | Allowed (`200 OK` or `409`) | Sets `published_at` iff deadline passed, `pending === 0`, and not yet published |

**Refusal Invariant:** A refused call (`400`, `401`, `403`, `404`, `409`, `500`) changes **nothing** in the database. After any `4xx` or `5xx` response, `labs.published_at` and `idempotency_keys` in SQLite are identical to what they were before the request arrived.

### 4.2 Request Specification

- **Method & Path:** `POST /api/labs/{labId}/publish`
- **Path Parameter:**
  | Parameter | Rule |
  |---|---|
  | `labId` | Positive base-10 integer (`/^[1-9]\d*$/`). Any non-integer, `0`, negative number, or unknown ID returns `404 not-found`. |
- **Request Headers:**
  | Header | Required | Rule |
  |---|---|---|
  | `Authorization` | Required | `Bearer <token>` identifying the caller. Any other scheme (e.g. `Basic`) returns `401 unauthenticated`. |
  | `Idempotency-Key` | Optional | If provided, a string of `1` to `255` characters whose trimmed length is `>= 1`. If provided as empty/whitespace-only (`"   "`) or `> 255` characters, returns `400 validation` (`parameter: "Idempotency-Key"`). |
- **Request Body:**
  No request body is required (an empty payload or `{}` is standard). If the client sends a non-empty body:
  - If the payload is not valid JSON → `400 invalid-json`.
  - If the payload is valid JSON but not a JSON object (e.g. `[]`, `"text"`, `123`, `null`) → `400 validation` with `errors: [{ "pointer": "", "detail": "request body must be a JSON object or empty" }]`.

### 4.3 Ordered Evaluation Steps

The server evaluates every request **in this exact order**, stopping at the first step that fails:

1. **Route Match:** Verify the request method and path match `POST /api/labs/{labId}/publish` (or another registered route). If no route matches → `404 not-found` (even without an `Authorization` header).
2. **Authentication:** Verify `Authorization: Bearer <token>` against `users.token`. If missing, wrong scheme, or unknown token → `401 unauthenticated`.
3. **Path & Resource Lookup:** Verify `labId` matches `/^[1-9]\d*$/` and look up `labs.id = Number(labId)`. If invalid or no row exists → `404 not-found`.
4. **Role & Ownership Authorization (Before Any Write):** Check whether the caller is `admin` or listed in `class_staff` for `lab.class_id`. If not:
   - If the caller is listed in `enrollments` for `lab.class_id` → `403 forbidden`.
   - Otherwise (including a TA of another class or a student of another class) → `404 not-found`.
5. **Header & Body Validation:**
   - If the `Idempotency-Key` header is present and (`key.trim().length === 0` or `key.length > 255`) → `400 validation` with `errors: [{ "parameter": "Idempotency-Key", "detail": "must be 1 to 255 non-empty characters" }]`.
   - Read request body. If malformed JSON → `400 invalid-json`. If non-empty and not a plain JSON object → `400 validation` with `errors: [{ "pointer": "", "detail": "request body must be a JSON object or empty" }]`.
6. **Deadline Precondition (`FAQ-12` Condition 1):** Check `labs.deadline_at <= datetime('now')`. If the deadline has not passed → `409 deadline-not-passed` with `"deadlineAt": lab.deadline_at`.
7. **Pending Review Gate (`FAQ-09`, `FAQ-12` Condition 2):** Count submissions in `lab.id` where `verdict IN ('violation', 'unsure')` and `decision IS NULL`. If `pending > 0` → `409 reviews-pending` with `"pending": pending`.
8. **Idempotency & Atomic Publish Transition (`FAQ-12`):**
   - Look up `(lab.id, Idempotency-Key)` in SQLite `idempotency_keys` where `created_at >= datetime('now', '-24 hours')`.
   - If `lab.published_at` is `NULL`, execute `UPDATE labs SET published_at = datetime('now') WHERE id = ? AND published_at IS NULL`.
   - If `Idempotency-Key` was provided and was not yet in `idempotency_keys`, insert `(lab.id, key, me.id, published_at)` into `idempotency_keys` and return `200 OK` with `{ "lab": lab.id, "publishedAt": published_at }` (without `Idempotent-Replayed`).
   - If `Idempotency-Key` was already recorded in `idempotency_keys` within the last 24 hours, return `200 OK` with `{ "lab": lab.id, "publishedAt": published_at }` and header `Idempotent-Replayed: true`.

### 4.4 Idempotency Rules (`FAQ-12`)

Publishing a lab is a state transition (`unpublished → published`) that must be **safe to repeat**:

- **Natural State Idempotency:** Calling `POST /api/labs/{labId}/publish` a second, third, or Nth time on an already-published lab (with or without an `Idempotency-Key` header) returns `200 OK` and the **exact original `publishedAt` timestamp** from the first successful call. It never overwrites `published_at` and never moves the timestamp forward.
- **`Idempotency-Key` Scope & Persistence:** Keys are persisted in SQLite table `idempotency_keys` with composite primary key `(lab_id, key)` and retained for **at least 24 hours** (`created_at >= datetime('now', '-24 hours')`). Using the same key string on two different labs (`lab 1` and `lab 2`) does not collide.
- **Cross-User Replay on the Same Lab:** Because `POST /api/labs/{labId}/publish` takes no user-specific body and transitions the shared lab resource, if one authorized staff member (e.g. `ta_b`) publishes Lab 2 with `Idempotency-Key: k1` and another authorized staff member (e.g. `admin`) retries Lab 2 with `Idempotency-Key: k1`, the server returns `200 OK` with the stored `{ "lab", "publishedAt" }` and `Idempotent-Replayed: true`. Unauthorized users are rejected at Steps 2–4 before any key lookup.
- **Errors Are Never Stored:** Any `4xx` or `5xx` response (such as `409 reviews-pending` or `409 deadline-not-passed`) leaves the lab unpublished and inserts nothing into `idempotency_keys`. Once the TA finishes reviewing the queue (or the deadline passes), retrying with the **exact same** `Idempotency-Key` succeeds with `200 OK` (`Idempotent-Replayed` absent on that first success, and `true` on subsequent retries).

---

## 5. Versioning and What Happens When It Changes

- **Additive Changes (Non-Breaking within v1):** Within `/api/labs/{labId}/publish`, only additive changes may be made without changing the path:
  - Adding a new optional request header or optional request body property.
  - Adding a new field to the `200 OK` `PublishResult` object (clients must ignore fields they do not recognize).
  - Adding a new endpoint under `/api`.
- **Breaking Changes Require `/api/v2`:** Any change that would break an existing client — renaming or removing `lab` or `publishedAt`, changing `publishedAt` from a UTC timestamp string to an integer epoch, changing any status code (`200`, `400`, `401`, `403`, `404`, `409`, `500`), changing any `type` URI in §2.2, removing `pending` from `409 reviews-pending` or `deadlineAt` from `409 deadline-not-passed`, or altering the `403` vs. `404` ownership distinction in §4.1 — requires a new versioned path (`/api/v2/labs/{labId}/publish`).
- **Deprecation & Sunset Lifecycle:** If `/api/v2/labs/{labId}/publish` is introduced, `/api/labs/{labId}/publish` continues running with its exact v1 behavior and error model until its announced sunset date, and every v1 response includes RFC 9745 `Deprecation`, RFC 8594 `Sunset`, and `Link` headers:
  ```http
  Deprecation: @1796083200
  Sunset: Thu, 31 Dec 2026 23:59:59 GMT
  Link: </api/v2/labs/2/publish>; rel="successor-version"
  ```
