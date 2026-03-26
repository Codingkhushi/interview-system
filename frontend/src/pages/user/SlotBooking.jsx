import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardShell from '../../components/layout/DashboardShell';
import { Card } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import api from '../../lib/api';
import { format, addDays, startOfToday } from 'date-fns';
import styles from './SlotBooking.module.css';

const NAV = [
  { to: '/dashboard',         icon: '◈', label: 'My application' },
  { to: '/dashboard/slots',   icon: '◷', label: 'Book interview'  },
  { to: '/dashboard/profile', icon: '◉', label: 'My profile'      },
];

export default function SlotBooking() {
  const [slotsByDate, setSlotsByDate] = useState({});
  const [selected,    setSelected]    = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [booking,     setBooking]     = useState(false);
  const [error,       setError]       = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const from = format(startOfToday(), 'yyyy-MM-dd');
    const to   = format(addDays(startOfToday(), 14), 'yyyy-MM-dd');
    api.get(`/user/slots?from=${from}&to=${to}`)
      .then(({ data }) => setSlotsByDate(data.slots))
      .catch(() => setError('Failed to load slots'))
      .finally(() => setLoading(false));
  }, []);

  const handleBook = async () => {
    if (!selected) return;
    setBooking(true); setError('');
    try {
      await api.post('/user/bookings', { slotId: selected.id });
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Booking failed. Please try again.');
      setBooking(false);
    }
  };

  const dates = Object.keys(slotsByDate).sort();

  return (
    <DashboardShell links={NAV} role="user">
      <div className={styles.page}>
        <div className={styles.header}>
          <p className="label-caps">Schedule</p>
          <h1 className={`display-lg ${styles.title}`}>Choose your slot</h1>
          <p className={styles.sub}>
            Select a 30-minute window that works for you. All times shown in your local timezone.
          </p>
        </div>

        {loading && <div className={styles.spinner} />}

        {!loading && dates.length === 0 && (
          <Card className={styles.emptyCard}>
            <p className={styles.emptyTitle}>No slots available right now</p>
            <p className={styles.emptyText}>Check back soon — our team regularly adds new availability.</p>
          </Card>
        )}

        {/* Date groups */}
        {dates.map(date => (
          <div key={date} className={styles.dateGroup}>
            <h3 className={styles.dateLabel}>
              {format(new Date(date + 'T00:00:00'), 'EEEE, MMMM d')}
            </h3>
            <div className={styles.slotsGrid}>
              {slotsByDate[date].map(slot => (
                <button
                  key={slot.id}
                  className={`${styles.slotChip} ${selected?.id === slot.id ? styles.selectedChip : ''}`}
                  onClick={() => setSelected(slot)}
                >
                  <span className={styles.slotTime}>
                    {format(new Date(slot.slot_start), 'h:mm a')}
                  </span>
                  <span className={styles.slotWith}>
                    {slot.interviewer_name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}

        {/* Booking confirmation strip */}
        {selected && (
          <div className={styles.confirmStrip}>
            <div className={styles.confirmInfo}>
              <span className={styles.confirmDate}>
                {format(new Date(selected.slot_start), 'EEE, MMM d')}
              </span>
              <span className={styles.confirmTime}>
                {format(new Date(selected.slot_start), 'h:mm a')} — {format(new Date(selected.slot_end), 'h:mm a')}
              </span>
              <span className={styles.confirmWith}>
                with {selected.interviewer_name}
              </span>
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.confirmActions}>
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                Clear
              </Button>
              <Button size="md" loading={booking} onClick={handleBook}>
                Confirm booking
              </Button>
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
