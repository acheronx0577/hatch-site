import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App.tsx';
import './index.css';
import CognitoAuthProvider from './providers/CognitoAuthProvider.tsx';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <CognitoAuthProvider>
      <App />
    </CognitoAuthProvider>
  </QueryClientProvider>
);
