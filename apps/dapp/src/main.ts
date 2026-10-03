import { payrailBrand } from '@payrail/dapp-ui';
import { html, mount } from 'workstar';
import '@payrail/dapp-ui/styles.css';
import { sandbox } from './sandbox';
import './base.css';
import './sandbox.css';
import './responsive.css';

function app() {
  return html`<div class="app-shell">
    <header class="topbar">
      <div class="brand-wrap">
        ${payrailBrand({ href: 'https://payrail.one' })}
        <span class="product-name">Developer Sandbox</span>
      </div>
      <nav aria-label="Developer resources">
        <a href="https://github.com/payrail-one/dapp">Source</a>
        <a href="https://github.com/payrail-one/sdk">SDK</a>
        <a href="https://devnet.payrail.one">Devnet</a>
      </nav>
      <a class="github-link" href="https://github.com/payrail-one/dapp"
        >GitHub <span aria-hidden="true">↗</span></a
      >
    </header>
    ${sandbox()}
    <footer>
      <span>Payrail developer tooling · test assets only</span>
      <span>Open source · live devnet · no wallet secrets</span>
    </footer>
  </div>`;
}

const host = document.querySelector('#app');
if (!host) throw new Error('Missing application mount point.');
mount(host, app());
