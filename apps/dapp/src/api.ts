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

export async function loadNetwork(): Promise<PublicNetworkStatus> {
  const response = await fetch('/api/network', {
    headers: { accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Network status is unavailable.');
  return (await response.json()) as PublicNetworkStatus;
}
