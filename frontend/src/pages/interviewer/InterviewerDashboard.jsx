import { format } from 'date-fns';
import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import Button from '../../components/ui/Button';
import { Card, StatusPill } from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import api from '../../lib/api';
import styles from './InterviewerDashboard.module.css';

const NAV = [
  { to: '/interviewer', icon: '◈', label: 'Overview' },
  { to: '/interviewer/availability', icon: '◷', label: 'Availability' },
  { to: '/interviewer/interviews', icon: '◉', label: 'Interviews' },
];

export default function InterviewerDashboard() {
  const [stats, setStats] = useState(null);
  const [interviews, setInterviews] = useState({ upcoming: [], completed: [] });
  const [loading, setLoading] = useState(true);
  const [deciding, setDeciding] = useState(null);
  const [feedback, setFeedback] = useState('');

  const fetchAll = () => {
    Promise.all([
      api.get('/interviewer/stats'),
      api.get('/interviewer/interviews'),
    ]).then(([s, i]) => {
      setStats(s.data.stats);
      setInterviews(i.data);
    }).catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const handleDecide = async (interviewId, outcome) => {
    setDeciding(interviewId);
    setFeedback('');
    try {
      await api.post(`/interviewer/interviews/${interviewId}/decide`, { outcome });
      setFeedback(`Decision recorded: ${outcome}`);
      fetchAll();
    } catch (err) {
      setFeedback(err.response?.data?.error || 'Failed to record decision');
    } finally {
      setDeciding(null);
    }
  };

  // All interviews with pending outcome — show decide buttons regardless of time
  // (In production you'd gate on isPast, but for testing we show always)
  const pendingDecision = [
    ...interviews.upcoming,
    ...interviews.completed,
  ].filter(iv => iv.outcome === 'pending');

  const upcomingFuture = interviews.upcoming.filter(iv => iv.outcome === 'pending');

  if (loading) return (
    <DashboardShell links={NAV} role="interviewer">
      <div className={styles.spinner} />
    </DashboardShell>
  );

  return (
    <DashboardShell links={NAV} role="interviewer">
      <div className={styles.page}>
        <div className={styles.header}>
          <p className="label-caps">Dashboard</p>
          <h1 className={`display-lg ${styles.title}`}>Your overview</h1>
        </div>

        {/* Stats */}
        <div className={styles.statsGrid}>
          <StatCard accent label="Unbooked hours" value={stats?.unbooked_hours_total ?? '—'} sub="remaining" />
          <StatCard label="This week" value={stats?.unbooked_hours_this_week ?? '—'} sub="available hours" />
          <StatCard label="This month" value={stats?.unbooked_hours_this_month ?? '—'} sub="available hours" />
          <StatCard label="Completed" value={stats?.interviews_completed ?? '—'} sub={stats?.acceptance_rate_pct ? `${stats.acceptance_rate_pct}% acceptance` : 'no decisions yet'} />
        </div>

        {feedback && (
          <p className={feedback.includes('recorded') ? styles.successMsg : styles.errorMsg}>
            {feedback}
          </p>
        )}

        {/* Needs decision */}
        {pendingDecision.length > 0 && (
          <section>
            <h2 className={styles.sectionTitle}>Awaiting your decision</h2>
            <div className={styles.interviewList}>
              {pendingDecision.map(iv => (
                <Card key={iv.id} className={styles.interviewCard}>
                  <div className={styles.cardTop}>
                    <div>
                      <div className={styles.userName}>{iv.user_name}</div>
                      <div className={styles.userMeta}>
                        {iv.user_age} · {iv.user_gender} · {iv.user_city}
                      </div>
                    </div>
                    <div className={styles.slotInfo}>
                      <span className={styles.slotDate}>
                        {format(new Date(iv.slot_start), 'EEE, MMM d')}
                      </span>
                      <span className={styles.slotTime}>
                        {format(new Date(iv.slot_start), 'h:mm a')}
                      </span>
                    </div>
                  </div>

                  <div className={styles.decideRow}>
                    <span className={styles.decideLabel}>Record your decision:</span>
                    <Button
                      variant="secondary" size="sm"
                      loading={deciding === iv.id}
                      onClick={() => handleDecide(iv.id, 'accepted')}
                    >
                      ✓ Accept
                    </Button>
                    <Button
                      variant="danger" size="sm"
                      loading={deciding === iv.id}
                      onClick={() => handleDecide(iv.id, 'rejected')}
                    >
                      ✕ Reject
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Upcoming (future, already decided or not yet due) */}
        {upcomingFuture.length === 0 && pendingDecision.length === 0 && (
          <section>
            <h2 className={styles.sectionTitle}>Upcoming interviews</h2>
            <p className={styles.empty}>No upcoming interviews scheduled.</p>
          </section>
        )}

        {/* Completed */}
        {interviews.completed.length > 0 && (
          <section>
            <h2 className={styles.sectionTitle}>Recent completed</h2>
            <div className={styles.completedList}>
              {interviews.completed.slice(0, 8).map(iv => (
                <div key={iv.id} className={styles.completedRow}>
                  <span className={styles.completedName}>{iv.user_name}</span>
                  <span className={styles.completedDate}>
                    {format(new Date(iv.slot_start), 'MMM d')}
                  </span>
                  <StatusPill status={iv.outcome} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </DashboardShell>
  );
}
