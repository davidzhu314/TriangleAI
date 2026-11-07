// D0a scaffold entry. Aroovee's screens replace this from A1 onward.
import './styles/tokens.css';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.innerHTML = `
    <main>
      <h1>ThreadSim</h1>
      <p>Decision trainer with simplified device mechanics. Not a clinical device; no claim of patient benefit.</p>
    </main>
  `;
}
