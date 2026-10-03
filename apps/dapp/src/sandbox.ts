import { attr, html, on, signal, textareaValue } from 'workstar';
import { loadNetwork, type PublicNetworkStatus } from './api';
import { sandboxScenarios, type ScenarioId } from './scenarios';
import {
  draftForScenario,
  sdkSnippet,
  serializeDraft,
  simulateDraft,
  type SandboxDraft,
  type SandboxRun,
} from './simulator';

type OutputTab = 'result' | 'sdk' | 'intent';
const HISTORY_KEY = 'payrail-sandbox-history-v1';

export function sandbox() {
  const network = signal<PublicNetworkStatus | null>(null);
  const reachable = signal(false);
  const selected = signal<ScenarioId>('escrow');
  const busy = signal(false);
  const outputTab = signal<OutputTab>('result');
  const run = signal<SandboxRun | null>(null);
  const output = signal(
    'Choose a scenario, inspect the intent and run a local simulation.',
  );
  const outputKind = signal<'idle' | 'accepted' | 'rejected'>('idle');
  const history = signal<readonly SandboxRun[]>(readHistory());
  const copied = signal(false);

  const refreshNetwork = async () => {
    try {
      network.value = await loadNetwork();
      reachable.value = true;
    } catch {
      reachable.value = false;
    }
  };

  const chooseScenario = (id: ScenarioId) => {
    selected.value = id;
    const form = document.querySelector<HTMLFormElement>('#intent-form');
    if (!form) return;
    writeDraft(form, draftForScenario(id, network.value?.finalizedHeight));
    run.value = null;
    output.value = 'Scenario loaded. Run the simulation to inspect its result.';
    outputKind.value = 'idle';
    outputTab.value = 'result';
  };

  const runSimulation = async (event: Event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
    busy.value = true;
    output.value = 'Validating canonical values and evaluating policy…';
    outputKind.value = 'idle';
    try {
      const next = await simulateDraft(readDraft(form, selected.value));
      run.value = next;
      output.value = next.output;
      outputKind.value = next.accepted ? 'accepted' : 'rejected';
      outputTab.value = 'result';
      const nextHistory = [next, ...history.value].slice(0, 10);
      history.value = nextHistory;
      sessionStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
    } catch (error) {
      run.value = null;
      output.value = JSON.stringify(
        {
          mode: 'local-preview',
          accepted: false,
          networkWrite: false,
          error: error instanceof Error ? error.message : 'Simulation failed.',
        },
        null,
        2,
      );
      outputKind.value = 'rejected';
      outputTab.value = 'result';
    } finally {
      busy.value = false;
    }
  };

  const selectTab = (tab: OutputTab) => {
    outputTab.value = tab;
    const current = run.value;
    const form = document.querySelector<HTMLFormElement>('#intent-form');
    if (tab === 'result') {
      output.value = current?.output ?? 'Run a simulation to see its result.';
    } else if (form) {
      const draft = readDraft(form, selected.value);
      try {
        output.value =
          tab === 'sdk' ? sdkSnippet(draft) : serializeDraft(draft);
      } catch (error) {
        output.value =
          error instanceof Error ? error.message : 'Invalid intent.';
      }
    }
  };

  const copyOutput = async () => {
    await navigator.clipboard.writeText(output.value);
    copied.value = true;
    window.setTimeout(() => (copied.value = false), 1_400);
  };

  const exportIntent = () => {
    const form = document.querySelector<HTMLFormElement>('#intent-form');
    if (!form) return;
    try {
      const body = serializeDraft(readDraft(form, selected.value));
      const url = URL.createObjectURL(
        new Blob([body], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = `payrail-${selected.value}-intent.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      output.value = error instanceof Error ? error.message : 'Export failed.';
      outputKind.value = 'rejected';
    }
  };

  const restoreRun = (item: SandboxRun) => {
    selected.value = item.scenarioId;
    run.value = item;
    output.value = item.output;
    outputKind.value = item.accepted ? 'accepted' : 'rejected';
    outputTab.value = 'result';
  };

  void refreshNetwork();
  window.setInterval(() => void refreshNetwork(), 10_000);
  const initial = draftForScenario('escrow');

  return html`<main>
    <section class="intro">
      <div>
        <p class="eyebrow">PAYRAIL / CONTRACT TOOLING</p>
        <h1>Build the intent.<br /><em>Test the outcome.</em></h1>
      </div>
      <p class="intro-copy">
        A local-first workspace for programmable payment flows. Validate typed
        inputs, simulate policy outcomes, inspect encoded arguments and export
        reproducible intents without exposing a key.
      </p>
    </section>

    <section class="status-grid" aria-label="Sandbox and network status">
      <article class="safety-card">
        <span class="status-dot"></span>
        <div>
          <strong>Local simulation</strong
          ><small>No signing · no network write</small>
        </div>
        <b>SAFE MODE</b>
      </article>
      <article
        class="network-card"
        ${attr('data-live', () => String(reachable.value))}
      >
        <span class="network-pulse"></span>
        <div>
          <small>PAYMENTS DEVNET</small>
          <strong
            >${() =>
              reachable.value ? 'Connected' : 'Checking network'}</strong
          >
        </div>
        <dl>
          <div>
            <dt>Finalized</dt>
            <dd>#${() => network.value?.finalizedHeight ?? '—'}</dd>
          </div>
          <div>
            <dt>Validators</dt>
            <dd>
              ${() =>
                network.value
                  ? `${network.value.onlineValidators}/${network.value.validatorCount}`
                  : '—'}
            </dd>
          </div>
          <div>
            <dt>Asset</dt>
            <dd>${() => network.value?.asset.symbol ?? 'TEST'}</dd>
          </div>
        </dl>
      </article>
    </section>

    <section class="workspace" aria-label="Contract simulation workspace">
      <aside class="scenario-panel">
        ${panelHeading('01', 'Scenario', 'Choose a policy pattern')}
        <div class="scenario-list" role="list">
          ${sandboxScenarios.map(
            (scenario) =>
              html`<button
                type="button"
                ${attr('data-active', () =>
                  String(selected.value === scenario.id),
                )}
                ${attr('aria-pressed', () =>
                  String(selected.value === scenario.id),
                )}
                ${on('click', () => chooseScenario(scenario.id))}
              >
                <span>${scenario.number}</span>
                <div>
                  <strong>${scenario.label}</strong
                  ><small>${scenario.summary}</small>
                </div>
                <i aria-hidden="true">→</i>
              </button>`,
          )}
        </div>
        <div class="boundary-note">
          <strong>Execution boundary</strong>
          <p>
            This provider evaluates locally. A signed operation is never created
            or broadcast.
          </p>
        </div>
      </aside>

      <section class="intent-panel">
        ${panelHeading('02', 'Intent', 'Edit canonical SDK input')}
        <form
          id="intent-form"
          ${on('submit', (event) => void runSimulation(event))}
        >
          <div class="field-wide">
            ${field('Contract ID', 'contractId', initial.contractId)}
          </div>
          <div class="field-wide">
            ${field('Caller', 'caller', initial.caller)}
          </div>
          <div class="field-wide">
            ${field('Entrypoint', 'entrypoint', initial.entrypoint)}
          </div>
          ${field(
            'Amount · atomic units',
            'amountAtomic',
            initial.amountAtomic,
            'numeric',
          )}
          ${field(
            'Execution budget',
            'executionBudget',
            initial.executionBudget,
            'numeric',
          )}
          ${field('Nonce', 'nonce', initial.nonce, 'numeric')}
          ${field(
            'Valid until height',
            'validUntilHeight',
            initial.validUntilHeight,
            'numeric',
          )}
          <label class="json-field field-wide"
            ><span>Arguments · JSON</span
            ><textarea
              name="argsJson"
              spellcheck="false"
              data-testid="args-json"
              ${textareaValue(initial.argsJson)}
            ></textarea>
          </label>
          <div class="form-actions field-wide">
            <button
              class="run-button"
              type="submit"
              data-testid="run-simulation"
              ${attr('disabled', () => busy.value)}
            >
              ${() => (busy.value ? 'Simulating…' : 'Run simulation')}
              <span>→</span>
            </button>
            <button
              class="secondary-button"
              type="button"
              ${on('click', exportIntent)}
            >
              Export intent
            </button>
          </div>
        </form>
      </section>

      <section
        class="output-panel"
        ${attr('data-kind', () => outputKind.value)}
      >
        ${panelHeading('03', 'Inspect', 'Result, code and payload')}
        <div class="output-tabs" role="tablist">
          ${tab('result', 'Result', outputTab, selectTab)}
          ${tab('sdk', 'SDK code', outputTab, selectTab)}
          ${tab('intent', 'Intent JSON', outputTab, selectTab)}
          <button
            class="copy-button"
            type="button"
            ${on('click', () => void copyOutput())}
          >
            ${() => (copied.value ? 'Copied' : 'Copy')}
          </button>
        </div>
        <div class="result-state">
          <span></span
          ><b data-testid="result-state"
            >${() =>
              outputKind.value === 'idle'
                ? 'READY'
                : outputKind.value.toUpperCase()}</b
          >
          <small>LOCAL PREVIEW</small>
        </div>
        <pre data-testid="sandbox-output"><code>${output}</code></pre>
        <div class="output-footer">
          <span>networkWrite: false</span><span>integer-safe values</span
          ><span>preview provider</span>
        </div>
      </section>
    </section>

    <section class="history-section">
      <div class="history-heading">
        <div>
          <p class="eyebrow">SESSION LOG</p>
          <h2>Simulation history</h2>
        </div>
        <p>
          Stored in this browser tab only. Reloading starts a clean developer
          session.
        </p>
      </div>
      <div class="history-list">
        ${() =>
          history.value.length === 0
            ? html`<div class="history-empty">
                No runs yet. Your latest simulations will appear here.
              </div>`
            : history.value.map(
                (item) =>
                  html`<button
                    type="button"
                    ${on('click', () => restoreRun(item))}
                  >
                    <span
                      class="history-state"
                      ${attr('data-ok', String(item.accepted))}
                    ></span
                    ><strong>${item.summary}</strong
                    ><small
                      >${new Date(item.createdAt).toLocaleTimeString()}</small
                    ><i>Open →</i>
                  </button>`,
              )}
      </div>
    </section>
  </main>`;
}

function panelHeading(number: string, title: string, copy: string) {
  return html`<div class="panel-heading">
    <span>${number}</span>
    <div><strong>${title}</strong><small>${copy}</small></div>
  </div>`;
}

function field(
  label: string,
  name: keyof SandboxDraft,
  value: string,
  inputmode?: string,
) {
  return html`<label
    ><span>${label}</span
    ><input
      ${attr('name', name)}
      ${attr('value', value)}
      ${attr('inputmode', inputmode ?? 'text')}
      required
  /></label>`;
}

function tab(
  id: OutputTab,
  label: string,
  state: { value: OutputTab },
  select: (id: OutputTab) => void,
) {
  return html`<button
    type="button"
    role="tab"
    ${attr('aria-selected', () => String(state.value === id))}
    ${on('click', () => select(id))}
  >
    ${label}
  </button>`;
}

function readDraft(
  form: HTMLFormElement,
  scenarioId: ScenarioId,
): SandboxDraft {
  const data = new FormData(form);
  const value = (name: string) => String(data.get(name) ?? '').trim();
  return {
    scenarioId,
    contractId: value('contractId'),
    caller: value('caller'),
    entrypoint: value('entrypoint'),
    amountAtomic: value('amountAtomic'),
    executionBudget: value('executionBudget'),
    nonce: value('nonce'),
    validUntilHeight: value('validUntilHeight'),
    argsJson: String(data.get('argsJson') ?? ''),
  };
}

function writeDraft(form: HTMLFormElement, draft: SandboxDraft) {
  for (const [name, value] of Object.entries(draft)) {
    if (name === 'scenarioId') continue;
    const control = form.elements.namedItem(name);
    if (
      control instanceof HTMLInputElement ||
      control instanceof HTMLTextAreaElement
    )
      control.value = value;
  }
}

function readHistory(): readonly SandboxRun[] {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(HISTORY_KEY) ?? '[]',
    ) as unknown;
    return Array.isArray(value) ? (value as SandboxRun[]).slice(0, 10) : [];
  } catch {
    return [];
  }
}
