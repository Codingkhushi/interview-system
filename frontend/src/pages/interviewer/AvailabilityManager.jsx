import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Button from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import Input from '../../components/ui/Input';
import api from '../../lib/api';
import styles from './AvailabilityManager.module.css';

const NAV = [
  { to: '/interviewer', icon: '◈', label: 'Overview' },
  { to: '/interviewer/availability', icon: '◷', label: 'Availability' },
  { to: '/interviewer/interviews', icon: '◉', label: 'Interviews' },
];

export default function AvailabilityManager() {
  const [availability, setAvailability] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const today = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  const fetchAvailability = () => {
    setLoading(true);
    api.get('/interviewer/availability')
      .then(({ data }) => {
        console.log('[DEBUG] availability response:', data.availability);
        setAvailability(data.availability || []);
      })
      .catch(err => {
        console.error('[DEBUG] availability fetch error:', err.response?.data || err.message);
        setError('Failed to load availability');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAvailability(); }, []);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (endTime <= startTime) {
      setError('End time must be after start time');
      return;
    }
    setError(''); setSuccess(''); setSaving(true);
    try {
      const { data } = await api.post('/interviewer/availability', { date, startTime, endTime });
      setSuccess(`Added — ${data.slots_created} slot(s) created`);
      setDate(''); setStartTime(''); setEndTime('');
      fetchAvailability();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save availability');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Remove this availability range? Unbooked slots will be deleted.')) return;
    try {
      await api.delete(`/interviewer/availability/${id}`);
      fetchAvailability();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete');
    }
  };

  // Safely format a date string like "2026-03-27" without timezone shift
  const formatDate = (dateStr) => {
    try {
      // Extract YYYY-MM-DD from either '2026-03-26' or '2026-03-25T18:30:00.000Z'
      const datePart = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
      const [y, m, d] = datePart.split('-').map(Number);
      return format(new Date(y, m - 1, d), 'EEE, MMM d');
    } catch {
      return dateStr;
    }
  };

  // Safely format time string "10:00:00" → "10:00"
  const formatTime = (timeStr) => {
    if (!timeStr) return '';
    return String(timeStr).slice(0, 5);
  };

  return (
    <DashboardShell links={NAV} role="interviewer">
      <div className={styles.page}>
        <div className={styles.header}>
          <p className="label-caps">Schedule</p>
          <h1 className={`display-lg ${styles.title}`}>Manage availability</h1>
          <p className={styles.sub}>
            Set the windows when you're available. Each window is split into 30-minute slots automatically.
          </p>
        </div>

        {/* Add form */}
        <Card>
          <h2 className={styles.formTitle}>Add availability</h2>
          <form className={styles.form} onSubmit={handleAdd}>
            <Input label="Date" type="date" value={date} min={today}
              onChange={e => setDate(e.target.value)} required />
            <Input label="From" type="time" value={startTime}
              onChange={e => setStartTime(e.target.value)} required />
            <Input label="To" type="time" value={endTime}
              onChange={e => setEndTime(e.target.value)} required />
            <Button type="submit" loading={saving} size="md">
              Add slots
            </Button>
          </form>
          {error && <p className={styles.error}>{error}</p>}
          {success && <p className={styles.success}>{success}</p>}
        </Card>

        {/* Existing ranges */}
        <section>
          <h2 className={styles.sectionTitle}>
            Your windows {!loading && `(${availability.length})`}
          </h2>

          {loading && <div className={styles.spinner} />}

          {!loading && availability.length === 0 && (
            <p className={styles.empty}>No availability set yet. Add your first window above.</p>
          )}

          <div className={styles.rangeList}>
            {availability.map(a => {
              const totalSlots = parseInt(a.total_slots) || 0;
              const availSlots = parseInt(a.available_slots) || 0;
              const bookedSlots = parseInt(a.booked_slots) || 0;

              return (
                <div key={a.id} className={styles.rangeRow}>
                  <div className={styles.rangeInfo}>
                    <span className={styles.rangeDate}>
                      {formatDate(a.date)}
                    </span>
                    <span className={styles.rangeTime}>
                      {formatTime(a.start_time)} — {formatTime(a.end_time)}
                    </span>
                  </div>
                  <div className={styles.rangeStats}>
                    <span className={styles.slotCount}>
                      {availSlots} / {totalSlots} open
                    </span>
                    {bookedSlots > 0 && (
                      <span className={styles.bookedBadge}>{bookedSlots} booked</span>
                    )}
                  </div>
                  <button
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(a.id)}
                    title="Remove availability"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </DashboardShell>
  );
}
