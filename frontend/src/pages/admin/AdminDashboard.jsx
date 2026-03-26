import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import { Card, StatusPill } from '../../components/ui/Card';
import StatCard from '../../components/ui/StatCard';
import Button from '../../components/ui/Button';
import Input  from '../../components/ui/Input';
import api from '../../lib/api';
import { format } from 'date-fns';
import styles from './AdminDashboard.module.css';

const NAV = [
  { to: '/admin',             icon: '◈', label: 'Overview'     },
  { to: '/admin/interviewers', icon: '◉', label: 'Team'         },
  { to: '/admin/interviews',  icon: '◷', label: 'Interviews'   },
];

export default function AdminDashboard() {
  const [interviewers, setInterviewers] = useState([]);
  const [interviews,   setInterviews]   = useState([]);
  const [loading,      setLoading]      = useState(true);

  const fetchAll = () => {
    Promise.all([
      api.get('/admin/interviewers'),
      api.get('/admin/interviews'),
    ]).then(([iv, i]) => {
      setInterviewers(iv.data.interviewers);
      setInterviews(i.data.interviews);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const totalBooked    = interviews.filter(i => i.booking_status !== 'cancelled').length;
  const totalPending   = interviews.filter(i => i.outcome === 'pending').length;
  const totalAccepted  = interviews.filter(i => i.outcome === 'accepted').length;

  if (loading) return (
    <DashboardShell links={NAV} role="admin" theme="light">
      <div className={styles.spinner} />
    </DashboardShell>
  );

  return (
    <DashboardShell links={NAV} role="admin" theme="light">
      <div className={styles.page}>
        <div className={styles.header}>
          <p className="label-caps">Admin</p>
          <h1 className={`display-lg ${styles.title}`}>Platform overview</h1>
        </div>

        {/* Summary stats */}
        <div className={styles.statsGrid}>
          <StatCard accent label="Interviewers" value={interviewers.filter(i => i.is_active).length} sub="active" />
          <StatCard label="Total interviews"   value={totalBooked}   sub="scheduled" />
          <StatCard label="Awaiting decision"  value={totalPending}  sub="pending outcome" />
          <StatCard label="Accepted"           value={totalAccepted} sub="into Wingmann" />
        </div>

        {/* Interview monitoring table */}
        <section>
          <h2 className={styles.sectionTitle}>All interviews</h2>
          {interviews.length === 0
            ? <p className={styles.empty}>No interviews scheduled yet.</p>
            : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Interviewer</th>
                      <th>Date & time</th>
                      <th>Status</th>
                      <th>Outcome</th>
                    </tr>
                  </thead>
                  <tbody>
                    {interviews.map(iv => (
                      <tr key={iv.id}>
                        <td>
                          <div className={styles.cellPrimary}>{iv.user_name}</div>
                          <div className={styles.cellSub}>{iv.user_city}</div>
                        </td>
                        <td>
                          <div className={styles.cellPrimary}>{iv.interviewer_name}</div>
                        </td>
                        <td>
                          <div className={styles.cellPrimary}>
                            {format(new Date(iv.slot_start), 'MMM d, yyyy')}
                          </div>
                          <div className={styles.cellSub}>
                            {format(new Date(iv.slot_start), 'h:mm a')}
                          </div>
                        </td>
                        <td><StatusPill status={iv.booking_status} /></td>
                        <td><StatusPill status={iv.outcome} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </section>
      </div>
    </DashboardShell>
  );
}
