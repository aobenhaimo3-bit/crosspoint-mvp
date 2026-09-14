import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_CHAT_IMAGE_BYTES,
  MAX_CHAT_IMAGE_TOTAL_BYTES,
  MAX_CHAT_IMAGES_PER_MESSAGE,
  type PositionCard,
} from "@/domain";
import { INITIAL_DEMO_USER_IDS } from "@/data/demo";
import { SqliteScenarioRepository } from "@/repositories/scenario";
import { ScenarioError } from "@/server/errors";
import { normalizeChatImages } from "./images";
import { ScenarioService } from "./service";

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function pngDataUrl(byteSize: number): string {
  if (byteSize < PNG_SIGNATURE.length) throw new Error("PNG fixture must fit its signature.");
  const bytes = Buffer.alloc(byteSize);
  PNG_SIGNATURE.copy(bytes);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

function expectInvalid(action: () => unknown): void {
  try {
    action();
    throw new Error("Expected image validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(ScenarioError);
    expect(error).toMatchObject({ code: "INVALID_INPUT", status: 400 });
  }
}

describe("chat image normalization", () => {
  it("accepts a canonical PNG data URL, verifies its signature, and normalizes metadata", () => {
    const [image] = normalizeChatImages(
      [{ name: "C:\\screenshots\\观点图.png", dataUrl: ONE_PIXEL_PNG }],
      "position-finance",
    );

    expect(image).toEqual({
      id: "position-finance-image-1",
      name: "观点图.png",
      mimeType: "image/png",
      byteSize: Buffer.from(ONE_PIXEL_PNG.split(",")[1], "base64").length,
      dataUrl: ONE_PIXEL_PNG,
    });
    expect(Buffer.from(image.dataUrl.split(",")[1], "base64").subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });

  it("rejects forged MIME declarations and malformed or non-canonical Base64", () => {
    const pngPayload = ONE_PIXEL_PNG.split(",")[1];

    expectInvalid(() => normalizeChatImages(
      [{ dataUrl: `data:image/jpeg;base64,${pngPayload}` }],
      "message",
    ));
    expectInvalid(() => normalizeChatImages(
      [{ dataUrl: "data:image/png;base64,not_base64!" }],
      "message",
    ));
    expectInvalid(() => normalizeChatImages(
      [{ dataUrl: "data:image/png;base64,aGVsbG8" }],
      "message",
    ));
  });

  it("enforces per-image and count limits and accepts the exact combined byte boundary", () => {
    const atSingleLimit = pngDataUrl(MAX_CHAT_IMAGE_BYTES);
    const atTotalLimit = Array.from({ length: MAX_CHAT_IMAGES_PER_MESSAGE }, (_, index) => ({
      name: `boundary-${index}.png`,
      dataUrl: atSingleLimit,
    }));

    const normalized = normalizeChatImages(atTotalLimit, "boundary");
    expect(normalized).toHaveLength(MAX_CHAT_IMAGES_PER_MESSAGE);
    expect(normalized.reduce((total, image) => total + image.byteSize, 0)).toBe(MAX_CHAT_IMAGE_TOTAL_BYTES);

    expectInvalid(() => normalizeChatImages(
      [{ dataUrl: pngDataUrl(MAX_CHAT_IMAGE_BYTES + 1) }],
      "oversized",
    ));
    expectInvalid(() => normalizeChatImages(
      Array.from({ length: MAX_CHAT_IMAGES_PER_MESSAGE + 1 }, () => ({ dataUrl: ONE_PIXEL_PNG })),
      "too-many",
    ));
  });
});

describe("chat image persistence and independent-stage privacy", () => {
  it("persists an image-only opening while hiding its payload from other identities until reveal", () => {
    const directory = mkdtempSync(join(tmpdir(), "crosspoint-images-"));
    temporaryDirectories.push(directory);
    const databasePath = join(directory, "scenario.sqlite");
    const scenarioId = "image-persistence-and-privacy";
    const now = new Date("2026-09-15T01:00:00.000Z");

    const firstRepository = new SqliteScenarioRepository({ path: databasePath });
    const firstService = new ScenarioService(firstRepository, { now: () => now });
    firstService.ensureDemoScenario(scenarioId);
    firstService.act(scenarioId, "finance", { type: "chooseQuestion", questionId: "q-ai-major" });
    INITIAL_DEMO_USER_IDS.forEach((userId) => firstService.act(scenarioId, userId, { type: "accept" }));
    firstService.act(scenarioId, "finance", { type: "start" });

    const ownerView = firstService.act(scenarioId, "finance", {
      type: "submitPosition",
      content: "",
      images: [{ name: "only-image.png", dataUrl: ONE_PIXEL_PNG }],
    });
    const ownPosition = ownerView.room.positions[0] as PositionCard;
    expect(ownPosition).toMatchObject({ authorId: "finance", judgment: "" });
    expect(ownPosition.images?.[0]).toMatchObject({ mimeType: "image/png", dataUrl: ONE_PIXEL_PNG });

    const otherView = firstService.getView(scenarioId, "computer");
    expect(otherView.room.positions[0]).toEqual({ id: "position-finance", authorId: "finance", submitted: true });
    expect(JSON.stringify(otherView)).not.toContain(ONE_PIXEL_PNG);
    firstRepository.close();

    const restoredRepository = new SqliteScenarioRepository({ path: databasePath });
    try {
      const restored = restoredRepository.get(scenarioId);
      expect(restored?.room.positions[0].images?.[0]).toMatchObject({
        name: "only-image.png",
        mimeType: "image/png",
        dataUrl: ONE_PIXEL_PNG,
      });
    } finally {
      restoredRepository.close();
    }
  });
});
