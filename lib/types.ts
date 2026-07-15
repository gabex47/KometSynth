export type AccountRole = "normal" | "admin" | "owner";

export type SafeAccount = {
  id: string;
  username: string;
  accountType: AccountRole;
  createdAt: string;
  lastLogin: string | null;
};

export type SessionAccount = SafeAccount & {
  disabled: boolean;
};

export type ToolCategory = "developer" | "network" | "security" | "utilities";

export type ToolDefinition = {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  tags: string[];
  available?: boolean;
};
