import { z } from 'zod';
import { ChannelSchema } from './channel.schema';

export const MAX_SERVER_NAME_LENGTH = 100;

export const ServerSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  name: z.string().min(1).max(MAX_SERVER_NAME_LENGTH),
  inviteCode: z.string(),
  createdAt: z.string().datetime({ offset: true }),
});
export type Server = z.infer<typeof ServerSchema>;

export const ServerWithChannelsSchema = ServerSchema.extend({
  channels: z.array(ChannelSchema),
});
export type ServerWithChannels = z.infer<typeof ServerWithChannelsSchema>;

export const ServerMemberSchema = z.object({
  id: z.string().uuid(),
  serverId: z.string().uuid(),
  userId: z.string().uuid(),
  role: z.enum(['owner', 'member']),
  joinedAt: z.string().datetime({ offset: true }),
});
export type ServerMember = z.infer<typeof ServerMemberSchema>;

export const CreateServerRequestSchema = z.object({
  name: z.string().min(1).max(MAX_SERVER_NAME_LENGTH),
});
export type CreateServerRequest = z.infer<typeof CreateServerRequestSchema>;

export const CreateServerResponseSchema = ServerSchema;
export type CreateServerResponse = z.infer<typeof CreateServerResponseSchema>;

export const UpdateServerRequestSchema = z.object({
  name: z.string().min(1).max(MAX_SERVER_NAME_LENGTH),
});
export type UpdateServerRequest = z.infer<typeof UpdateServerRequestSchema>;

export const ServerListResponseSchema = z.object({
  servers: z.array(ServerSchema),
});
export type ServerListResponse = z.infer<typeof ServerListResponseSchema>;

export const JoinServerRequestSchema = z.object({
  inviteCode: z.string().min(1),
});
export type JoinServerRequest = z.infer<typeof JoinServerRequestSchema>;

export const ServerMemberListResponseSchema = z.object({
  members: z.array(ServerMemberSchema),
});
export type ServerMemberListResponse = z.infer<typeof ServerMemberListResponseSchema>;
