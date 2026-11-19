import { isAdmin, type EveryAppUser } from "@every-app/sdk/server";
import { db } from "@/db";
import { users } from "@/db/schema";

export interface Me {
  id: string;
  email: string;
  admin: boolean;
}

/** The signed-in member, recorded on first sight. */
export async function me(user: EveryAppUser): Promise<Me> {
  await db
    .insert(users)
    .values({ id: user.id, email: user.email, createdAt: Date.now() })
    .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
  return { id: user.id, email: user.email, admin: isAdmin(user) };
}

export class Forbidden extends Error {
  constructor(message = "You can't change this.") {
    super(message);
  }
}

export function requireAdmin(viewer: Me) {
  if (!viewer.admin) throw new Forbidden("Only an admin can do this.");
}
