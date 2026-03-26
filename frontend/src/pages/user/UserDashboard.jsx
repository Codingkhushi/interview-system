import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import DashboardShell from '../../components/layout/DashboardShell';
import { Card, StatusPill } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import api from '../../lib/api';
import { format } from 'date-fns';
import styles from './UserDashboard.module.css';

const NAV = [
  { to: '/dashboard',         icon: '◈', label: 'My application' },
  { to: '/dashboard/slots',   icon: '◷', label: 'Book interview'  },
  { to: '/dashboard/profile', icon: '◉', label: 'My profile'      },
];

export default function UserDashboard() {
  const { user, socket }           = useAuth();
  const navigate                   = useNavigate();
  const [booking,  setBooking]     = useState(null);
  const [loading,  setLoading]     = useState(true);
  const pollRef                    = useRef(null);

  // Redirect to profile if not complete
  useEffect(() => {
    if (user && !user.profile_complete) {
      navigate('/dashboard/profile');
    }
  }, [user, navigate]);

  const fetchBooking = async () => {
    try {
      const { data } = await api.get('/user/booking');
      setBooking(data.booking);
      return data.booking;
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBooking(); }, []);

  // WebSocket: listen for outcome push
  // Re-runs whenever socket reference changes (e.g. after session restore)
  useEffect(() => {
    if (!socket) return;

    const handler = (payload) => {
      console.log('[Socket] interview:outcome received:', payload);
      setBooking(prev => prev
        ? { ...prev, outcome: payload.outcome, outcome_message: payload.message }
        : prev
      );
      // Clear any polling since we got the live event
      if (pollRef.current) clearInterval(pollRef.current);
    };

    socket.on('interview:outcome', handler);
    console.log('[Socket] registered interview:outcome listener');

    return () => {
      socket.off('interview:outcome', handler);
    };
  }, [socket]);

  // Fallback: poll every 5s while booking is pending (covers WebSocket miss)
  useEffect(() => {
    if (!booking || booking.outcome !== 'pending') return;

    pollRef.current = setInterval(async () => {
      const fresh = await fetchBooking();
      if (fresh?.outcome && fresh.outcome !== 'pending') {
        clearInterval(pollRef.current);
      }
    }, 5000);

    return () => clearInterval(pollRef.current);
  }, [booking?.outcome]);

  const isAccepted = booking?.outcome === 'accepted';
  const isRejected = booking?.outcome === 'rejected';
  const isPending  = !booking || booking.outcome === 'pending';

  return (
    <DashboardShell links={NAV} role="user">
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <p className="label-caps">Welcome back</p>
            <h1 className={`display-lg ${styles.greeting}`}>
              {user?.name?.split(' ')[0] || 'There'}
            </h1>
          </div>
          {booking && (
            <StatusPill status={
              booking.outcome !== 'pending' ? booking.outcome : booking.booking_status
            } />
          )}
        </div>

        {/* No booking */}
        {!loading && !booking && (
          <Card className={styles.emptyCard}>
            <div className={styles.emptyIcon}>◷</div>
            <h2 className={styles.emptyTitle}>Schedule your interview</h2>
            <p className={styles.emptyText}>
              To join Wingmann, you need to complete a short verification
              interview with one of our team members.
            </p>
            <Link to="/dashboard/slots">
              <Button>Browse available slots →</Button>
            </Link>
          </Card>
        )}

        {/* Accepted */}
        {isAccepted && (
          <Card className={styles.outcomeCard} style={{ borderColor: 'var(--gold)' }}>
            <div className={styles.outcomeIcon} style={{ background: 'rgba(201,150,58,0.15)', color: 'var(--gold-light)' }}>✦</div>
            <h2 className={`display-md ${styles.outcomeTitle}`}>
              {booking.outcome_message || 'Your profile has been accepted into Wingmann.'}
            </h2>
            {booking.decided_at && (
              <p className={styles.outcomeSub}>
                Decided on {format(new Date(booking.decided_at), 'MMMM d, yyyy')}
              </p>
            )}
          </Card>
        )}

        {/* Rejected */}
        {isRejected && (
          <Card className={styles.outcomeCard} style={{ borderColor: 'rgba(192,86,106,0.4)' }}>
            <div className={styles.outcomeIcon} style={{ background: 'var(--rose-light)', color: 'var(--rose)' }}>○</div>
            <h2 className={`display-md ${styles.outcomeTitle}`} style={{ color: 'var(--text-secondary)' }}>
              {booking.outcome_message || 'Your profile was not accepted at this time.'}
            </h2>
            <p className={styles.outcomeSub}>Thank you for your time. We wish you the best.</p>
          </Card>
        )}

        {/* Active booking */}
        {booking && isPending && (
          <div className={styles.bookingGrid}>
            <Card className={styles.bookingCard}>
              <p className="label-caps" style={{ marginBottom: 'var(--space-4)' }}>Your interview</p>
              <div className={styles.slotTime}>
                <span className={styles.slotDate}>
                  {format(new Date(booking.slot_start), 'EEEE, MMMM d')}
                </span>
                <span className={styles.slotHour}>
                  {format(new Date(booking.slot_start), 'h:mm a')} — {format(new Date(booking.slot_end), 'h:mm a')}
                </span>
              </div>
              <div className={styles.interviewerRow}>
                <div className={styles.avatar}>
                  {booking.interviewer_name?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className={styles.interviewerName}>{booking.interviewer_name}</p>
                  <p className={styles.interviewerRole}>Wingmann interviewer</p>
                </div>
              </div>
            </Card>

            <Card className={styles.infoCard}>
              <p className="label-caps" style={{ marginBottom: 'var(--space-4)' }}>What to expect</p>
              <ul className={styles.expectList}>
                <li>A 30-minute video/voice call</li>
                <li>Questions about your intentions and values</li>
                <li>A chance to ask us anything</li>
                <li>Decision communicated via this dashboard</li>
              </ul>
              {booking.booking_status === 'pending' && (
                <Button variant="ghost" size="sm"
                  style={{ marginTop: 'var(--space-4)' }}
                  onClick={() => {
                    if (confirm('Cancel your interview booking?')) {
                      api.delete(`/user/bookings/${booking.booking_id}`)
                        .then(() => setBooking(null))
                        .catch(e => alert(e.response?.data?.error || 'Cancellation failed'));
                    }
                  }}
                >
                  Cancel booking
                </Button>
              )}
            </Card>
          </div>
        )}

        {loading && <div className={styles.spinner} />}
      </div>
    </DashboardShell>
  );
}
