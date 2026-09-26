// Public diagnostics are a fixed allowlist, never a raw DB message or connection URL.
export function databaseFailureCode(error: unknown): string {
  const failure = error as { code?: string; message?: string };
  switch (failure?.code) {
    case "ENOTFOUND": case "EAI_AGAIN": return "DB_HOST";
    case "ECONNREFUSED": case "ENETUNREACH": case "EHOSTUNREACH": return "DB_NETWORK";
    case "ETIMEDOUT": return "DB_TIMEOUT";
    case "28P01": case "28000": return "DB_AUTH";
    case "42501": return "DB_PERMISSION";
    case "42P01": case "3F000": return "DB_SCHEMA";
    case "ENOENT": return "DB_CERTIFICATE_FILE";
    case "SELF_SIGNED_CERT_IN_CHAIN": case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE": case "UNABLE_TO_GET_ISSUER_CERT_LOCALLY":
    case "CERT_HAS_EXPIRED": case "ERR_TLS_CERT_ALTNAME_INVALID": return "DB_TLS";
  }
  if (failure?.message === "RUNTIME_ROLE_REQUIRED") return "DB_RUNTIME_ROLE";
  if (failure?.message?.includes("Tenant or user not found")) return "DB_POOLER_ACCOUNT";
  if (failure?.message?.includes("timeout")) return "DB_TIMEOUT";
  return "DB_UNAVAILABLE";
}
