import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/app/App.jsx';
import '@/app/styles/index.css';
import '@/app/styles/appearance-quality.css';
import 'katex/dist/katex.min.css';
import AppProviders from './app/providers/AppProviders.jsx';
import ErrorBoundary from './shared/components/ErrorBoundary.jsx';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary><AppProviders>
      <App />
    </AppProviders></ErrorBoundary>
  </React.StrictMode>,
);
