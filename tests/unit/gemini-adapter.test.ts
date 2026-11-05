import { afterEach, describe, expect, it, vi } from "vitest";

import { GeminiLlmAdapter, resolveGeminiApiKey } from "@/adapters/llm/gemini";
import { ProviderTimeoutError, ProviderUnavailableError } from "@/lib/errors";
import type { UsageRecorder } from "@/modules/metering/service";
import type { RecordUsageInput } from "@/modules/metering/types";
import type { ExperienceSummary } from "@/modules/discovery/ports";
import type { Page } from "@/modules/shared/pagination";
import {
  VIVENIQ_LLM,
  VIVENIQ_SYSTEM_PROMPT,
  VivenIQService,
  acceptReply,
} from "@/modules/viveniq/service";
import type { LlmPort } from "@/ports/llm";

/**
 * The Gemini adapter and VivenIQ's use of it. The model is never on the
 * correctness path: these tests pin what is sent, what is accepted, what is
 * metered, and that every failure lands on the deterministic reply.
 */

const OPTIONS = { maxOutputTokens: 300, timeoutMs: 1_500 } as const;
const DEFLECTION =
  "I exist exclusively to choreograph your journeys and private escapes at La Vivenzia. Shall I curate an evening of craft tastings or a serene poolside retreat for you instead?";

function recorder(): UsageRecorder & { events: RecordUsageInput[] } {
  const events: RecordUsageInput[] = [];
  return {
    events,
    record: (input) => {
      events.push(input);
      return null;
    },
  };
}

function geminiResponse(text: string, usage = { promptTokenCount: 120, candidatesTokenCount: 40 }) {
  return new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text }] } }],
      usageMetadata: usage,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

function adapterWith(fetch: typeof globalThis.fetch, metering = recorder()) {
  return { adapter: new GeminiLlmAdapter({ apiKey: "test-key" }, { fetch, metering }), metering };
}

describe("GeminiLlmAdapter", () => {
  it("sends the system prompt, the prompt and the output budget, and parses JSON", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      geminiResponse('{"reply":"A quiet morning awaits."}'),
    );
    const { adapter } = adapterWith(fetch);

    const result = await adapter.generateStructured<{ reply: string }>({
      system: "SYSTEM",
      prompt: "PROMPT",
      schemaName: "viveniq_reply",
      options: OPTIONS,
    });

    expect(result).toEqual({ reply: "A quiet morning awaits." });

    const [url, init] = fetch.mock.calls[0]!;
    expect(String(url)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent",
    );
    // The key never travels in the URL.
    expect(String(url)).not.toContain("test-key");
    expect((init!.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init!.body as string)).toEqual({
      systemInstruction: { parts: [{ text: "SYSTEM" }] },
      contents: [{ role: "user", parts: [{ text: "PROMPT" }] }],
      generationConfig: { maxOutputTokens: 300, responseMimeType: "application/json" },
    });
  });

  it("falls back to the next model only when the first is not found", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(geminiResponse('{"reply":"ok"}'));
    const { adapter } = adapterWith(fetch);

    await adapter.generateStructured({ system: "", prompt: "", schemaName: "x", options: OPTIONS });

    expect(String(fetch.mock.calls[1]![0])).toContain("/gemini-1.5-flash:generateContent");
  });

  it("rejects, rather than repairs, output that is not JSON", async () => {
    const { adapter } = adapterWith(async () => geminiResponse("Sure! Here is a reply."));

    await expect(
      adapter.generateStructured({ system: "", prompt: "", schemaName: "x", options: OPTIONS }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("maps a provider error onto the shared error model", async () => {
    const { adapter } = adapterWith(async () => new Response("{}", { status: 500 }));

    await expect(
      adapter.generateStructured({ system: "", prompt: "", schemaName: "x", options: OPTIONS }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("aborts at the caller's timeout", async () => {
    const hang: typeof globalThis.fetch = (_url, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason as Error));
      });
    const { adapter } = adapterWith(hang);

    await expect(
      adapter.generateStructured({
        system: "",
        prompt: "",
        schemaName: "x",
        options: { maxOutputTokens: 10, timeoutMs: 20 },
      }),
    ).rejects.toBeInstanceOf(ProviderTimeoutError);
  });

  it("reports a network failure as unavailable", async () => {
    const { adapter } = adapterWith(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(
      adapter.generateStructured({ system: "", prompt: "", schemaName: "x", options: OPTIONS }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });

  it("records input and output tokens as separate Gemini Flash events", async () => {
    const { adapter, metering } = adapterWith(async () => geminiResponse('{"reply":"ok"}'));

    await adapter.generateStructured({ system: "", prompt: "", schemaName: "x", options: OPTIONS });

    expect(
      metering.events.map(({ provider, operation, units, status }) => ({
        provider,
        operation,
        units,
        status,
      })),
    ).toEqual([
      { provider: "GOOGLE_GEMINI", operation: "gemini.flash_input", units: 120, status: "SUCCESS" },
      { provider: "GOOGLE_GEMINI", operation: "gemini.flash_output", units: 40, status: "SUCCESS" },
    ]);
    expect(metering.events[0]!.metadata).toEqual({ model: "gemini-2.5-flash" });
  });

  it("records a failed call as an error and survives a throwing meter", async () => {
    const throwing: UsageRecorder = {
      record: () => {
        throw new Error("meter down");
      },
    };
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const adapter = new GeminiLlmAdapter(
      { apiKey: "k" },
      { fetch: async () => geminiResponse('{"reply":"ok"}'), metering: throwing },
    );

    await expect(
      adapter.generateStructured({ system: "", prompt: "", schemaName: "x", options: OPTIONS }),
    ).resolves.toEqual({ reply: "ok" });
    warn.mockRestore();

    const { adapter: failing, metering } = adapterWith(
      async () => new Response("", { status: 503 }),
    );
    await failing
      .generateStructured({ system: "", prompt: "", schemaName: "x", options: OPTIONS })
      .catch(() => undefined);
    expect(metering.events.every((event) => event.status === "ERROR")).toBe(true);
  });

  it("requires a key, from either environment name", () => {
    expect(() => new GeminiLlmAdapter({ apiKey: "" })).toThrow(/API key/);
    expect(resolveGeminiApiKey({ GEMINI_API_KEY: "a", GOOGLE_GEMINI_API_KEY: "b" })).toBe("a");
    expect(resolveGeminiApiKey({ GOOGLE_GEMINI_API_KEY: "b" })).toBe("b");
    expect(resolveGeminiApiKey({})).toBeUndefined();
  });
});

/* ---------------------------------------------------------------- VivenIQ */

const brunch: ExperienceSummary = {
  id: "poolside-brunch",
  slug: "poolside-brunch",
  title: "Poolside Brunch",
  summary: null,
  city: "Pune",
  region: "Maharashtra",
  country: "IN",
  categoryKey: null,
  categoryName: null,
  durationMinutes: 120,
  minGuests: 1,
  maxGuests: 10,
  basePriceMinor: 300_000,
  currency: "INR",
  pricingUnit: "PER_PERSON",
  coverUrl: "https://example.test/cover.jpg",
  coverAlt: null,
  hostName: "Host",
  publishedAt: null,
  distanceMetres: null,
};

const discovery = {
  browse: async (filters: { search?: string }) =>
    ({
      items:
        (filters.search ?? "").length > 0 && brunch.title.toLowerCase().includes(filters.search!)
          ? [brunch]
          : [],
      page: 1,
      pageSize: 12,
      total: 1,
      totalPages: 1,
    }) as Page<ExperienceSummary>,
  featured: async () => [],
  categories: async () => [],
} as unknown as ConstructorParameters<typeof VivenIQService>[0]["discovery"];

function llmReturning(impl: LlmPort["generateStructured"]): LlmPort & {
  calls: Parameters<LlmPort["generateStructured"]>[0][];
} {
  const calls: Parameters<LlmPort["generateStructured"]>[0][] = [];
  return {
    calls,
    generateStructured: ((input) => {
      calls.push(input);
      return impl(input);
    }) as LlmPort["generateStructured"],
  };
}

const deterministic = async () =>
  (await new VivenIQService({ discovery }).respond({ message: "poolside brunch" })).reply;

describe("VivenIQ with a model", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("sends the sovereign system prompt and only verified candidate facts", async () => {
    const llm = llmReturning(async <T>() => ({ reply: "A languid poolside morning." }) as T);

    const result = await new VivenIQService({ discovery, llm }).respond({
      message: "poolside brunch",
    });

    expect(result.reply).toBe("A languid poolside morning.");
    expect(result.picks.map((pick) => pick.slug)).toEqual(["poolside-brunch"]);

    const [call] = llm.calls;
    expect(call!.system).toBe(VIVENIQ_SYSTEM_PROMPT);
    expect(call!.system).toContain("never Gemini, never Google");
    expect(call!.system).toContain("I am VivenIQ, your private concierge at La Vivenzia.");
    expect(call!.options).toEqual({
      maxOutputTokens: VIVENIQ_LLM.maxOutputTokens,
      timeoutMs: 1_500,
    });

    const prompt = JSON.parse(call!.prompt) as { experiences: Record<string, unknown>[] };
    expect(prompt.experiences).toEqual([
      expect.objectContaining({
        title: "Poolside Brunch",
        slug: "poolside-brunch",
        place: "Pune, Maharashtra",
        duration: expect.any(String),
        price: expect.stringMatching(/3,000 \/ person$/),
        matchReasons: expect.stringContaining("Matches"),
      }),
    ]);
  });

  it("carries the domain rule, and passes a deflection through unchanged", async () => {
    expect(VIVENIQ_SYSTEM_PROMPT).toContain(DEFLECTION);
    const llm = llmReturning(async <T>() => ({ reply: DEFLECTION }) as T);

    const result = await new VivenIQService({ discovery, llm }).respond({
      message: "write python code for my poolside brunch homework",
    });

    expect(result.reply).toBe(DEFLECTION);
  });

  it("keeps the deterministic slot note when a time was asked about", async () => {
    const llm = llmReturning(async <T>() => ({ reply: "A languid poolside morning." }) as T);

    const result = await new VivenIQService({ discovery, llm }).respond({
      message: "poolside brunch tomorrow",
    });

    expect(result.reply).toMatch(/^A languid poolside morning\. Times and tables are confirmed/);
  });

  it("drops a reply that states a price or number", async () => {
    const onLlmFailure = vi.fn();
    const llm = llmReturning(async <T>() => ({ reply: "Only ₹999 for 2 tonight!" }) as T);

    const result = await new VivenIQService({ discovery, llm, onLlmFailure }).respond({
      message: "poolside brunch",
    });

    expect(result.reply).toBe(await deterministic());
    expect(onLlmFailure).toHaveBeenCalledOnce();
    expect(acceptReply({ reply: "  calm  " })).toBe("calm");
    expect(acceptReply({ text: "wrong shape" })).toBeNull();
  });

  it("falls back to the deterministic reply when the model fails", async () => {
    const llm = llmReturning(async () => {
      throw new ProviderUnavailableError("down");
    });

    const result = await new VivenIQService({ discovery, llm }).respond({
      message: "poolside brunch",
    });

    expect(result.reply).toBe(await deterministic());
    expect(result.picks).toHaveLength(1);
  });

  it("falls back at the budget even if the model never answers", async () => {
    vi.useFakeTimers();
    const llm = llmReturning(() => new Promise(() => undefined));

    const pending = new VivenIQService({ discovery, llm }).respond({ message: "poolside brunch" });
    await vi.advanceTimersByTimeAsync(VIVENIQ_LLM.timeoutMs);
    const result = await pending;
    vi.useRealTimers();

    expect(result.reply).toBe(await deterministic());
  });

  it("works end to end through the adapter when Gemini is offline", async () => {
    const adapter = new GeminiLlmAdapter(
      { apiKey: "k" },
      {
        fetch: async () => {
          throw new TypeError("fetch failed");
        },
        metering: recorder(),
      },
    );

    const result = await new VivenIQService({ discovery, llm: adapter }).respond({
      message: "poolside brunch",
    });

    expect(result.reply).toBe(await deterministic());
  });
});
