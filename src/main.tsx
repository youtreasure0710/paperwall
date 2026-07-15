import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

const bootTheme = window.localStorage.getItem('paperwall-theme');
if (bootTheme === 'dark') {
  document.documentElement.classList.add('dark');
}

if (!(Promise as PromiseConstructor & { withResolvers?: unknown }).withResolvers) {
  (Promise as PromiseConstructor & {
    withResolvers: <T>() => {
      promise: Promise<T>;
      resolve: (value: T | PromiseLike<T>) => void;
      reject: (reason?: unknown) => void;
    };
  }).withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
