import type { DiscussionSpec, MatchSuccess, Room, UserProfile } from "@/domain";
import type { CrossPointRepositories } from "./contracts";

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Explicitly non-production repository used by the single-process Demo.
 * A Postgres/Supabase adapter can implement the same ports without changing domain code.
 */
export class InMemoryCrossPointRepository implements CrossPointRepositories {
  private readonly profiles = new Map<string, UserProfile>();
  private readonly specs = new Map<string, DiscussionSpec>();
  private readonly matches = new Map<string, MatchSuccess>();
  private readonly rooms = new Map<string, Room>();

  constructor(seed?: {
    profiles?: readonly UserProfile[];
    discussionSpecs?: readonly DiscussionSpec[];
    matches?: readonly MatchSuccess[];
    rooms?: readonly Room[];
  }) {
    seed?.profiles?.forEach((profile) => this.profiles.set(profile.id, clone(profile)));
    seed?.discussionSpecs?.forEach((spec) => this.specs.set(spec.id, clone(spec)));
    seed?.matches?.forEach((match) => this.matches.set(match.discussionSpecId, clone(match)));
    seed?.rooms?.forEach((room) => this.rooms.set(room.id, clone(room)));
  }

  async getProfile(id: string) {
    const value = this.profiles.get(id);
    return value ? clone(value) : undefined;
  }

  async listProfiles() {
    return [...this.profiles.values()].map(clone);
  }

  async saveProfile(profile: UserProfile) {
    this.profiles.set(profile.id, clone(profile));
  }

  async getDiscussionSpec(id: string) {
    const value = this.specs.get(id);
    return value ? clone(value) : undefined;
  }

  async listDiscussionSpecs() {
    return [...this.specs.values()].map(clone);
  }

  async getMatch(discussionSpecId: string) {
    const value = this.matches.get(discussionSpecId);
    return value ? clone(value) : undefined;
  }

  async saveMatch(match: MatchSuccess) {
    this.matches.set(match.discussionSpecId, clone(match));
  }

  async getRoom(id: string) {
    const value = this.rooms.get(id);
    return value ? clone(value) : undefined;
  }

  async saveRoom(room: Room) {
    this.rooms.set(room.id, clone(room));
  }
}
