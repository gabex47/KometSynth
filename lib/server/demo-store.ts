import "server-only";

import type { AccountRole } from "@/lib/types";
import { getServerEnvironment, hasUsableSupabaseConfig } from "@/lib/server/env";

export type AccountRecord = {
  id: string;
  username: string;
  pinHash: string;
  accountType: AccountRole;
  createdAt: string;
  createdBy: string | null;
  lastLogin: string | null;
  loginAttempts: number;
  lockedUntil: string | null;
  notes: string | null;
  disabled: boolean;
};

export type SessionRecord = {
  id: string;
  accountId: string;
  expiresAt: number;
  createdAt: number;
  ip: string;
  userAgent: string;
};

export type ProfileRecord = {
  displayName: string;
  bio: string;
  theme: "dark" | "light" | "system";
};

export type InviteRecord = {
  id: string;
  codeHash: string;
  label: string;
  accountType: Exclude<AccountRole, "owner">;
  maxUses: number;
  useCount: number;
  expiresAt: string;
  disabled: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export type ActivityRecord = {
  id: string;
  user: string;
  action: string;
  ip: string;
  timestamp: string;
};

export type ApiKeyRecord = {
  id: string;
  userId: string;
  provider: string;
  encryptedKey: string;
  keyHint: string;
  createdAt: string;
  updatedAt: string;
};

type DemoStore = {
  accounts: Map<string, AccountRecord>;
  sessions: Map<string, SessionRecord>;
  logs: ActivityRecord[];
  apiKeys: ApiKeyRecord[];
  profiles: Map<string, ProfileRecord>;
  invites: InviteRecord[];
};

const OWNER_ID = "00000000-0000-4000-8000-000000000001";
const OWNER_PIN_HASH = "$2b$12$7sdj1TqOWBnmVLxgzFd64OCc3X42TNfJvIgdAGqfq8dE9kflaXcOm";
const KIDRIAN_OWNER_ID = "202f8aff-fc1a-4bc0-be5c-e5b72e1c9fc7";
const KIDRIAN_OWNER_PIN_HASH = "$2b$12$GKGXmJybXaL95.4DwSN7eOGzOZ2lghCsaUIUoFsLOwC/737NdfJzO";

const globalForDemo = globalThis as unknown as { synthnetDemoStore?: DemoStore };

function createStore(): DemoStore {
  const owner: AccountRecord = {
    id: OWNER_ID,
    username: "lordsynth7000",
    pinHash: OWNER_PIN_HASH,
    accountType: "owner",
    createdAt: new Date().toISOString(),
    createdBy: null,
    lastLogin: null,
    loginAttempts: 0,
    lockedUntil: null,
    notes: "Initial owner account",
    disabled: false,
  };

  const kidrianOwner: AccountRecord = {
    id: KIDRIAN_OWNER_ID,
    username: "kidrian",
    pinHash: KIDRIAN_OWNER_PIN_HASH,
    accountType: "owner",
    createdAt: new Date().toISOString(),
    createdBy: null,
    lastLogin: null,
    loginAttempts: 0,
    lockedUntil: null,
    notes: "Owner account",
    disabled: false,
  };

  return {
    accounts: new Map([
      [owner.username, owner],
      [kidrianOwner.username, kidrianOwner],
    ]),
    sessions: new Map(),
    logs: [],
    apiKeys: [],
    profiles: new Map([
      [owner.id, { displayName: "", bio: "", theme: "dark" }],
      [kidrianOwner.id, { displayName: "", bio: "", theme: "dark" }],
    ]),
    invites: [],
  };
}

export const demoStore = globalForDemo.synthnetDemoStore ?? createStore();
globalForDemo.synthnetDemoStore = demoStore;

// Preserve hot-reload state when a running development server upgrades from an
// earlier store shape without weakening the production-only persistence rule.
const legacyStore = demoStore as DemoStore & {
  profiles?: Map<string, ProfileRecord>;
  invites?: InviteRecord[];
};
legacyStore.profiles ??= new Map(
  [...demoStore.accounts.values()].map((account) => [account.id, { displayName: "", bio: "", theme: "dark" as const }]),
);
legacyStore.invites ??= [];

export function isDemoMode() {
  if (getServerEnvironment().SYNTHNET_DEMO_MODE === "true") return true;
  return (
    process.env.NODE_ENV !== "production" &&
    !hasUsableSupabaseConfig()
  );
}
