import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "./client";
import { ZhihuError } from "./errors";
import {
  buildAuthorizationUrl,
  createOAuthState,
  exchangeAuthorizationCode,
  fetchAuthorizedUser,
  validateAndConsumeOAuthState,
} from "./oauth";

describe("Zhihu OAuth boundary", () => {
  it("creates a signed state and rejects replay", () => {
    const now = 1_000_000;
    const created = createOAuthState("app-key-for-test", now);
    validateAndConsumeOAuthState(created.cookieValue, created.state, "app-key-for-test", now + 100);
    expect(() =>
      validateAndConsumeOAuthState(created.cookieValue, created.state, "app-key-for-test", now + 200),
    ).toThrowError(ZhihuError);
  });

  it("rejects mismatched and expired state", () => {
    const created = createOAuthState("app-key-for-test", 0);
    expect(() => validateAndConsumeOAuthState(created.cookieValue, "wrong", "app-key-for-test", 1)).toThrow();
    expect(() => validateAndConsumeOAuthState(created.cookieValue, created.state, "app-key-for-test", 700_000)).toThrow();
  });

  it("builds the documented authorization URL", () => {
    const url = buildAuthorizationUrl(
      { appId: "200", redirectUri: "https://example.test/api/auth/zhihu/callback" },
      "state-value",
    );
    expect(url.origin).toBe("https://openapi.zhihu.com");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-value");
  });

  it("keeps token exchange and lossless uid parsing server-side with mocked fetch", async () => {
    const fetchMock = vi
      .fn(async (_input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
        void _input;
        void _init;
        throw new Error("Unexpected extra request");
      })
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "oauth-token-test", expires_in: 3600 }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          '{"uid":969570047710216200,"hash_id":"hash","fullname":"演示用户","headline":"测试"}',
          { status: 200 },
        ),
      );
    const fetchImpl = fetchMock as unknown as FetchLike;
    const token = await exchangeAuthorizationCode(
      {
        appId: "200",
        appKey: "test-key",
        redirectUri: "https://example.test/callback",
        timeoutMs: 1_000,
      },
      "authorization-code",
      fetchImpl,
    );
    const user = await fetchAuthorizedUser(token.accessToken, 1_000, fetchImpl);
    expect(user.uid).toBe("969570047710216200");
    expect(user.fullName).toBe("演示用户");
    const tokenBody = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(tokenBody.get("app_key")).toBe("test-key");
  });
});
