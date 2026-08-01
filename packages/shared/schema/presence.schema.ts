import { z } from 'zod';

/** A single member currently connected to a channel. */
export const MemberSchema = z.object({
  name: z.string(),
  socketId: z.string(),
});
export type Member = z.infer<typeof MemberSchema>;

/** Socket: userJoined / userLeft — server → client broadcast */
export const UserPresenceSchema = MemberSchema;
export type UserPresence = z.infer<typeof UserPresenceSchema>;

/** Socket: memberList — server → client broadcast (sent on join, and after any change) */
export const MemberListSchema = z.object({
  members: z.array(MemberSchema),
});
export type MemberList = z.infer<typeof MemberListSchema>;
