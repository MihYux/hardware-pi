import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { chatJson, glmConfiguration, searchWeb } from "@/lib/glm";

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe("chatJson repair", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.AI_PROVIDER;
    delete process.env.ZHIPU_API_KEY;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.DEEPSEEK_MODEL;
    delete process.env.DEEPSEEK_BASE_URL;
    delete process.env.GLM_BASE_URL;
  });

  it("sends the invalid output and exact validation error to the repair attempt", async () => {
    process.env.ZHIPU_API_KEY = "test-key";
    const invalid = JSON.stringify({ category: "版本目标" });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: invalid } }] }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: JSON.stringify({ category: "goal" }) } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatJson(z.object({ category: z.enum(["goal", "other"]) }), "system", "user")).resolves.toEqual({ category: "goal" });

    const repairRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(repairRequest.messages).toContainEqual({ role: "assistant", content: invalid });
    expect(repairRequest.messages.at(-1).content).toContain("category");
    expect(repairRequest.messages.at(-1).content).toContain("goal");
    expect(repairRequest.thinking).toEqual({ type: "disabled" });
  });

  it("retries once when the model returns empty content", async () => {
    process.env.ZHIPU_API_KEY = "test-key";
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: "" } }] }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: JSON.stringify({ answer: "ok" }) } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatJson(z.object({ answer: z.string() }), "system", "user")).resolves.toEqual({ answer: "ok" });
    const retryRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(retryRequest.messages.at(-1).content).toContain("没有返回 JSON 内容");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("regenerates compact JSON when the first response is truncated", async () => {
    process.env.ZHIPU_API_KEY = "test-key";
    const truncated = '{"answer":"这是一段被截断的内容';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: truncated } }] }))
      .mockResolvedValueOnce(jsonResponse({ choices: [{ message: { content: JSON.stringify({ answer: "ok" }) } }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatJson(z.object({ answer: z.string() }), "system", "user", {
      maxAttempts: 3,
      repairInstruction: "数组最多两项。",
    })).resolves.toEqual({ answer: "ok" });

    const retryRequest = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(retryRequest.messages).not.toContainEqual({ role: "assistant", content: truncated });
    expect(retryRequest.messages.at(-1).content).toContain("被截断");
    expect(retryRequest.messages.at(-1).content).toContain("数组最多两项");
  });

  it("uses the DeepSeek-compatible endpoint when selected", async () => {
    process.env.AI_PROVIDER = "deepseek";
    process.env.DEEPSEEK_API_KEY = "deepseek-test-key";
    process.env.DEEPSEEK_MODEL = "deepseek-chat";
    process.env.DEEPSEEK_BASE_URL = "https://api.deepseek.example/v1/";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      choices: [{ message: { content: JSON.stringify({ answer: "ok" }) } }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatJson(z.object({ answer: z.string() }), "system", "user")).resolves.toEqual({ answer: "ok" });

    const [url, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(request?.body));
    expect(url).toBe("https://api.deepseek.example/v1/chat/completions");
    expect(request?.headers).toMatchObject({ Authorization: "Bearer deepseek-test-key" });
    expect(body.model).toBe("deepseek-chat");
    expect(body.thinking).toBeUndefined();
    expect(body.do_sample).toBeUndefined();
    expect(glmConfiguration()).toMatchObject({ provider: "deepseek", label: "DeepSeek", configured: true, model: "deepseek-chat" });
  });

  it("defaults DeepSeek to the official desktop Flash model", () => {
    process.env.AI_PROVIDER = "deepseek";

    expect(glmConfiguration()).toMatchObject({
      provider: "deepseek",
      model: "deepseek-v4-flash",
    });
  });

  it("keeps web search on the Zhipu endpoint when DeepSeek handles generation", async () => {
    process.env.AI_PROVIDER = "deepseek";
    process.env.DEEPSEEK_API_KEY = "deepseek-test-key";
    process.env.ZHIPU_API_KEY = "zhipu-search-key";
    process.env.GLM_BASE_URL = "https://zhipu-search.example/v4/";
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ search_result: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchWeb("测试搜索")).resolves.toEqual([]);

    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe("https://zhipu-search.example/v4/web_search");
    expect(request?.headers).toMatchObject({ Authorization: "Bearer zhipu-search-key" });
  });
});
