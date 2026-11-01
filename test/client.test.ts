import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { Advernue, AdvernueError, operations } from "../src/index.js";
import { createCall } from "../src/runtime.js";

type Call = { url: string; init: RequestInit };
function fake(responses: Array<Response | Error>) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r.clone();
  }) as unknown as typeof fetch;
  return { calls, f };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const mk = (responses: Array<Response | Error>, extra = {}) => {
  const { calls, f } = fake(responses);
  const client = new Advernue({ apiKey: "k_test", baseUrl: "https://example.test/", fetch: f, sleep: async () => {}, ...extra });
  return { calls, client };
};
const hdr = (c: Call, k: string) => (c.init.headers as Record<string, string>)[k];

describe("requests", () => {
  it("sends bearer auth, builds path + query, and returns parsed JSON", async () => {
    const { calls, client } = mk([json([{ id: "c1" }])]);
    const out = await client.campaigns.list({ clientId: "cl 1", status: "paused" });
    expect(out).toEqual([{ id: "c1" }]);
    expect(calls[0].url).toBe("https://example.test/v1/campaigns?clientId=cl+1&status=paused");
    expect(hdr(calls[0], "authorization")).toBe("Bearer k_test");
    const { calls: c2, client: cl2 } = mk([json({ id: "a/b" })]);
    await cl2.campaigns.get({ id: "a/b" });
    expect(c2[0].url).toBe("https://example.test/v1/campaigns/a%2Fb");
  });

  it("reads key and base URL from the environment, defaulting the base URL", async () => {
    const { calls, f } = fake([json([])]);
    process.env.ADVERNUE_API_KEY = "env_key";
    delete process.env.ADVERNUE_BASE_URL;
    try {
      await new Advernue({ fetch: f }).campaigns.list();
      expect(calls[0].url).toBe("https://api.advernue.com/v1/campaigns");
      expect(hdr(calls[0], "authorization")).toBe("Bearer env_key");
      process.env.ADVERNUE_BASE_URL = "https://staging.example.test";
      await new Advernue({ fetch: f }).campaigns.list();
      expect(calls[1].url).toBe("https://staging.example.test/v1/campaigns");
    } finally {
      delete process.env.ADVERNUE_API_KEY;
      delete process.env.ADVERNUE_BASE_URL;
    }
  });

  it("throws without an API key", async () => {
    delete process.env.ADVERNUE_API_KEY;
    const { f } = fake([json([])]);
    await expect(new Advernue({ fetch: f }).campaigns.list()).rejects.toThrow(/API key/);
  });

  it("writes: generated idempotency key, explicit key, dry-run flag", async () => {
    const { calls, client } = mk([json({ status: "succeeded" }, 201), json({ status: "dry_run" }), json({})]);
    const body = { groupBy: "platform" as const, from: "2025-01-01", to: "2025-01-31" };
    await client.campaigns.create({ adAccountId: "a", name: "n", objective: "traffic" });
    expect(hdr(calls[0], "idempotency-key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(hdr(calls[0], "content-type")).toBe("application/json");
    await client.campaigns.create({ adAccountId: "a", name: "n", objective: "traffic" }, { idempotencyKey: "my-key", dryRun: true });
    expect(hdr(calls[1], "idempotency-key")).toBe("my-key");
    expect(calls[1].url).toBe("https://example.test/v1/campaigns?dry_run=true");
    await client.analytics.compare(body);
    expect(JSON.parse(calls[2].init.body as string)).toEqual(body);
  });
});

describe("errors", () => {
  it("maps the error envelope onto AdvernueError", async () => {
    const { client } = mk([json({ error: { code: "fx_rate_missing", message: "no rate", details: { pair: "EURUSD" } } }, 422)]);
    const err = await client.campaigns.list().catch((e) => e);
    expect(err).toBeInstanceOf(AdvernueError);
    expect(err).toMatchObject({ status: 422, code: "fx_rate_missing", message: "no rate", details: { pair: "EURUSD" } });
  });
  it("falls back for non-envelope bodies", async () => {
    const { client } = mk([new Response("nope", { status: 404 })]);
    await expect(client.campaigns.list()).rejects.toMatchObject({ status: 404, code: "http_404" });
  });
});

describe("retries", () => {
  it("retries GET on 429 and 5xx, then succeeds", async () => {
    const { calls, client } = mk([json({}, 503), json({}, 429, { "retry-after": "1" }), json([{ id: "x" }])]);
    expect(await client.campaigns.list()).toEqual([{ id: "x" }]);
    expect(calls).toHaveLength(3);
  });
  it("gives up after maxRetries and throws", async () => {
    const { calls, client } = mk([json({ error: { code: "boom", message: "x" } }, 500)], { maxRetries: 1 });
    await expect(client.campaigns.list()).rejects.toMatchObject({ code: "boom" });
    expect(calls).toHaveLength(2);
  });
  it("does not retry 4xx", async () => {
    const { calls, client } = mk([json({}, 400)]);
    await expect(client.campaigns.list()).rejects.toBeInstanceOf(AdvernueError);
    expect(calls).toHaveLength(1);
  });
  it("retries writes that carry an idempotency key", async () => {
    const { calls, client } = mk([json({}, 502), json({ status: "succeeded" }, 201)]);
    await client.campaigns.create({ adAccountId: "a", name: "n", objective: "traffic" }, { idempotencyKey: "k1" });
    expect(calls).toHaveLength(2);
    expect(hdr(calls[1], "idempotency-key")).toBe("k1");
  });
  it("never retries writes without an idempotency key", async () => {
    const meta = { id: "x.y", tag: "x", name: "y", method: "POST", path: "/v1/x", pathParams: [], query: [], idempotent: false, dryRun: false, auth: true, response: "json" } as const;
    const { calls, f } = fake([json({}, 503), json({}, 200)]);
    const call = createCall({ apiKey: "k", baseUrl: "https://example.test", fetch: f, sleep: async () => {} });
    await expect(call(meta, {}, {})).rejects.toBeInstanceOf(AdvernueError);
    expect(calls).toHaveLength(1);
    expect(hdr(calls[0], "idempotency-key")).toBeUndefined();
  });
});

describe("generated surface", () => {
  it("covers every operation in the spec", () => {
    const spec = JSON.parse(readFileSync(new URL("../spec/openapi.json", import.meta.url), "utf8"));
    const ids = Object.values<any>(spec.paths).flatMap((p) => Object.values<any>(p).map((o) => o.operationId));
    expect(Object.keys(operations).sort()).toEqual([...ids].sort());
    const { client } = mk([json({})]);
    for (const id of ids) {
      const [tag, name] = id.split(".");
      expect(typeof (client as any)[tag][name], id).toBe("function");
    }
  });
  it("returns text for non-JSON responses", async () => {
    const { client } = mk([new Response("<html/>", { headers: { "content-type": "text/html" } })]);
    expect(await client.reports.renderHtml({ id: "r1" })).toBe("<html/>");
  });
});
