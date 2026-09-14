import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { UserProfile } from "@/domain";
import { resolveScenarioActor } from "@/server/auth";
import { assertScenarioActionAuth } from "@/server/auth/scenario-action-guard";
import { ScenarioError } from "@/server/errors";
import { scenarioFailure } from "@/server/http";
import { getScenarioService, type ScenarioAction } from "@/server/scenario";

export const dynamic = "force-dynamic";
const text = z.string().trim().min(1).max(4_000);
const messageText = z.string().trim().max(4_000);
const imageInput = z.object({
  name: z.string().trim().max(100).optional(),
  dataUrl: z.string().min(32).max(2_900_000).refine((value) => value.startsWith("data:image/"), "Invalid image data URL."),
});
const images = z.array(imageInput).max(3).optional();
const hasMessageContent = (value: { content:string; images?: unknown[] }) => Boolean(value.content || value.images?.length);
const positionMessage = z.object({ type:z.literal("submitPosition"), content:messageText, images }).strict()
  .refine(hasMessageContent, "A message needs text or an image.");
const responseToMessage = z.object({ type:z.literal("submitResponse"), targetMessageId:z.string().trim().min(1).max(200), relation:z.enum(["different", "complementary"]), content:messageText, images }).strict()
  .refine(hasMessageContent, "A reply needs text or an image.");
const legacyResponseToPosition = z.object({ type:z.literal("submitResponse"), targetPositionId:z.string().trim().min(1).max(200), relation:z.enum(["different", "complementary"]), content:messageText, images }).strict()
  .refine(hasMessageContent, "A reply needs text or an image.");
const actionSchema = z.union([
  z.object({ type: z.literal("chooseQuestion"), questionId: z.string().trim().min(1).max(100) }),
  z.object({ type: z.literal("saveProfile"), profile: z.custom<UserProfile>((value) => typeof value === "object" && value !== null) }),
  z.object({ type: z.literal("accept") }),
  z.object({ type: z.literal("decline"), reason: z.enum(["skipped", "rejected", "blocked"]) }),
  z.object({ type: z.literal("start") }),
  positionMessage,
  z.object({ type: z.literal("submitPosition"), judgment: text, reasons: z.array(text).min(1).max(10), evidence: z.array(text).min(1).max(10), uncertainties: z.array(text).min(1).max(10), images }),
  z.object({ type: z.literal("advancePhase") }),
  responseToMessage,
  legacyResponseToPosition,
  z.object({ type: z.literal("finish") }),
  z.object({
    type: z.literal("submitPeerRating"),
    targetUserId: z.string().trim().min(1).max(200),
    suitability: z.number().int().min(1).max(5),
    inspiration: z.number().int().min(1).max(5),
    comment: z.string().trim().max(500).optional(),
  }),
  z.object({ type: z.literal("requestConnection"), targetUserId: z.string().trim().min(1).max(200) }),
  z.object({ type: z.literal("respondConnection"), requesterUserId: z.string().trim().min(1).max(200), accept: z.boolean() }),
  z.object({ type: z.literal("refreshNextRooms") }),
  z.object({ type: z.literal("exit") }),
  z.object({ type: z.literal("advanceTime"), hours: z.number().positive().max(168) }),
  z.object({ type: z.literal("reset") }),
]);

export async function POST(request: NextRequest, context: { params: Promise<{ scenarioId: string }> }) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > 10 * 1024 * 1024) throw new ScenarioError("INVALID_INPUT", "消息请求不能超过 10 MB。", 413);
    const { scenarioId } = await context.params;
    const actor = resolveScenarioActor(request);
    if (actor.scenarioId && actor.scenarioId !== scenarioId) throw new ScenarioError("SCENARIO_FORBIDDEN", "Session does not belong to this scenario.", 403);
    const action = actionSchema.parse(await request.json()) as ScenarioAction;
    assertScenarioActionAuth(action.type, actor.authMode);
    const state = getScenarioService().act(scenarioId, actor.userId, action);
    return NextResponse.json({ ok: true, state }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return scenarioFailure(error); }
}
