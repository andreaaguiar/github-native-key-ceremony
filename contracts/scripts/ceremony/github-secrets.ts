// Writes environment secrets via GitHub's API, which requires libsodium
// sealed-box encryption. See
// https://docs.github.com/en/rest/actions/secrets
import sodium from "libsodium-wrappers";
import { API, githubJson } from "./github-api.js";

export async function getRepositoryId(token: string, owner: string, repo: string): Promise<number> {
  const data = await githubJson<{ id: number }>(`${API}/repos/${owner}/${repo}`, token);
  return data.id;
}

interface EnvironmentPublicKey {
  key: string;
  key_id: string;
}

export async function setEnvironmentSecret(opts: {
  token: string;
  repositoryId: number;
  environment: string;
  secretName: string;
  value: string;
}): Promise<void> {
  await sodium.ready;

  // Environment secrets are keyed by numeric repository ID, not
  // {owner}/{repo} like every other Actions-secrets endpoint.
  const base = `${API}/repositories/${opts.repositoryId}/environments/${opts.environment}/secrets`;

  const pk = await githubJson<EnvironmentPublicKey>(`${base}/public-key`, opts.token);
  const keyBytes = sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL);
  const messageBytes = sodium.from_string(opts.value);
  const sealed = sodium.crypto_box_seal(messageBytes, keyBytes);
  const encryptedValue = sodium.to_base64(sealed, sodium.base64_variants.ORIGINAL);

  await githubJson(`${base}/${opts.secretName}`, opts.token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ encrypted_value: encryptedValue, key_id: pk.key_id }),
  });
}
