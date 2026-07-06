export interface AuthStatus {
  authEnabled: boolean;
  authenticated: boolean;
  hasDisplayToken: boolean;
}

// Initial IP-allowlist snapshot fetched by the parent (only when auth is
// enabled and the caller is authenticated) and seeded into IpAllowlist state.
export interface IpAllowlistData {
  allowlist: string[];
  bypassAuth: boolean;
  restrictAccess: boolean;
  callerIp: string;
}
