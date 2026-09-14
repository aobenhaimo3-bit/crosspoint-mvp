import {
  CHAT_IMAGE_MIME_TYPES,
  MAX_CHAT_IMAGE_BYTES,
  MAX_CHAT_IMAGE_TOTAL_BYTES,
  MAX_CHAT_IMAGES_PER_MESSAGE,
  type ChatImageAttachment,
  type ChatImageInput,
  type ChatImageMimeType,
} from "@/domain";
import { ScenarioError } from "@/server/errors";

const dataUrlPattern = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/;

function detectedMimeType(bytes: Buffer): ChatImageMimeType | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return "image/png";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6).toString("ascii"))) return "image/gif";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

function safeName(value: string | undefined, index: number): string {
  const leaf = value?.split(/[\\/]/).pop()?.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (leaf || `图片 ${index + 1}`).slice(0, 100);
}

export function normalizeChatImages(inputs: readonly ChatImageInput[] | undefined, idPrefix: string): readonly ChatImageAttachment[] {
  const values = inputs ?? [];
  if (values.length > MAX_CHAT_IMAGES_PER_MESSAGE) throw new ScenarioError("INVALID_INPUT", `每条消息最多上传 ${MAX_CHAT_IMAGES_PER_MESSAGE} 张图片。`, 400);
  let totalBytes = 0;
  return values.map((input, index) => {
    const match = dataUrlPattern.exec(input.dataUrl);
    if (!match) throw new ScenarioError("INVALID_INPUT", "图片数据格式无效；仅支持 PNG、JPG、WebP 和 GIF。", 400);
    const declared = match[1] as ChatImageMimeType;
    if (!CHAT_IMAGE_MIME_TYPES.includes(declared)) throw new ScenarioError("INVALID_INPUT", "不支持该图片格式。", 400);
    const encoded = match[2];
    const bytes = Buffer.from(encoded, "base64");
    const canonical = bytes.toString("base64").replace(/=+$/, "");
    if (!bytes.length || canonical !== encoded.replace(/=+$/, "")) throw new ScenarioError("INVALID_INPUT", "图片 Base64 数据无效。", 400);
    if (bytes.length > MAX_CHAT_IMAGE_BYTES) throw new ScenarioError("INVALID_INPUT", "单张图片不能超过 2 MB。", 400);
    totalBytes += bytes.length;
    if (totalBytes > MAX_CHAT_IMAGE_TOTAL_BYTES) throw new ScenarioError("INVALID_INPUT", "单条消息的图片总量不能超过 6 MB。", 400);
    const detected = detectedMimeType(bytes);
    if (!detected || detected !== declared) throw new ScenarioError("INVALID_INPUT", "图片内容与声明格式不一致。", 400);
    return {
      id: `${idPrefix}-image-${index + 1}`,
      name: safeName(input.name, index),
      mimeType: detected,
      byteSize: bytes.length,
      dataUrl: input.dataUrl,
    };
  });
}
