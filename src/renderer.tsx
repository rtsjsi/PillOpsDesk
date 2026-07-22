import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './renderer/App';
import './index.css';

/** Stop mouse-wheel / arrow keys from quietly changing focused number inputs. */
function isNumberInput(target: EventTarget | null): target is HTMLInputElement {
  return target instanceof HTMLInputElement && target.type === 'number';
}

document.addEventListener(
  'wheel',
  (e) => {
    if (isNumberInput(e.target)) e.preventDefault();
  },
  { passive: false, capture: true }
);

document.addEventListener(
  'keydown',
  (e) => {
    if (!isNumberInput(e.target)) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
  },
  true
);

const container = document.getElementById('root')!;
createRoot(container).render(
  <React.StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </React.StrictMode>
);
