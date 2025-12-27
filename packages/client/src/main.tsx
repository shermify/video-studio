import { createRoot } from 'react-dom/client';
import './index.css';
import store from './store';
import { Provider as ReduxProvider } from 'react-redux';
import { App } from './App';

import { ThemeProvider } from './theme/theme-provider';

createRoot(document.getElementById('root')!).render(
  <ReduxProvider store={store}>
    <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
      <App />
    </ThemeProvider>
  </ReduxProvider>
);
