/** Append these to apps/api/src/modules/database/database.types.ts */

export type ServerRow = {
  id: string;
  owner_id: string;
  name: string;
  invite_code: string;
  created_at: string;
};

export type ServerInsert = {
  owner_id: string;
  name: string;
  invite_code: string;
};

export type ServerMemberRow = {
  id: string;
  server_id: string;
  user_id: string;
  role: string;
  joined_at: string;
};

export type ServerMemberInsert = {
  server_id: string;
  user_id: string;
  role?: string;
};

export type ServerChannelRow = {
  id: string;
  server_id: string;
  name: string;
  created_at: string;
};

export type ServerChannelInsert = {
  server_id: string;
  name: string;
};
