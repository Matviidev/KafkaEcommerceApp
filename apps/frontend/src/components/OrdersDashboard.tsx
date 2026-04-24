import { useEffect, useRef, useState } from 'react';
import { getOrders, type Order } from '../api';
import { StatusBadge } from './OrderForm';

export default function OrdersDashboard() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const esRef = useRef<EventSource | null>(null);

  const load = async () => {
    try {
      const data = await getOrders();
      setOrders(data);
    } catch {
      // service not ready yet
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();

    const es = new EventSource('/events');
    esRef.current = es;

    es.addEventListener('order.created', (e) => {
      const order: Order = JSON.parse(e.data);
      setOrders((prev) => [order, ...prev.filter((o) => o.orderId !== order.orderId)]);
    });

    es.addEventListener('order.status.updated', (e) => {
      const updated: Order = JSON.parse(e.data);
      setOrders((prev) => prev.map((o) => (o.orderId === updated.orderId ? { ...o, ...updated } : o)));
    });

    return () => {
      es.close();
    };
  }, []);

  const refresh = () => {
    setLoading(true);
    load();
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={styles.heading}>Orders Dashboard</h2>
        <button style={styles.btnRefresh} onClick={refresh}>Refresh</button>
      </div>

      {loading ? (
        <div style={styles.empty}>Loading…</div>
      ) : orders.length === 0 ? (
        <div style={styles.empty}>No orders yet. Place one from the Order Form tab.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr style={styles.thead}>
                <th style={styles.th}>Order ID</th>
                <th style={styles.th}>Customer</th>
                <th style={styles.th}>Amount</th>
                <th style={styles.th}>Status</th>
                <th style={styles.th}>Courier</th>
                <th style={styles.th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.orderId} style={styles.tr}>
                  <td style={{ ...styles.td, fontFamily: 'monospace', fontSize: 11 }}>
                    {o.orderId.split('-')[0]}…
                  </td>
                  <td style={styles.td}>{o.userId}</td>
                  <td style={styles.td}>${o.totalAmount.toFixed(2)}</td>
                  <td style={styles.td}><StatusBadge status={o.status} /></td>
                  <td style={styles.td}>{o.courier ?? '—'}</td>
                  <td style={styles.td}>{new Date(o.createdAt).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 24 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  heading: { margin: 0, fontSize: 22 },
  btnRefresh: {
    background: '#6c757d',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '6px 16px',
    cursor: 'pointer',
    fontSize: 13,
  },
  empty: { color: '#888', padding: 24, textAlign: 'center' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
  thead: { background: '#f8f9fa' },
  th: { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #dee2e6', fontWeight: 600, fontSize: 13 },
  tr: { borderBottom: '1px solid #f0f0f0' },
  td: { padding: '10px 12px', verticalAlign: 'middle' },
};
