import type { DiscussionSpec, MatchSuccess, Room, UserProfile } from "@/domain";

/** Storage ports keep domain rules independent from the MVP's persistence choice. */
export interface ProfileRepository {
  getProfile(id: string): Promise<UserProfile | undefined>;
  listProfiles(): Promise<readonly UserProfile[]>;
  saveProfile(profile: UserProfile): Promise<void>;
}

export interface DiscussionRepository {
  getDiscussionSpec(id: string): Promise<DiscussionSpec | undefined>;
  listDiscussionSpecs(): Promise<readonly DiscussionSpec[]>;
}

export interface MatchRepository {
  getMatch(discussionSpecId: string): Promise<MatchSuccess | undefined>;
  saveMatch(match: MatchSuccess): Promise<void>;
}

export interface RoomRepository {
  getRoom(id: string): Promise<Room | undefined>;
  saveRoom(room: Room): Promise<void>;
}

export type CrossPointRepositories = ProfileRepository &
  DiscussionRepository &
  MatchRepository &
  RoomRepository;
