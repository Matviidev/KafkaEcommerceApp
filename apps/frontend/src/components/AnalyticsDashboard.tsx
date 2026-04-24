import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { getStats, type AnalyticsStats } from '../api';

interface HistoryPoint {
  time: string;
  ordersCount: number;
  totalRevenue: number;
}

export default function AnalyticsDashboard() {
  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const s = await getStats();
      setStats(s);
      setHistory((prev) => [
        ...prev.slice(-29),
        { time: new Date().toLocaleTimeString(), ordersCount: s.ordersCount, totalRevenue: s.totalRevenue },
      ]);
      setError('');
    } catch {
      setError('Analytics service not available');
    }
  };

  useEffect(() => {
    load();
    const id = setInterval(load, 10_000);
    return () => clearInterval(id);
  }, []);

  const pieData = stats
    ? [
        { name: 'Success', value: Math.round(stats.successRate * 100) },
        { name: 'Failed', value: Math.round((1 - stats.successRate) * 100) },
      ]
    : [];

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Analytics Dashboard</h2>
      <div style={styles.subtitle}>Last 60-second sliding window · refreshes every 10s</div>

      {error && <div style={styles.error}>{error}</div>}

      <div style={styles.counters}>
        <StatCard label="Orders / min" value={stats?.ordersCount ?? '—'} color="#0d6efd" />
        <StatCard label="Revenue" value={stats ? `$${stats.totalRevenue.toFixed(2)}` : '—'} color="#198754" />
        <StatCard
          label="Failed Payments"
          value={stats ? `${Math.round((1 - stats.successRate) * 100)}%` : '—'}
          color="#dc3545"
        />
        <StatCard label="Avg Processing" value={stats ? `${stats.avgProcessingMs}ms` : '—'} color="#6f42c1" />
      </div>

      <div style={styles.charts}>
        <div style={styles.chartBox}>
          <h3 style={styles.chartTitle}>Orders per Minute</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={history}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="ordersCount" stroke="#0d6efd" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={styles.chartBox}>
          <h3 style={styles.chartTitle}>Payment Success Rate</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => `${name} ${value}%`}>
                <Cell fill="#198754" />
                <Cell fill="#dc3545" />
              </Pie>
              <Legend />
              <Tooltip formatter={(v) => `${v}%`} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{ ...cardStyles.card, borderTopColor: color }}>
      <div style={cardStyles.value}>{value}</div>
      <div style={cardStyles.label}>{label}</div>
    </div>
  );
}

const cardStyles: Record<string, React.CSSProperties> = {
  card: {
    background: '#fff',
    border: '1px solid #e9ecef',
    borderTopWidth: 3,
    borderRadius: 8,
    padding: '16px 20px',
    flex: 1,
    minWidth: 120,
  },
  value: { fontSize: 28, fontWeight: 700, marginBottom: 4 },
  label: { fontSize: 12, color: '#666', textTransform: 'uppercase', letterSpacing: 0.5 },
};

const styles: Record<string, React.CSSProperties> = {
  container: { padding: 24 },
  heading: { margin: '0 0 4px 0', fontSize: 22 },
  subtitle: { color: '#888', fontSize: 13, marginBottom: 20 },
  error: { background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 6, padding: 12, marginBottom: 16, color: '#664d03' },
  counters: { display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' },
  charts: { display: 'flex', gap: 24, flexWrap: 'wrap' },
  chartBox: { flex: 1, minWidth: 300, background: '#fff', border: '1px solid #e9ecef', borderRadius: 8, padding: 16 },
  chartTitle: { margin: '0 0 12px 0', fontSize: 15, fontWeight: 600, color: '#444' },
};
