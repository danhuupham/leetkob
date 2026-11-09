# LeeTKOB Grade Publishing API — Contract (`POST /api/labs/{labId}/publish`), Version 1

**Course:** CSC13114 · Project Milestone `PA#2` · Frozen 09 Nov 2026  
**Product Owner FAQ Alignment:** [`FAQ-01`](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-01), [`FAQ-08`](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-08), [`FAQ-09`](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-09), [`FAQ-10`](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-10), [`FAQ-12`](https://github.com/tkob-team/LeeTKOB-FAQ/blob/main/FAQ.md#faq-12)

This file is the specification for publishing a lab's grades (`POST /api/labs/{labId}/publish`). [`test/contract/publish.contract.test.js`](../../test/contract/publish.contract.test.js) checks the implementation against every rule in this document. If the code and this file disagree, the code is wrong. If this file is wrong, change it in a separate commit that explains why — never quietly.

---

## 1. Conventions

- Every API endpoint in this slice lives under `/api`.
- Requests and responses use UTF-8 JSON (`application/json` for `2xx` responses, `application/problem+json` for all `4xx` and `5xx` responses).
- **Authentication:** Callers authenticate via `Authorization: Bearer <token>`.
- **Identifiers:** `labId` is a positive base-10 integer (`1, 2, 3, …`).
- **Timestamps:** `publishedAt` is a UTC timestamp string formatted as `YYYY-MM-DD HH:MM:SS` (SQLite `datetime('now')` in UTC, e.g. `2026-11-05 03:20:11`).
- **Forward Compatibility:** Clients must ignore response fields they do not know. The server ignores request object fields it does not know.

---

## 2. Errors (RFC 9457 Problem Details)

Every `/api` response with a `4xx` or `5xx` status — including a request for an `/api` path that does not exist — is an **RFC 9457 Problem Details** object with header `Content-Type: application/problem+json`:

```http
HTTP/1.1 409 Conflict
Content-Type: application/problem+json

{
  "type": "https://leetkob.example/problems/reviews-pending",
  "title": "Reviews pending",
  "status": 409,
  "detail": "1 submission still requires TA review before grades can be published",
  "pending": 1
}
```

### 2.1 Problem Details Members

| Member | Rule |
|---|---|
| `type` | `https://leetkob.example/problems/` followed by a slug from the table below. No other values are permitted. |
| `title` | The human-readable summary from the table below. |
| `status` | An integer equal to the HTTP status code of the response. |
| `detail` | One human-readable sentence describing **this** occurrence. Never contains a stack trace, an SQL query or SQLite error message, a database table/column name, or an internal file path. |
| `pending` | Present **only** on `409 reviews-pending`: a positive integer (`>= 1`) giving the exact number of submissions in `{labId}` whose constraint review is still awaiting a TA decision (`verdict IN ('violation', 'unsure')` and `decision IS NULL`). |
| `errors` | Present **only** on `400 validation`: an array of `{ "pointer", "detail" }` (for a body issue, with `""` for the root value) or `{ "parameter", "detail" }` (for a header/parameter such as `Idempotency-Key`). |

### 2.2 Problem Types (`slug` → `status`)

| Slug | Status | Title | When |
|---|---|---|---|
| `invalid-json` | 400 | Malformed JSON | Request carries a non-empty body that is not valid JSON. |
| `validation` | 400 | Invalid request | `Idempotency-Key` header is present on the request but is empty (whitespace only) or longer than 255 characters, or a non-empty JSON body is not a JSON object. |
| `unauthenticated` | 401 | Sign in first | `Authorization` header is missing, does not match `Bearer <token>`, or `<token>` does not belong to any known user. |
| `forbidden` | 403 | Only staff of this class may publish | Caller is authenticated as a `student` who is enrolled in `{labId}`'s class (`enrollments`). Because the student is enrolled in the class, they are permitted to know the lab exists, but they may never publish grades. |
| `not-found` | 404 | No such lab | `{labId}` is not a positive integer, no lab with `{labId}` exists, no such `/api` route exists, **or** the caller is neither `admin`, nor on `class_staff` for `{labId}`'s class, nor an enrolled student of `{labId}`'s class (for example, a TA of another class or a student of another class). Returning the exact same `404 not-found` status and body prevents cross-class IDOR enumeration. |
| `reviews-pending` | 409 | Reviews pending | One or more submissions in `{labId}` have `verdict` equal to `'violation'` or `'unsure'` with `decision IS NULL` (`FAQ-09`, `FAQ-12`). Includes `"pending": <count>`. |
| `internal` | 500 | Something went wrong | Any unhandled server fault. `detail` is the fixed generic sentence `"Something went wrong"`. |

Clients branch on `type` (and read `pending` when `type` is `https://leetkob.example/problems/reviews-pending`), never on `title` or `detail`.

---

## 3. Resources

### `PublishResult`

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

---

## 4. Endpoint — `POST /api/labs/{labId}/publish`

Publishes a lab's grades and confirmed constraint deductions to its enrolled students (`FAQ-08`, `FAQ-12`). **There is no undo.** This endpoint is the human gate of LeeTKOB: only a TA assigned to the lab's class or an administrator may execute it, and only after every pending review in the queue has been decided.

### 4.1 Who May Call It (Role and Ownership Matrix)

Per `FAQ-01` and Session 6, authorization checks **both** the caller's role (`admin`, `ta`, `student`) **and** their relationship to `{labId}`'s class (`class_staff` and `enrollments`):

| Caller Role | Ownership / Relationship to `{labId}`'s Class | Status & Problem Slug | Database Side Effect |
|---|---|---|---|
| Unauthenticated | No `Authorization` header, malformed header, or unknown token | `401 unauthenticated` | None (`published_at` unchanged) |
| `student` | Enrolled in `{labId}`'s class (`enrollments`) | `403 forbidden` | None (`published_at` unchanged) |
| `student` | Enrolled only in **other** classes (not in `{labId}`'s class) | `404 not-found` | None (`published_at` unchanged) |
| `ta` | Assigned to **other** classes (`class_staff`), **not** `{labId}`'s class | `404 not-found` | None (`published_at` unchanged) |
| `ta` | Assigned to `{labId}`'s class in `class_staff` | Allowed (`200 OK` or `409 reviews-pending`) | Sets `published_at` iff `pending === 0` and not yet published |
| `admin` | Global administrator across all classes | Allowed (`200 OK` or `409 reviews-pending`) | Sets `published_at` iff `pending === 0` and not yet published |

**Refusal Invariant:** A refused call (`400`, `401`, `403`, `404`, `409`, `500`) changes **nothing** in the database. After any `4xx` or `5xx` response, `labs.published_at` in SQLite is identical to what it was before the request arrived.

### 4.2 Request Specification

- **Method & Path:** `POST /api/labs/{labId}/publish`
- **Path Parameter:**
  | Parameter | Rule |
  |---|---|
  | `labId` | Positive base-10 integer (`/^[1-9]\d*$/`). Any non-integer, `0`, negative number, or unknown ID returns `404 not-found`. |
- **Request Headers:**
  | Header | Required | Rule |
  |---|---|---|
  | `Authorization` | Required | `Bearer <token>` identifying the caller. |
  | `Idempotency-Key` | Optional | If provided, a non-empty string of `1` to `255` characters after trimming. If provided as empty/whitespace-only or `> 255` characters, the server returns `400 validation` (`parameter: "Idempotency-Key"`). |
- **Request Body:**
  No request body is required (an empty payload or `{}` is standard). If the client sends a non-empty body:
  - If the payload is not valid JSON → `400 invalid-json`.
  - If the payload is valid JSON but not a JSON object (e.g. `[]`, `"text"`, `123`, `null`) → `400 validation` with `errors: [{ "pointer": "", "detail": "request body must be a JSON object or empty" }]`.

### 4.3 Ordered Evaluation Steps

The server evaluates every `POST /api/labs/{labId}/publish` request **in this exact order**, stopping at the first step that fails:

1. **Authentication:** Verify `Authorization: Bearer <token>` against `users.token`. If missing or unknown → `401 unauthenticated`.
2. **Path & Resource Lookup:** Verify `labId` matches `/^[1-9]\d*$/` and look up `labs.id = Number(labId)`. If invalid or no row exists → `404 not-found`.
3. **Role & Ownership Authorization (Before Any Write):** Check whether the caller is `admin` or listed in `class_staff` for `lab.class_id`. If not:
   - If the caller is listed in `enrollments` for `lab.class_id` → `403 forbidden`.
   - Otherwise (including a TA of another class or a student of another class) → `404 not-found`.
4. **Header & Body Validation:**
   - If the `Idempotency-Key` header is present and (`key.trim().length === 0` or `key.length > 255`) → `400 validation` with `errors: [{ "parameter": "Idempotency-Key", "detail": "must be 1 to 255 characters" }]`.
   - Read request body. If malformed JSON → `400 invalid-json`. If non-empty and not a plain JSON object → `400 validation` with `errors: [{ "pointer": "", "detail": "request body must be a JSON object or empty" }]`.
5. **Pending Review Gate (`FAQ-09`, `FAQ-12`):** Count submissions in `lab.id` where `verdict IN ('violation', 'unsure')` and `decision IS NULL`. If `pending > 0` → `409 reviews-pending` with `"pending": pending`.
6. **Idempotent Repeat Check (`FAQ-12`):** If `lab.published_at` is already non-null (or if the same `Idempotency-Key` was already recorded for this lab), return `200 OK` with `{ "lab": lab.id, "publishedAt": lab.published_at }` (plus response header `Idempotent-Replayed: true` when `Idempotency-Key` was repeated). Do not execute an `UPDATE`.
7. **Publish Transition:** Execute `UPDATE labs SET published_at = datetime('now') WHERE id = ? AND published_at IS NULL`, read back `published_at`, and return `200 OK` with `{ "lab": lab.id, "publishedAt": published_at }`.

### 4.4 Idempotency (`FAQ-12`)

Publishing a lab is a state transition (`unpublished → published`) that must be **safe to repeat**:

- **Natural State Idempotency:** Calling `POST /api/labs/{labId}/publish` a second, third, or Nth time on an already-published lab (with or without an `Idempotency-Key` header) returns `200 OK` and the **exact original `publishedAt` timestamp** from the first successful call. It never overwrites `published_at` and never moves the timestamp forward.
- **`Idempotency-Key` Header Support:** When a client supplies `Idempotency-Key: <key>` on the initial publish and retries with the same `Idempotency-Key`, the server returns `200 OK`, the identical `{ "lab", "publishedAt" }` body, and the header `Idempotent-Replayed: true`. The first response that performs the publish does not carry `Idempotent-Replayed`.
- **Errors Are Never Stored:** Any `4xx` response (such as `409 reviews-pending` while 1 submission is still unreviewed) leaves the lab unpublished and stores no idempotency record, so the TA can finish reviewing the queue and retry with the same `Idempotency-Key`.

---

## 5. Versioning and What Happens When It Changes

- **Additive Changes (Non-Breaking within v1):** Within `/api/labs/{labId}/publish`, only additive changes may be made without changing the path:
  - Adding a new optional request header or optional request body property.
  - Adding a new field to the `200 OK` `PublishResult` object (clients must ignore fields they do not recognize).
  - Adding a new endpoint under `/api`.
- **Breaking Changes Require `/api/v2`:** Any change that would break an existing client — renaming or removing `lab` or `publishedAt`, changing `publishedAt` from a UTC timestamp string to an integer epoch, changing any status code (`200`, `400`, `401`, `403`, `404`, `409`), changing any `type` URI in §2.2, removing `pending` from `409 reviews-pending`, or altering the `403` vs. `404` ownership distinction in §4.1 — requires a new versioned path (`/api/v2/labs/{labId}/publish`).
- **Deprecation & Sunset Lifecycle:** If `/api/v2/labs/{labId}/publish` is introduced, `/api/labs/{labId}/publish` continues running with its exact v1 behavior and error model until its announced sunset date, and every v1 response includes RFC 9745 `Deprecation`, RFC 8594 `Sunset`, and `Link` headers:
  ```http
  Deprecation: @1796083200
  Sunset: Thu, 31 Dec 2026 23:59:59 GMT
  Link: </api/v2/labs/2/publish>; rel="successor-version"
  ```
