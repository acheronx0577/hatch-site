import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { inject } from '@vercel/analytics';
import React from 'react';
import App from './App.tsx';
import './index.css';
import CognitoAuthProvider from './providers/CognitoAuthProvider.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';

inject();

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <CognitoAuthProvider>
          <App />
        </CognitoAuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
