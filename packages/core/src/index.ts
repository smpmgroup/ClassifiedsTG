import { PrismaClient, ListingStatus, MemberRole } from "@prisma/client";

export const prisma = process.env.VITEST
  ? (null as unknown as PrismaClient)
  : new PrismaClient();
export { ListingStatus, MemberRole };
export * from "./taxonomy.js";

export function jsonStringify(value: unknown): string {
  return JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item,
  );
}

export const listingTransitions: Record<
  ListingStatus,
  readonly ListingStatus[]
> = {
  draft: ["pending", "deleted"],
  pending: ["published", "rejected", "changes_requested", "deleted"],
  changes_requested: ["draft", "pending", "deleted"],
  published: ["sold", "archived", "hidden", "expired", "deleted"],
  hidden: ["published", "archived", "deleted"],
  sold: ["archived", "published", "deleted"],
  expired: ["draft", "archived", "deleted"],
  rejected: ["draft", "deleted"],
  archived: [],
  deleted: [],
};

export function assertListingTransition(
  from: ListingStatus,
  to: ListingStatus,
): void {
  if (!listingTransitions[from].includes(to))
    throw new DomainError(
      "INVALID_LISTING_TRANSITION",
      `Transition ${from} -> ${to} is not allowed`,
      409,
    );
}

export const privilegedRoles = new Set<MemberRole>([
  "moderator",
  "admin",
  "owner",
]);
export const adminRoles = new Set<MemberRole>(["admin", "owner"]);

export class DomainError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400,
    public details: unknown = null,
  ) {
    super(message);
  }
}

export function expiresAt(days: number, from = new Date()): Date {
  return new Date(from.getTime() + days * 86_400_000);
}

export function publicationAccess(
  role: MemberRole,
  messageCount: number,
  requiredMessages: number,
  paid: boolean,
): "free" | "paid" | "payment_required" {
  if (privilegedRoles.has(role) || messageCount >= requiredMessages)
    return "free";
  return paid ? "paid" : "payment_required";
}
