import { useState } from 'react';
import { createOrder, type Order } from '../api';

interface Item {
  productId: string;
  quantity: number;
  price: number;
}

const SAMPLE_PRODUCTS = ['laptop-pro', 'wireless-mouse', 'usb-hub', 'monitor-4k', 'keyboard-mech'];

export default function OrderForm() {
  const [userId, setUserId] = useState('user-' + Math.random().toString(36).slice(2, 8));
  const [items, setItems] = useState<Item[]>([{ productId: SAMPLE_PRODUCTS[0], quantity: 1, price: 99.99 }]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Order | null>(null);
  const [error, setError] = useState('');

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { productId: SAMPLE_PRODUCTS[prev.length % SAMPLE_PRODUCTS.length], quantity: 1, price: 49.99 },
    ]);

  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const updateItem = (i: number, field: keyof Item, val: string) =>
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === i ? { ...item, [field]: field === 'productId' ? val : parseFloat(val) || 0 } : item,
      ),
    );

  const total = items.reduce((s, it) => s + it.price * it.quantity, 0);

  const submit = async () => {
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const order = await createOrder({ userId, items, totalAmount: total });
      setResult(order);
    } catch {
      setError('Failed to place order. Is the order service running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Place Order</h2>

      <label style={styles.label}>Customer ID</label>
      <input style={styles.input} value={userId} onChange={(e) => setUserId(e.target.value)} />

      <div style={styles.itemsHeader}>
        <span style={styles.label}>Items</span>
        <button style={styles.btnSmall} onClick={addItem}>+ Add Item</button>
      </div>

      {items.map((item, i) => (
        <div key={i} style={styles.itemRow}>
          <input
            style={{ ...styles.input, flex: 2 }}
            value={item.productId}
            onChange={(e) => updateItem(i, 'productId', e.target.value)}
            placeholder="Product ID"
          />
          <input
            style={{ ...styles.input, flex: 1 }}
            type="number"
            min={1}
            value={item.quantity}
            onChange={(e) => updateItem(i, 'quantity', e.target.value)}
            placeholder="Qty"
          />
          <input
            style={{ ...styles.input, flex: 1 }}
            type="number"
            min={0}
            step={0.01}
            value={item.price}
            onChange={(e) => updateItem(i, 'price', e.target.value)}
            placeholder="Price"
          />
          {items.length > 1 && (
            <button style={styles.btnDanger} onClick={() => removeItem(i)}>✕</button>
          )}
        </div>
      ))}

      <div style={styles.total}>Total: <strong>${total.toFixed(2)}</strong></div>

      <button style={styles.btn} onClick={submit} disabled={loading || !userId || items.length === 0}>
        {loading ? 'Placing…' : 'Place Order'}
      </button>

      {error && <div style={styles.error}>{error}</div>}

      {result && (
        <div style={styles.success}>
          <div>Order placed!</div>
          <div style={styles.mono}>ID: {result.orderId}</div>
          <div>Status: <StatusBadge status={result.status} /></div>
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: '#6c757d',
    PAID: '#0d6efd',
    PREPARING: '#fd7e14',
    SHIPPED: '#0dcaf0',
    DELIVERED: '#198754',
    PAYMENT_FAILED: '#dc3545',
    payment_failed: '#dc3545',
  };
  return (
    <span
      style={{
        background: colors[status] ?? '#6c757d',
        color: '#fff',
        borderRadius: 4,
        padding: '2px 8px',
        fontSize: 12,
        fontWeight: 600,
      }}
    >
      {status}
    </span>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { maxWidth: 600, margin: '0 auto', padding: 24 },
  heading: { marginBottom: 20, fontSize: 22 },
  label: { display: 'block', marginBottom: 4, fontWeight: 600, fontSize: 13, color: '#555' },
  input: {
    border: '1px solid #ddd',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 14,
    width: '100%',
    boxSizing: 'border-box',
    marginBottom: 12,
  },
  itemsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemRow: { display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' },
  total: { textAlign: 'right', marginBottom: 16, fontSize: 16 },
  btn: {
    background: '#0d6efd',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '10px 24px',
    fontSize: 15,
    cursor: 'pointer',
    width: '100%',
  },
  btnSmall: {
    background: '#0d6efd',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '4px 10px',
    fontSize: 12,
    cursor: 'pointer',
  },
  btnDanger: {
    background: '#dc3545',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    padding: '4px 10px',
    cursor: 'pointer',
  },
  error: { marginTop: 12, background: '#fff3f3', border: '1px solid #f5c2c7', borderRadius: 6, padding: 12, color: '#842029' },
  success: { marginTop: 12, background: '#d1e7dd', border: '1px solid #a3cfbb', borderRadius: 6, padding: 12, color: '#0f5132' },
  mono: { fontFamily: 'monospace', fontSize: 12 },
};
