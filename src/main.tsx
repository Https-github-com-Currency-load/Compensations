import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then((registration) => {
        console.info('CommissionPay service worker registered', registration.scope);
      })
      .catch((error: unknown) => {
        console.error('Service worker registration failed:', error);
      });
  });
}

createRoot(document.getElementById('root')!).render(<App />);
