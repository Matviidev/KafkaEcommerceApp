import { useState } from 'react';
import OrderForm from './components/OrderForm';
import OrdersDashboard from './components/OrdersDashboard';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import SearchPage from './components/SearchPage';

type Tab = 'form' | 'orders' | 'analytics' | 'search';

const TABS: { id: Tab; label: string }[] = [
  { id: 'form', label: 'Place Order' },
  { id: 'orders', label: 'Orders' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'search', label: 'Search' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('form');

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div style={styles.brand}>E-Commerce Platform</div>
        <nav style={styles.nav}>
          {TABS.map((t) => (
            <button
              key={t.id}
              style={{ ...styles.navBtn, ...(tab === t.id ? styles.navBtnActive : {}) }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main style={styles.main}>
        {tab === 'form' && <OrderForm />}
        {tab === 'orders' && <OrdersDashboard />}
        {tab === 'analytics' && <AnalyticsDashboard />}
        {tab === 'search' && <SearchPage />}
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  root: { minHeight: '100vh', background: '#f8f9fa', fontFamily: 'system-ui, sans-serif' },
  header: {
    background: '#1a1a2e',
    color: '#fff',
    padding: '0 24px',
    display: 'flex',
    alignItems: 'center',
    gap: 32,
    height: 56,
  },
  brand: { fontWeight: 700, fontSize: 18, letterSpacing: 0.5 },
  nav: { display: 'flex', gap: 4 },
  navBtn: {
    background: 'transparent',
    color: '#aaa',
    border: 'none',
    padding: '8px 16px',
    cursor: 'pointer',
    borderRadius: 6,
    fontSize: 14,
    transition: 'all 0.15s',
  },
  navBtnActive: { background: 'rgba(255,255,255,0.12)', color: '#fff', fontWeight: 600 },
  main: { maxWidth: 1100, margin: '0 auto', padding: '24px 16px' },
};
