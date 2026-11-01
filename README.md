# @advernue/sdk

TypeScript client for the [Advernue](https://advernue.com) API: one REST API and one request shape over ~200 ad platforms.

- ESM, strict TypeScript, zero runtime dependencies (uses the global `fetch`, Node 22+).
- Fully typed from the OpenAPI 3.1 spec: every operation is `client.<tag>.<operation>()`.
- Idempotency keys, `dryRun`, typed errors and safe retries built in.
- Money stays `{ micros, currency }` with string-math helpers.

## Install

```sh
npm install @advernue/sdk
```

## Quickstart

```ts
import { Advernue } from "@advernue/sdk";

const client = new Advernue(); // reads ADVERNUE_API_KEY (and optionally ADVERNUE_BASE_URL)

const paused = await client.campaigns.list({ status: "paused" });
console.log(paused.map((c) => c.name));
```

## Auth and configuration

```ts
new Advernue({
  apiKey: "adv_...",                   // or ADVERNUE_API_KEY
  baseUrl: "https://api.advernue.com", // or ADVERNUE_BASE_URL (this is the default)
  maxRetries: 2,                       // 429/5xx only, see Retries
  timeoutMs: 60_000,
  fetch: customFetch,                  // optional
});
```

The key is sent as `Authorization: Bearer <key>`. Public, token-addressed endpoints do not need one.

## Writes: idempotency and dry runs

Every write takes a trailing options object:

```ts
await client.campaigns.create(
  { adAccountId: "acc_1", name: "Spring sale", objective: "traffic" },
  { idempotencyKey: "spring-sale-v1", dryRun: true },
);
```

- `idempotencyKey` becomes the `Idempotency-Key` header. If you omit it, a UUID is generated, so a retried request is never applied twice.
- `dryRun: true` adds `?dry_run=true`: the API validates and previews without sending anything to the platform (available on the operations that support it, typed accordingly).

## Errors

Non-2xx responses throw `AdvernueError`, built from the `{ error: { code, message, details } }` envelope:

```ts
import { AdvernueError } from "@advernue/sdk";

try {
  await client.analytics.compare({ groupBy: "platform", from: "2025-01-01", to: "2025-01-31" });
} catch (e) {
  if (e instanceof AdvernueError) console.error(e.status, e.code, e.message, e.details);
  else throw e;
}
```

## Retries

Retries use exponential backoff with jitter (and honour `Retry-After`), on HTTP 429 and 5xx only. GET requests are always retried; writes are retried only when an idempotency key is set (which is automatic for every write that accepts one).

## Money

Amounts are `{ micros: number; currency: string }` (1 unit = 1,000,000 micros). The helpers use string math, never float multiplication:

```ts
import { money } from "@advernue/sdk";

money.fromMajor("19.99", "USD"); // { micros: 19990000, currency: "USD" }
money.toMajor({ micros: 19_990_000, currency: "USD" }); // "19.99"
```

`fromMajor` throws if the amount has more than 6 decimals or is not a plain decimal.

## Examples

### Compare platforms

```ts
const cmp = await client.analytics.compare({
  groupBy: "platform",
  from: "2025-01-01",
  to: "2025-01-31",
  comparePrevious: true,
  currency: "USD",
});
for (const g of cmp.groups) console.log(g.key, g.metrics.roas, g.delta?.roas);
```

### Create a cross-platform campaign, paused

Preview with a dry run, then launch. Per the spec, the per-platform campaigns are drafted paused until every child succeeds; the last step double-checks that nothing is live until you decide:

```ts
import { money } from "@advernue/sdk";

const brief = {
  name: "Spring sale",
  objective: "sales",
  totalBudget: { type: "lifetime", amount: money.fromMajor("5000", "USD") },
  split: { type: "equal" },
  targeting: { countries: ["US"] },
  destinationUrl: "https://example.com/spring",
  targets: ["acc_google", "acc_meta"], // ad account ids of one client
  creatives: [
    {
      workspaceId: "ws_1", adAccountId: "acc_google", type: "image", name: "Hero",
      headline: "Spring sale", assets: [{ kind: "image", url: "https://example.com/hero.png" }],
      platformNative: {},
    },
  ],
} as const;

const preview = await client.crosspost.launch(brief, { dryRun: true });
console.log(preview);

const launched = await client.crosspost.launch(brief, { idempotencyKey: "spring-sale-launch" });

// Pin every resulting campaign to paused until you activate it yourself.
const children = await client.campaigns.list({ crossCampaignId: launched.plan.crossCampaignId });
for (const c of children.filter((c) => c.status !== "paused")) {
  await client.campaigns.setStatus({ id: c.id }, { status: "paused" });
}
```

### Pacing

```ts
const pacing = await client.analytics.pacing({ clientId: "cl_1", currency: "USD", tolerance: 0.05 });
for (const c of pacing.campaigns) console.log(c.name, c.platform, c.budget);
```

### Anything by operation id

```ts
await client.call("campaigns.list", { platform: "meta" });
```

## Pagination

The current spec has no cursor or page pattern (list endpoints take an optional `limit`), so there is no pagination helper yet. One will be added if the spec grows one.

## Spec

`spec/openapi.json` is the exact spec this release was generated from. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
