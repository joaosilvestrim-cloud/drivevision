// Accept a hostname, host:port or a copied Postgres URI in the HOST field.
// Credentials in that field are deliberately ignored; runtime credentials remain separate.
export function databaseEndpoint(value: string | undefined) {
  let endpoint = (value || "").trim();
  if (/^postgres(?:ql)?:\/\//i.test(endpoint)) {
    endpoint = endpoint.replace(/^postgres(?:ql)?:\/\//i, "");
    const separator = endpoint.lastIndexOf("@");
    if (separator >= 0) endpoint = endpoint.slice(separator + 1);
    endpoint = endpoint.split(/[/?#]/, 1)[0];
  }
  const match = /^(\[[a-f\d:]+\]|[a-z\d](?:[a-z\d.-]*[a-z\d])?)(?::(\d+))?$/i.exec(endpoint);
  if (!match) throw Object.assign(new Error("Invalid database endpoint"), { code: "DB_INVALID_HOST" });
  const port = match[2] ? Number(match[2]) : undefined;
  if (port !== undefined && (port < 1 || port > 65535))
    throw Object.assign(new Error("Invalid database port"), { code: "DB_INVALID_HOST" });
  return { host: match[1].replace(/^\[|\]$/g, ""), port };
}
