# `POST /api/labs/{labId}/publish`

Publishes a lab's grades to its students. **There is no undo.** This is the human gate of
LeeTKOB: the step a TA takes after reviewing, and nobody else.

## Who may call it

| Caller | Result |
|---|---|
| no token, or a token we do not know | `401` |
| a TA on the staff of the lab's class, or an admin | allowed |
| a student enrolled in the lab's class | `403`: they know this lab exists |
| anyone else, including a TA of another class | `404`: same body as a lab that does not exist |

A refused call changes **nothing**: after any `4xx`, `published_at` is what it was before.

## Request

No body. The lab comes from the path.

## Response

`200 OK`, `application/json`:

```json
{ "lab": 1, "publishedAt": "2026-11-05 03:20:11" }
```

## Rules

- **It refuses while reviews are pending.** A submission with verdict `violation` or `unsure`
  and no TA decision is pending. Nothing is published, and the response is `409`.
- **It is safe to repeat.** Calling it again on a published lab returns `200` with the same
  `publishedAt`. It does not publish again and does not move the time.

## Errors

Every error is problem details (RFC 9457), `application/problem+json`, with `type`, `title`
and `status`.

| Status | `type` | When |
|---|---|---|
| 401 | `https://leetkob.example/problems/unauthenticated` | no token, or an unknown one |
| 403 | `https://leetkob.example/problems/forbidden` | a student of this class |
| 404 | `https://leetkob.example/problems/not-found` | no such lab, or not your class |
| 409 | `https://leetkob.example/problems/reviews-pending` | reviews pending; the body also has `pending`, the number of them |
