import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import { POST as createLook } from "@/app/api/looks/route";
import { POST as createLookGroup } from "@/app/api/look-groups/route";

const USER_ID = "11111111-1111-4111-8111-111111111111";
const SESSION_ID = "22222222-2222-4222-8222-222222222222";
const COVER_ID = "33333333-3333-4333-8333-333333333333";
const LOOK_ID = "44444444-4444-4444-8444-444444444444";
const GROUP_ID = "55555555-5555-4555-8555-555555555555";
const CREATED_AT = "2026-08-24T12:00:00.000Z";

type QueryResult = { data: unknown; error: { code?: string } | null };

function queryBuilder(terminal: "single" | "maybeSingle", result: QueryResult) {
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ["insert", "select", "eq", "not"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder[terminal] = vi.fn(async () => result);
  return builder;
}

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function authenticatedSupabase(from: ReturnType<typeof vi.fn>) {
  return {
    auth: {
      getClaims: vi.fn(async () => ({
        data: { claims: { sub: USER_ID } },
        error: null,
      })),
    },
    from,
  };
}

describe("save POST response-loss idempotency", () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it("returns the existing look when every submitted value matches", async () => {
    const insert = queryBuilder("single", { data: null, error: { code: "23505" } });
    const existing = {
      id: LOOK_ID,
      title: "Günlük kombin",
      try_on_session_id: SESSION_ID,
      group_id: null,
      cover_try_on_id: COVER_ID,
      created_at: CREATED_AT,
    };
    const recovery = queryBuilder("maybeSingle", { data: existing, error: null });
    const lookBuilders = [insert, recovery];
    const from = vi.fn((table: string) => {
      if (table === "try_on_sessions") {
        return queryBuilder("maybeSingle", { data: { id: SESSION_ID }, error: null });
      }
      if (table === "try_ons") {
        return queryBuilder("maybeSingle", { data: { id: COVER_ID }, error: null });
      }
      if (table === "looks") return lookBuilders.shift();
      throw new Error(`Unexpected table: ${table}`);
    });
    createClientMock.mockResolvedValue(authenticatedSupabase(from));

    const response = await createLook(request("/api/looks", {
      sessionId: SESSION_ID,
      title: existing.title,
      groupId: null,
      coverTryOnId: COVER_ID,
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: existing, reused: true });
    expect(recovery.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(recovery.eq).toHaveBeenCalledWith("try_on_session_id", SESSION_ID);
  });

  it("keeps look conflict semantics when an existing value differs", async () => {
    const insert = queryBuilder("single", { data: null, error: { code: "23505" } });
    const recovery = queryBuilder("maybeSingle", {
      data: {
        id: LOOK_ID,
        title: "Başka ad",
        try_on_session_id: SESSION_ID,
        group_id: null,
        cover_try_on_id: COVER_ID,
        created_at: CREATED_AT,
      },
      error: null,
    });
    const lookBuilders = [insert, recovery];
    const from = vi.fn((table: string) => {
      if (table === "try_on_sessions") {
        return queryBuilder("maybeSingle", { data: { id: SESSION_ID }, error: null });
      }
      if (table === "try_ons") {
        return queryBuilder("maybeSingle", { data: { id: COVER_ID }, error: null });
      }
      if (table === "looks") return lookBuilders.shift();
      throw new Error(`Unexpected table: ${table}`);
    });
    createClientMock.mockResolvedValue(authenticatedSupabase(from));

    const response = await createLook(request("/api/looks", {
      sessionId: SESSION_ID,
      title: "Günlük kombin",
      groupId: null,
      coverTryOnId: COVER_ID,
    }));

    expect(response.status).toBe(409);
    expect((await response.json()).reused).toBeUndefined();
  });

  it("returns the caller's exact existing group on an identical retry", async () => {
    const insert = queryBuilder("single", { data: null, error: { code: "23505" } });
    const existing = {
      id: GROUP_ID,
      name: "Yaz kombinleri",
      created_at: CREATED_AT,
      updated_at: CREATED_AT,
    };
    const recovery = queryBuilder("maybeSingle", { data: existing, error: null });
    const groupBuilders = [insert, recovery];
    const from = vi.fn((table: string) => {
      if (table === "look_groups") return groupBuilders.shift();
      throw new Error(`Unexpected table: ${table}`);
    });
    createClientMock.mockResolvedValue(authenticatedSupabase(from));

    const response = await createLookGroup(request("/api/look-groups", { name: existing.name }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        id: GROUP_ID,
        name: existing.name,
        createdAt: CREATED_AT,
        updatedAt: CREATED_AT,
        lookCount: 0,
      },
      reused: true,
    });
    expect(recovery.eq).toHaveBeenCalledWith("user_id", USER_ID);
    expect(recovery.eq).toHaveBeenCalledWith("name", existing.name);
  });

  it("keeps group conflict semantics when only a case-insensitive duplicate exists", async () => {
    const insert = queryBuilder("single", { data: null, error: { code: "23505" } });
    const recovery = queryBuilder("maybeSingle", { data: null, error: null });
    const groupBuilders = [insert, recovery];
    const from = vi.fn((table: string) => {
      if (table === "look_groups") return groupBuilders.shift();
      throw new Error(`Unexpected table: ${table}`);
    });
    createClientMock.mockResolvedValue(authenticatedSupabase(from));

    const response = await createLookGroup(request("/api/look-groups", { name: "YAZ KOMBİNLERİ" }));

    expect(response.status).toBe(409);
    expect((await response.json()).reused).toBeUndefined();
  });
});
