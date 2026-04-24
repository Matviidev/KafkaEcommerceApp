import { useEffect, useRef, useState } from 'react';
import { search, type SearchResult } from '../api';
import { StatusBadge } from './OrderForm';

const STATUSES = ['', 'PENDING', 'PAID', 'PREPARING', 'SHIPPED', 'DELIVERED', 'payment_failed'];

export default function SearchPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const doSearch = async (overridePage = page) => {
    setLoading(true);
    try {
      const r = await search({ q: q || undefined, status: status || undefined, from: from || undefined, to: to || undefined, page: overridePage });
      setResult(r);
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(1);
      doSearch(1);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, status, from, to]);

  const goPage = (p: number) => {
    setPage(p);
    doSearch(p);
  };

  const totalPages = result ? Math.ceil(result.total / 10) : 0;

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Search Orders</h2>

      <div style={styles.filters}>
        <input
          style={{ ...styles.input, flex: 3 }}
          placeholder="Search by order ID, customer, product…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select style={{ ...styles.input, flex: 1 }} value={status} onChange={(e) => setStatus(e.target.value)}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s || 'All statuses'}</option>
          ))}
        </select>
        <input
          style={{ ...styles.input, flex: 1 }}
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          placeholder="From"
        />
        <input
          style={{ ...styles.input, flex: 1 }}
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="To"
        />
      </div>

      {loading && <div style={styles.info}>Searching…</div>}

      {!loading && result && (
        <>
          <div style={styles.count}>{result.total} result{result.total !== 1 ? 's' : ''}</div>
          {result.hits.length === 0 ? (
            <div style={styles.info}>No orders found.</div>
          ) : (
            result.hits.map((hit) => (
              <div key={hit.orderId} style={styles.card}>
                <div style={styles.cardHeader}>
                  <span style={styles.orderId}>{hit.orderId}</span>
                  <StatusBadge status={hit.status} />
                </div>
                <div style={styles.cardMeta}>
                  <span>Customer: {hit.userId}</span>
                  <span>Amount: ${hit.totalAmount?.toFixed(2)}</span>
                  <span>Created: {hit.createdAt ? new Date(hit.createdAt).toLocaleString() : '—'}</span>
                  {hit.courier && <span>Courier: {hit.courier}</span>}
                </div>
                {hit.items && (
                  <div style={styles.items}>
                    {hit.items.map((item, i) => (
                      <span key={i} style={styles.tag}>
                        {item.productId} ×{item.quantity} @ ${item.price}
                      </span>
                    ))}
                  </div>
                )}
                {hit._highlight && Object.values(hit._highlight).map((frags, i) =>
                  frags.map((frag, j) => (
                    <div
                      key={`${i}-${j}`}
                      style={styles.highlight}
                      dangerouslySetInnerHTML={{ __html: frag }}
                    />
                  ))
                )}
              </div>
            ))
          )}

          {totalPages > 1 && (
            <div style={styles.pagination}>
              <button style={styles.pageBtn} disabled={page <= 1} onClick={() => goPage(page - 1)}>‹ Prev</button>
              <span style={styles.pageInfo}>Page {page} / {totalPages}</span>
              <button style={styles.pageBtn} disabled={page >= totalPages} onClick={() => goPage(page + 1)}>Next ›</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 24 },
  heading: { margin: '0 0 16px 0', fontSize: 22 },
  filters: { display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' },
  input: {
    border: '1px solid #ddd',
    borderRadius: 6,
    padding: '8px 12px',
    fontSize: 14,
    minWidth: 120,
    boxSizing: 'border-box',
  },
  info: { color: '#888', textAlign: 'center', padding: 24 },
  count: { color: '#555', fontSize: 13, marginBottom: 12 },
  card: {
    background: '#fff',
    border: '1px solid #e9ecef',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
  },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderId: { fontFamily: 'monospace', fontSize: 13, color: '#444' },
  cardMeta: { display: 'flex', gap: 16, fontSize: 13, color: '#666', flexWrap: 'wrap', marginBottom: 8 },
  items: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 },
  tag: { background: '#f0f0f0', borderRadius: 4, padding: '2px 8px', fontSize: 12 },
  highlight: {
    background: '#fff9c4',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: 12,
    color: '#555',
    borderLeft: '3px solid #ffc107',
    marginTop: 4,
  },
  pagination: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 20 },
  pageBtn: {
    background: '#0d6efd',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    padding: '6px 16px',
    cursor: 'pointer',
    fontSize: 14,
  },
  pageInfo: { color: '#555', fontSize: 14 },
};
