# Public Freelancer Profile API

Read-only, unauthenticated endpoints that let external consumers and clients pull a freelancer's public record: profile, completed contracts, reviews, and an aggregated reputation score.

- **Base path**: `/api/public/freelancers/{id}`
- **`id`**: the integer primary key from `users.id`
- **Methods**: `GET` only
- **Auth**: none — these endpoints are deliberately public and expose public data only
- **Rate limit**: 120 requests/minute per IP, per endpoint
- **Cache**: `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` on every `200`

Implementation lives in [`lib/publicFreelancerProfile.ts`](../lib/publicFreelancerProfile.ts); supporting indexes in [`scripts/011-public-profile-indexes.sql`](../scripts/011-public-profile-indexes.sql).

---

## Response conventions

Every endpoint answers with the same envelope, so a client can handle all four the same way.

**Success — single resource**

```json
{ "data": { } }
```

**Success — collection**

```json
{ "data": [], "meta": { "page": 1, "limit": 20, "totalCount": 0, "totalPages": 0, "hasNextPage": false } }
```

**Error**

```json
{ "error": "Freelancer not found", "code": "FREELANCER_NOT_FOUND" }
```

`error` is a human-readable sentence and may be reworded at any time; **branch on `code`, never on `error`**.

Other conventions:

| Rule | Detail |
|------|--------|
| **Timestamps** | ISO 8601 UTC (`2026-06-01T12:00:00.000Z`). |
| **Money** | Decimal **strings** (`"1500.000000"`), never floats — `total_amount` is `DECIMAL(18,6)` and JSON numbers would lose precision. |
| **Ratings** | Numbers on the 1–5 review scale, rounded to 2dp. `null` means "no data", never `0`. |
| **Absent data** | `null`. Aggregate *counts* are `0`. |
| **Unknown query params** | Ignored. |
| **Pagination** | `?page=` (1-based) and `?limit=`. Default `limit` 20, ceiling 100 — a larger value is capped, not rejected. `page`/`limit` below 1 or non-numeric return `400 INVALID_PAGINATION`. |

### Common error codes

| Status | Code | Meaning |
|--------|------|---------|
| `400` | `INVALID_FREELANCER_ID` | `id` is not a positive integer. |
| `400` | `INVALID_PAGINATION` | `page` or `limit` is not an integer ≥ 1. |
| `400` | `INVALID_VERIFIED_FILTER` | `?verified=` is not `true`/`false`/`1`/`0`. |
| `404` | `FREELANCER_NOT_FOUND` | No such user, **or** the user is a client-only account. |
| `429` | `RATE_LIMITED` | Rate limit exceeded; see the `Retry-After` and `X-RateLimit-*` headers. |
| `503` | `*_UNAVAILABLE` | The database call failed. Safe to retry with backoff. |

---

## What is and is not exposed

The acceptance criterion is "only public data is exposed". Rows are never spread into a response — each endpoint copies fields explicitly, so a column added to `users`, `contracts`, or `reviews` later cannot leak by accident.

**Withheld** (tracked as `SENSITIVE_FIELDS` in the helper module):

| Field | Why |
|-------|-----|
| `users.email` | Private contact detail. |
| `contracts.terms` | Private agreement between client and freelancer. |
| `contracts.client_id` and any client identity | The client never opted into being listed on someone else's public profile. |
| `jobs.escrow_contract_id`, escrow amounts/status | Escrow wiring, not profile data. |
| `reviews.reviewer_id` | Replaced by the reviewer's public `username`. |

**Deliberately included** — `walletAddress`. The Stellar address is the freelancer's on-chain identity: it is already public on the ledger, is what makes escrow payments independently verifiable, and is already returned by the existing `GET /api/freelancers` listing. Excluding it here would be inconsistent without adding any privacy.

**Visibility rule**: a user is only visible when `user_type IN ('freelancer', 'both')`. A client-only account returns `404` — the same response as a non-existent id, so these endpoints cannot be used to enumerate which ids exist.

---

## 1. Get Profile

```
GET /api/public/freelancers/{id}
```

| Field | Type | Notes |
|-------|------|-------|
| `id` | number | `users.id`. |
| `username` | string | Public display handle. |
| `bio` | string \| null | |
| `skills` | string[] | Empty array when unset. |
| `userType` | string | `freelancer` or `both`. |
| `walletAddress` | string | Stellar address. |
| `availability.status` | `available` \| `busy` | **Derived** — see below. |
| `availability.activeEngagements` | number | Jobs in `assigned`, `in_progress`, or `in_review`. |
| `ratings.average` | number \| null | Mean of all reviews, 1–5. `null` with no reviews. |
| `ratings.reviewCount` | number | Total reviews received. |
| `ratings.storedRating` | number \| null | Denormalised `users.rating`, kept for parity with `GET /api/freelancers`. May lag `ratings.average`; prefer `average`. |
| `stats.completedContracts` | number | Contracts in `completed` state. |
| `stats.completedJobs` | number | Denormalised `users.total_jobs_completed`. |
| `memberSince` | string | Account creation timestamp. |

> **On `availability`**: the schema has no availability column, so it is derived from in-flight work rather than self-reported — `busy` when the freelancer has at least one active job, otherwise `available`. If explicit, freelancer-set availability is added later, this field can keep its shape and change its source.

**Example**

```bash
curl https://taskchain.example/api/public/freelancers/7
```

```json
{
  "data": {
    "id": 7,
    "username": "ada",
    "bio": "Soroban contracts and escrow audits.",
    "skills": ["rust", "soroban"],
    "userType": "freelancer",
    "walletAddress": "GABC...123",
    "availability": { "status": "available", "activeEngagements": 0 },
    "ratings": { "average": 4.25, "reviewCount": 4, "storedRating": 4.5 },
    "stats": { "completedContracts": 9, "completedJobs": 12 },
    "memberSince": "2026-01-05T10:00:00.000Z"
  }
}
```

Errors: `400 INVALID_FREELANCER_ID`, `404 FREELANCER_NOT_FOUND`, `429 RATE_LIMITED`, `503 PROFILE_UNAVAILABLE`.

---

## 2. Get Completed Contracts

```
GET /api/public/freelancers/{id}/contracts?page=1&limit=20
```

Contracts in `completed` state where the user is the freelancer, newest completion first. Ties break on descending contract id, so paging is stable.

| Field | Type | Notes |
|-------|------|-------|
| `id` | number | `contracts.id`. |
| `jobId` | number | |
| `jobTitle` | string | |
| `totalAmount` | string | Decimal string. |
| `currency` | string | e.g. `XLM`. |
| `contractAddress` | string \| null | Soroban address; `null` until deployed on-chain. |
| `contractTxHash` | string \| null | Deployment tx hash, for independent verification. |
| `completedAt` | string \| null | `jobs.completed_at`, falling back to `contracts.updated_at`. |
| `createdAt` | string | |

**Example**

```bash
curl "https://taskchain.example/api/public/freelancers/7/contracts?page=1&limit=2"
```

```json
{
  "data": [
    {
      "id": 31,
      "jobId": 12,
      "jobTitle": "Escrow audit",
      "totalAmount": "1500.000000",
      "currency": "XLM",
      "contractAddress": "CDEF...456",
      "contractTxHash": "abc123",
      "completedAt": "2026-06-01T12:00:00.000Z",
      "createdAt": "2026-05-01T12:00:00.000Z"
    }
  ],
  "meta": { "page": 1, "limit": 2, "totalCount": 9, "totalPages": 5, "hasNextPage": true }
}
```

Errors: `400 INVALID_FREELANCER_ID`, `400 INVALID_PAGINATION`, `404 FREELANCER_NOT_FOUND`, `429 RATE_LIMITED`, `503 CONTRACTS_UNAVAILABLE`.

---

## 3. Get Reviews

```
GET /api/public/freelancers/{id}/reviews?page=1&limit=20&verified=true
```

Client reviews, newest first.

**Query parameters**

| Param | Values | Default | Notes |
|-------|--------|---------|-------|
| `page` | integer ≥ 1 | `1` | |
| `limit` | integer 1–100 | `20` | Capped at 100. |
| `verified` | `true` \| `false` \| `1` \| `0` | unset | Unset returns both. |

**Item fields**

| Field | Type | Notes |
|-------|------|-------|
| `id` | number | |
| `contractId` | number | The contract reviewed (one review per contract). |
| `rating` | number | Integer 1–5. |
| `comment` | string \| null | |
| `verified` | boolean | True when the review was left on a contract that reached `completed`. |
| `reviewer.username` | string | Public handle only. |
| `createdAt` | string | |

`meta` carries the pagination block plus:

| Field | Notes |
|-------|-------|
| `filters.verified` | The filter that was applied (`null` = none). |
| `summary.averageRating` | Mean rating across the **whole filtered set**, not the current page. `null` when empty. |
| `summary.verifiedCount` | Verified reviews in the whole filtered set. |

**Example**

```bash
curl "https://taskchain.example/api/public/freelancers/7/reviews?limit=1&verified=true"
```

```json
{
  "data": [
    {
      "id": 5,
      "contractId": 31,
      "rating": 5,
      "comment": "Shipped early, clear communication.",
      "verified": true,
      "reviewer": { "username": "grace" },
      "createdAt": "2026-06-02T09:00:00.000Z"
    }
  ],
  "meta": {
    "page": 1, "limit": 1, "totalCount": 3, "totalPages": 3, "hasNextPage": true,
    "filters": { "verified": true },
    "summary": { "averageRating": 4.67, "verifiedCount": 3 }
  }
}
```

Errors: `400 INVALID_FREELANCER_ID`, `400 INVALID_PAGINATION`, `400 INVALID_VERIFIED_FILTER`, `404 FREELANCER_NOT_FOUND`, `429 RATE_LIMITED`, `503 REVIEWS_UNAVAILABLE`.

---

## 4. Get Reputation Score

```
GET /api/public/freelancers/{id}/reputation
```

A single 0–100 score blended from completed contracts, client reviews, and platform delivery metrics — plus the breakdown behind it, so consumers can show *why* rather than treating the number as a black box.

### Formula

| Component | Base weight | Normalised input (0–1) |
|-----------|-------------|------------------------|
| `completion` | 0.30 | `completionRate` — completed ÷ started jobs. |
| `onTime` | 0.25 | `onTimeDeliveryPct` — completed on/before deadline, among jobs that had one. |
| `disputeFree` | 0.20 | `1 - disputeRate`. |
| `clientRating` | 0.25 | `(averageRating - 1) / 4` — maps the 1–5 review scale onto 0–1. |

```
score = 100 × Σ (value × weight ÷ Σ available weights)
```

**Components with no data are dropped and their weight is redistributed proportionally across the rest.** A freelancer with no reviews yet is therefore scored on delivery history alone rather than penalised for a missing signal, and one whose jobs never had deadlines is not penalised for the absent on-time sample. `appliedWeight` reports the weight actually used (`0` when the component was dropped). Inputs are clamped to 0–1, and `score` is rounded to 1dp.

`score` is `null` only when there is no signal at all — no jobs started and no reviews.

### Response fields

| Field | Type | Notes |
|-------|------|-------|
| `freelancerId` | number | |
| `score` | number \| null | 0–100, 1dp. |
| `components[]` | array | `{ key, value, weight, appliedWeight }` for all four components, including dropped ones (`value: null`). |
| `sources.completedContracts` | number | Contracts in `completed` state. |
| `sources.reviewCount` | number | |
| `sources.verifiedReviewCount` | number | |
| `sources.averageRating` | number \| null | 1–5. |
| `sources.metrics` | object | Raw delivery metrics — same shape as [`docs/reputation-api.md`](reputation-api.md). |
| `computedAt` | string | When the underlying metrics snapshot was computed. |

**Example**

```bash
curl https://taskchain.example/api/public/freelancers/7/reputation
```

```json
{
  "data": {
    "freelancerId": 7,
    "score": 85.3,
    "components": [
      { "key": "completion",   "value": 0.9,    "weight": 0.3,  "appliedWeight": 0.3 },
      { "key": "onTime",       "value": 0.8,    "weight": 0.25, "appliedWeight": 0.25 },
      { "key": "disputeFree",  "value": 0.9,    "weight": 0.2,  "appliedWeight": 0.2 },
      { "key": "clientRating", "value": 0.8125, "weight": 0.25, "appliedWeight": 0.25 }
    ],
    "sources": {
      "completedContracts": 9,
      "reviewCount": 4,
      "verifiedReviewCount": 3,
      "averageRating": 4.25,
      "metrics": {
        "completionRate": 0.9,
        "disputeRate": 0.1,
        "totalVolume": 5000,
        "onTimeDeliveryPct": 0.8,
        "jobsStarted": 10,
        "jobsCompleted": 9,
        "jobsWithDispute": 1,
        "completedWithDeadline": 5,
        "onTimeDeliveries": 4
      }
    },
    "computedAt": "2026-07-26T00:00:00.000Z"
  }
}
```

Errors: `400 INVALID_FREELANCER_ID`, `404 FREELANCER_NOT_FOUND`, `429 RATE_LIMITED`, `503 REPUTATION_UNAVAILABLE`.

> **Relationship to the existing reputation endpoints.** `GET /api/freelancers/{userId}/reputation` returns the raw delivery snapshot and its own `reputationScore`, which does **not** consider reviews. This endpoint is the composite, review-aware public score. Both are unauthenticated; neither replaces the other.

---

## Performance

The acceptance criterion is "endpoints handle large datasets without performance degradation". How that is met:

1. **One database round-trip per endpoint** (two for the sub-resources, which first confirm the freelancer exists so an unknown id returns `404` rather than an empty page). Profile aggregates ride along as scalar sub-selects instead of separate queries.
2. **Total row counts come from `COUNT(*) OVER()`** in the same statement as the page. Window functions are evaluated *before* `LIMIT`, so the count and the review `summary` cover the whole filtered set while still costing one query.
3. **Reputation reads a pre-aggregated snapshot.** Delivery metrics come from `freelancer_reputation`, recomputed at most once every five minutes (`REPUTATION_SNAPSHOT_MAX_AGE_MS`) rather than on every request.
4. **Partial and composite indexes** keep every read on a narrow slice — see `scripts/011-public-profile-indexes.sql`. The completed-contract and active-job indexes are partial, so they stay small as historical volume grows.
5. **`limit` is capped at 100**, so no caller can request an unbounded page.
6. **Edge-cacheable for 60s** with a 300s stale-while-revalidate window, plus a 120 req/min per-IP rate limit as a backstop.

### Database setup

Apply the index migration after `scripts/010-freelancer-discovery-indexes.sql`:

```bash
psql "$DATABASE_URL" -f scripts/011-public-profile-indexes.sql
```

All statements use `CREATE INDEX IF NOT EXISTS` and are safe to re-run. The endpoints work without them — the indexes are what keep them fast at scale.
