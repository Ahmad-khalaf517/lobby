// Schemas & inferred types
export * from './schemas/channel.schema.js';
export * from './schemas/chat.schema.js';
export * from './schemas/typing.schema.js';
export * from './schemas/presence.schema.js';
export * from './schemas/call.schema.js';
export * from './schemas/user-profile.schema.js';
export * from './schemas/account-settings.schema.js';
export * from './schemas/auth.schema.js';

// Constants
export * from './constants/socket-events.js';
export * from './constants/limits.js';

// Mocks (dev/test only — never import these in production code paths)
export * from './mocks/fixtures.js';
