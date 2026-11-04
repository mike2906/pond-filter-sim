import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { bootDesign } from './boot';
import { DesignProvider } from './state/context';
import './styles/tokens.css';
import './styles/app.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const boot = bootDesign();

createRoot(root).render(
  <StrictMode>
    <DesignProvider initial={boot.design}>
      <App {...(boot.message ? { bootMessage: boot.message } : {})} />
    </DesignProvider>
  </StrictMode>,
);
