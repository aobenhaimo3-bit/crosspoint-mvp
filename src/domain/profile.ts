import type { AvailabilityWindow, ProfileTag, UserProfile } from "./models";
import { STANDARD_TAG_BY_ID } from "./tags";

export type ProfileGateCode =
  | "NOT_REGISTERED"
  | "NO_MATCHING_CONSENT"
  | "INVALID_METRICS"
  | "INVALID_TAG"
  | "INVALID_AVAILABILITY"
  | "TOPIC_TAGS_REQUIRED"
  | "ROLE_OR_EXPERIENCE_REQUIRED"
  | "CONTRIBUTE_TAGS_REQUIRED"
  | "LEARN_TAGS_REQUIRED"
  | "EXPECTED_PERSPECTIVE_REQUIRED";

export interface ProfileGateResult {
  ok: boolean;
  errors: readonly ProfileGateCode[];
  activeTags: readonly ProfileTag[];
}

function tagIntentMatchesCategory(tag: ProfileTag): boolean {
  const category = STANDARD_TAG_BY_ID.get(tag.tagId)?.category;
  if (!category) return false;
  if (tag.intent === "topic") return category === "topic";
  if (tag.intent === "expected_perspective") return category === "perspective";
  if (tag.intent === "learn") return category === "topic" || category === "perspective" || category === "expertise";
  return category === "expertise" || category === "experience" || category === "role" || category === "perspective" || category === "evidence";
}

export function isMatchingTag(tag: ProfileTag): boolean {
  const standardTag = STANDARD_TAG_BY_ID.get(tag.tagId);
  return (
    tag.confirmed &&
    tag.matchingAllowed &&
    tag.confidence >= 0 &&
    tag.confidence <= 1 &&
    Number.isFinite(tag.confidence) &&
    standardTag?.active === true &&
    tagIntentMatchesCategory(tag)
  );
}

export function validateAvailability(window: AvailabilityWindow): boolean {
  return (
    window.timezone.trim().length > 0 &&
    window.daysOfWeek.length > 0 &&
    new Set(window.daysOfWeek).size === window.daysOfWeek.length &&
    window.daysOfWeek.every((day) => Number.isInteger(day) && day >= 0 && day <= 6) &&
    Number.isInteger(window.startMinute) &&
    Number.isInteger(window.endMinute) &&
    window.startMinute >= 0 &&
    window.startMinute <= 1439 &&
    window.endMinute >= 0 &&
    window.endMinute <= 1439 &&
    window.startMinute !== window.endMinute &&
    Number.isFinite(window.maxResponseHours) &&
    window.maxResponseHours > 0
  );
}

export function validateProfileGate(profile: UserProfile): ProfileGateResult {
  const errors: ProfileGateCode[] = [];
  if (!profile.registered) errors.push("NOT_REGISTERED");
  if (!profile.matchingConsent) errors.push("NO_MATCHING_CONSENT");
  if (
    !Number.isFinite(profile.responseProbability) ||
    profile.responseProbability < 0 ||
    profile.responseProbability > 1 ||
    !Number.isFinite(profile.completionRate) ||
    profile.completionRate < 0 ||
    profile.completionRate > 1
  ) errors.push("INVALID_METRICS");

  const malformedTag = profile.tags.some(
    (item) =>
      STANDARD_TAG_BY_ID.get(item.tagId)?.active !== true ||
      !tagIntentMatchesCategory(item) ||
      !Number.isFinite(item.confidence) ||
      item.confidence < 0 ||
      item.confidence > 1,
  );
  if (malformedTag) errors.push("INVALID_TAG");
  if (
    profile.availability.length === 0 ||
    profile.availability.some((window) => !validateAvailability(window))
  ) errors.push("INVALID_AVAILABILITY");

  const activeTags = profile.tags.filter(isMatchingTag);
  const count = (intent: ProfileTag["intent"]) =>
    new Set(activeTags.filter((item) => item.intent === intent).map((item) => item.tagId)).size;
  const identityCount = new Set(
    activeTags
      .filter((item) => {
        const category = STANDARD_TAG_BY_ID.get(item.tagId)?.category;
        return item.intent === "contribute" && (category === "role" || category === "expertise" || category === "experience");
      })
      .map((item) => item.tagId),
  ).size;

  if (count("topic") < 3) errors.push("TOPIC_TAGS_REQUIRED");
  if (identityCount < 1) errors.push("ROLE_OR_EXPERIENCE_REQUIRED");
  if (count("contribute") < 2) errors.push("CONTRIBUTE_TAGS_REQUIRED");
  if (count("learn") < 2) errors.push("LEARN_TAGS_REQUIRED");
  if (count("expected_perspective") < 1) errors.push("EXPECTED_PERSPECTIVE_REQUIRED");
  return { ok: errors.length === 0, errors, activeTags };
}

function zonedDayAndMinute(now: Date, timezone: string): { day: number; minute: number } | null {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    const parts = Object.fromEntries(formatter.formatToParts(now).map((part) => [part.type, part.value]));
    const days: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    if (!(parts.weekday in days)) return null;
    return { day: days[parts.weekday], minute: Number(parts.hour) * 60 + Number(parts.minute) };
  } catch {
    return null;
  }
}

export function isAvailableNow(profile: UserProfile, now: Date, maxResponseHours: number): boolean {
  return profile.availability.some((window) => {
    if (!validateAvailability(window) || window.maxResponseHours > maxResponseHours) return false;
    const local = zonedDayAndMinute(now, window.timezone);
    if (!local) return false;
    const currentDayAllowed = window.daysOfWeek.includes(local.day);
    if (window.startMinute < window.endMinute) {
      return currentDayAllowed && local.minute >= window.startMinute && local.minute < window.endMinute;
    }
    const previousDay = (local.day + 6) % 7;
    return (
      (currentDayAllowed && local.minute >= window.startMinute) ||
      (window.daysOfWeek.includes(previousDay) && local.minute < window.endMinute)
    );
  });
}
