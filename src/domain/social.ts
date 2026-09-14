import type { ISODateTime, UserId } from "./models";

export interface PeerRating {
  id: string;
  raterId: UserId;
  targetUserId: UserId;
  suitability: number;
  inspiration: number;
  comment?: string;
  submittedAt: ISODateTime;
}

export interface PeerRatingAggregate {
  userId: UserId;
  count: number;
  suitability: number;
  inspiration: number;
}

export interface ConnectionRequest {
  id: string;
  requesterId: UserId;
  targetUserId: UserId;
  status: "pending" | "accepted" | "declined";
  requestedAt: ISODateTime;
  respondedAt?: ISODateTime;
}

