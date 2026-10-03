import { compileContractSource, hexToBytes } from '@payrail/contracts-sdk';
import {
  createEphemeralWallet,
  type PayrailWallet,
} from '@platform/wallet-core';
import { attr, html, on, signal, textareaValue } from 'workstar';
import {
  fundAccount,
  loadAccount,
  loadContract,
  loadNetwork,
  submitEnvelope,
  type PublicContractState,
  type PublicNetworkStatus,
} from './api';

const DEFAULT_SOURCE = `payrail 1
# Attached TEST is deposited into the contract account.
entry deposit
  attached_amount
  store deposited
  emit Deposited
end

# Refund the recorded amount to the caller, then clear state.
entry refund
  state deposited
  transfer_caller
  const 0
  store deposited
  emit Refunded
end`;

type Phase = 'starting' | 'ready' | 'working' | 'error';

export function sandbox() {
  const network = signal<PublicNetworkStatus | null>(null);
  const wallet = signal<PayrailWallet | null>(null);
  const phase = signal<Phase>('starting');
  const message = signal('Creating an in-memory devnet wallet…');
  const output = signal('No finalized contract operation yet.');
  const contractId = signal('');
  const contract = signal<PublicContractState | null>(null);

  const refreshContract = async () => {
    if (!contractId.value) return;
    contract.value = await loadContract(contractId.value);
  };

  const initialize = async () => {
    try {
      const status = await loadNetwork();
      const created = await createEphemeralWallet(status.addressPrefix);
      await fundAccount(created.address);
      network.value = status;
      wallet.value = created;
      phase.value = 'ready';
      message.value =
        'Funded ephemeral wallet ready. Keys stay in this browser tab.';
    } catch (error) {
      phase.value = 'error';
      message.value = errorMessage(error);
    }
  };

  const deploy = async (event: Event) => {
    event.preventDefault();
    const signer = wallet.value;
    const status = network.value;
    if (!signer || !status) return;
    phase.value = 'working';
    message.value = 'Compiling, signing and waiting for finalized deployment…';
    try {
      const form = event.currentTarget as HTMLFormElement;
      const code = compileContractSource(field(form, 'source'));
      const account = await loadAccount(signer.address);
      const envelope = await signer.signContractDeploy({
        networkId: status.networkId,
        assetId: status.asset.id,
        idempotencyKey: random32(),
        salt: random32(),
        code,
        fee: 1n,
        nonce: BigInt(account.nonce),
        validUntilHeight: BigInt(account.finalizedHeight) + 20n,
      });
      const result = await submitEnvelope(envelope);
      if (!result.contract) {
        throw new Error('Finalized block omitted contract deployment data.');
      }
      contractId.value = result.contract.contractId;
      await refreshContract();
      output.value = JSON.stringify(result, null, 2);
      phase.value = 'ready';
      message.value = `Contract finalized in block #${result.checkpoint.height}.`;
    } catch (error) {
      phase.value = 'error';
      message.value = errorMessage(error);
      output.value = JSON.stringify(
        { accepted: false, error: errorMessage(error) },
        null,
        2,
      );
    }
  };

  const call = async (event: Event) => {
    event.preventDefault();
    const signer = wallet.value;
    const status = network.value;
    if (!signer || !status || !contractId.value) return;
    phase.value = 'working';
    message.value = 'Signing call and waiting for deterministic execution…';
    try {
      const form = event.currentTarget as HTMLFormElement;
      const account = await loadAccount(signer.address);
      const envelope = await signer.signContractCall({
        networkId: status.networkId,
        assetId: status.asset.id,
        idempotencyKey: random32(),
        contractId: contractId.value,
        entrypoint: field(form, 'entrypoint'),
        args: parseHex(field(form, 'args')),
        attachedAmount: canonicalAmount(field(form, 'amount')),
        fee: 1n,
        executionLimit: canonicalAmount(field(form, 'executionLimit')),
        nonce: BigInt(account.nonce),
        validUntilHeight: BigInt(account.finalizedHeight) + 20n,
      });
      const result = await submitEnvelope(envelope);
      await refreshContract();
      output.value = JSON.stringify(result, null, 2);
      phase.value = 'ready';
      message.value = `Call finalized in block #${result.checkpoint.height}; state root updated.`;
    } catch (error) {
      phase.value = 'error';
      message.value = errorMessage(error);
      output.value = JSON.stringify(
        { accepted: false, error: errorMessage(error) },
        null,
        2,
      );
    }
  };

  void initialize();

  return html`<main>
    <section class="intro">
      <div>
        <p class="eyebrow">PAYRAIL / LIVE CONTRACT DEVNET</p>
        <h1>Write. Deploy.<br /><em>Execute.</em></h1>
      </div>
      <p class="intro-copy">
        Compile deterministic Payrail Contract Language v1 in your browser, sign
        with an ephemeral wallet and inspect the finalized block, events and
        canonical on-chain state.
      </p>
    </section>

    <section class="status-grid" aria-label="Sandbox and network status">
      <article
        class="safety-card"
        ${attr('data-live', () => String(phase.value === 'ready'))}
      >
        <span class="status-dot"></span>
        <div>
          <strong>${() => phaseLabel(phase.value)}</strong
          ><small>${() => message.value}</small>
        </div>
        <b>REAL DEVNET</b>
      </article>
      <article
        class="network-card"
        ${attr('data-live', () => String(Boolean(network.value)))}
      >
        <span class="network-pulse"></span>
        <div>
          <small>EPHEMERAL SIGNER</small
          ><strong>${() => compact(wallet.value?.address)}</strong>
        </div>
        <dl>
          <div>
            <dt>Finalized</dt>
            <dd>#${() => network.value?.finalizedHeight ?? '—'}</dd>
          </div>
          <div>
            <dt>Validators</dt>
            <dd>${() => validatorLabel(network.value)}</dd>
          </div>
          <div>
            <dt>Asset</dt>
            <dd>${() => network.value?.asset.symbol ?? '—'}</dd>
          </div>
        </dl>
      </article>
    </section>

    <section
      class="workspace contract-workspace"
      aria-label="Live contract workspace"
    >
      <section class="intent-panel source-panel">
        ${panelHeading('01', 'Contract source', 'Payrail Contract Language v1')}
        <form ${on('submit', (event) => void deploy(event))}>
          <label class="json-field field-wide"
            ><span>Source code</span
            ><textarea
              name="source"
              spellcheck="false"
              data-testid="contract-source"
              ${textareaValue(DEFAULT_SOURCE)}
            ></textarea>
          </label>
          <div class="form-actions field-wide">
            <button
              class="run-button"
              type="submit"
              data-testid="deploy-contract"
              ${attr(
                'disabled',
                () => phase.value === 'starting' || phase.value === 'working',
              )}
            >
              ${() =>
                phase.value === 'working'
                  ? 'Finalizing…'
                  : 'Compile & deploy'}<span>→</span>
            </button>
            <a
              class="secondary-button docs-link"
              href="https://github.com/payrail-one/sdk#smart-contracts"
              >Language reference</a
            >
          </div>
        </form>
      </section>

      <section class="intent-panel call-panel">
        ${panelHeading(
          '02',
          'Call contract',
          'Signed execution against finalized state',
        )}
        <form ${on('submit', (event) => void call(event))}>
          <div class="field-wide">
            ${fieldTemplate(
              'Contract ID',
              'contractId',
              () => contractId.value,
              true,
            )}
          </div>
          <div>
            ${fieldTemplate('Entrypoint', 'entrypoint', () => 'deposit')}
          </div>
          <div>
            ${fieldTemplate(
              'Attached atomic',
              'amount',
              () => '1000000',
              false,
              'numeric',
            )}
          </div>
          <div>
            ${fieldTemplate(
              'Execution limit',
              'executionLimit',
              () => '100000',
              false,
              'numeric',
            )}
          </div>
          <div class="field-wide">
            ${fieldTemplate('Arguments · lowercase hex', 'args', () => '')}
          </div>
          <div class="form-actions field-wide">
            <button
              class="run-button"
              type="submit"
              data-testid="call-contract"
              ${attr(
                'disabled',
                () => !contractId.value || phase.value === 'working',
              )}
            >
              Execute on devnet <span>→</span>
            </button>
            <button
              class="secondary-button"
              type="button"
              ${on('click', () => void refreshContract())}
            >
              Refresh state
            </button>
          </div>
        </form>
        <div class="state-card">
          <span>Canonical contract state</span>
          <dl>
            <div>
              <dt>Balance</dt>
              <dd>${() => contract.value?.balance ?? '—'}</dd>
            </div>
            <div>
              <dt>Height</dt>
              <dd>${() => contract.value?.finalizedHeight ?? '—'}</dd>
            </div>
            <div>
              <dt>Code hash</dt>
              <dd>${() => compact(contract.value?.codeHash)}</dd>
            </div>
          </dl>
          <pre>
${() => JSON.stringify(contract.value?.state ?? [], null, 2)}</pre
          >
        </div>
      </section>

      <section class="output-panel live-output">
        ${panelHeading(
          '03',
          'Finalized receipt',
          'Block, state root and emitted topics',
        )}
        <div class="output-tabs"><span>NETWORK RESPONSE</span></div>
        <pre data-testid="contract-output">${() => output.value}</pre>
      </section>
    </section>
  </main>`;
}

function panelHeading(number: string, title: string, subtitle: string) {
  return html`<div class="panel-heading">
    <span>${number}</span>
    <div><strong>${title}</strong><small>${subtitle}</small></div>
  </div>`;
}

function fieldTemplate(
  label: string,
  name: string,
  value: () => string,
  readonly = false,
  inputMode?: string,
) {
  return html`<label
    ><span>${label}</span
    ><input
      ${attr('name', name)}
      ${attr('value', value)}
      ${attr('readonly', readonly ? 'true' : null)}
      ${attr('inputmode', inputMode ?? null)}
  /></label>`;
}

function field(form: HTMLFormElement, name: string): string {
  const control = form.elements.namedItem(name);
  if (
    !(control instanceof HTMLInputElement) &&
    !(control instanceof HTMLTextAreaElement)
  ) {
    throw new Error(`Missing ${name} field.`);
  }
  return control.value.trim();
}

function parseHex(value: string): Uint8Array<ArrayBuffer> {
  return value.length === 0 ? new Uint8Array() : hexToBytes(value);
}

function canonicalAmount(value: string): bigint {
  if (!/^(?:0|[1-9][0-9]{0,38})$/.test(value)) {
    throw new Error('Amounts must be canonical unsigned integers.');
  }
  return BigInt(value);
}

function random32(): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(32));
}

function compact(value: string | undefined): string {
  if (!value) return '—';
  return value.length > 22 ? `${value.slice(0, 12)}…${value.slice(-8)}` : value;
}

function validatorLabel(network: PublicNetworkStatus | null): string {
  return network
    ? `${network.onlineValidators}/${network.validatorCount}`
    : '—';
}

function phaseLabel(phase: Phase): string {
  if (phase === 'starting') return 'Preparing sandbox';
  if (phase === 'working') return 'Consensus pending';
  if (phase === 'error') return 'Action failed';
  return 'Ready to sign';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected devnet failure.';
}
