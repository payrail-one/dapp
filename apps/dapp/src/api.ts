export interface PublicNetworkStatus {
  readonly networkId: string;
  readonly addressPrefix: string;
  readonly finalizedHeight: string;
  readonly finalityMode: string;
  readonly validatorCount: number;
  readonly onlineValidators: number;
  readonly quorumWeight: number;
  readonly asset: {
    readonly id: string;
    readonly symbol: string;
    readonly decimals: number;
  };
}

export interface PublicAccountState {
  readonly address: string;
  readonly accountId: string;
  readonly nonce: string;
  readonly balance: string;
  readonly finalizedHeight: string;
}

export interface PublicContractState {
  readonly id: string;
  readonly owner: string;
  readonly codeHash: string;
  readonly balance: string;
  readonly state: readonly { readonly key: string; readonly value: string }[];
  readonly finalizedHeight: string;
}

export interface PublicSubmission {
  readonly transaction: {
    readonly id: string;
    readonly blockHeight: string;
    readonly kind: string;
    readonly outcome: string;
  };
  readonly checkpoint: {
    readonly height: string;
    readonly hash: string;
    readonly stateRoot: string;
  };
  readonly contract: {
    readonly contractId: string;
    readonly entrypoint: string | null;
    readonly executionUnits: string | null;
    readonly codeHash: string | null;
    readonly events: readonly string[];
  } | null;
}

export async function loadNetwork(): Promise<PublicNetworkStatus> {
  const response = await fetch('/api/network', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Network status is unavailable.');
  return (await response.json()) as PublicNetworkStatus;
}

export function loadAccount(address: string): Promise<PublicAccountState> {
  return request(`/api/accounts/${encodeURIComponent(address)}`);
}

export function fundAccount(address: string): Promise<PublicSubmission> {
  return request('/api/faucet', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address }),
  });
}

export function submitEnvelope(
  envelope: Uint8Array,
): Promise<PublicSubmission> {
  return request('/api/transactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ envelope: hex(envelope) }),
  });
}

export function loadContract(id: string): Promise<PublicContractState> {
  return request(`/api/contracts/${encodeURIComponent(id)}`);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: unknown;
    } | null;
    throw new Error(
      typeof body?.error === 'string' ? body.error : 'Devnet request failed.',
    );
  }
  return (await response.json()) as T;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}
