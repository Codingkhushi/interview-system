import { useEffect, useState } from 'react';
import DashboardShell from '../../components/layout/DashboardShell';
import { Card } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input  from '../../components/ui/Input';
import api from '../../lib/api';
import styles from './AdminTeam.module.css';

const NAV = [
  { to: '/admin',              icon: '◈', label: 'Overview'   },
  { to: '/admin/interviewers', icon: '◉', label: 'Team'       },
  { to: '/admin/interviews',   icon: '◷', label: 'Interviews' },
];

const GENDERS = ['Man', 'Woman', 'Non-binary', 'Other'];

export default function AdminTeam() {
  const [interviewers, setInterviewers] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [showForm,     setShowForm]     = useState(false);
  const [error,        setError]        = useState('');
  const [success,      setSuccess]      = useState('');

  const [name,   setName]   = useState('');
  const [email,  setEmail]  = useState('');
  const [age,    setAge]    = useState('');
  const [gender, setGender] = useState('');

  const fetchTeam = () => {
    api.get('/admin/interviewers')
      .then(({ data }) => setInterviewers(data.interviewers))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchTeam(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    setError(''); setSuccess(''); setSaving(true);
    try {
      await api.post('/admin/interviewers', { name, email, age: parseInt(age), gender });
      setSuccess(`Account created for ${name}. Credentials sent to ${email}.`);
      setName(''); setEmail(''); setAge(''); setGender('');
      setShowForm(false);
      fetchTeam();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create interviewer');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Deactivate ${name}? Their bookings will be marked for reassignment.`)) return;
    try {
      const { data } = await api.delete(`/admin/interviewers/${id}`);
      setSuccess(data.message);
      fetchTeam();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to deactivate');
    }
  };

  const handleResend = async (id) => {
    try {
      await api.post(`/admin/interviewers/${id}/resend-credentials`);
      setSuccess('New credentials sent');
    } catch (err) {
      setError('Failed to resend credentials');
    }
  };

  return (
    <DashboardShell links={NAV} role="admin" theme="light">
      <div className={styles.page}>
        <div className={styles.header}>
          <div>
            <p className="label-caps">Team</p>
            <h1 className={`display-lg ${styles.title}`}>Interviewers</h1>
          </div>
          <Button onClick={() => { setShowForm(f => !f); setError(''); setSuccess(''); }}>
            {showForm ? 'Cancel' : '+ Add interviewer'}
          </Button>
        </div>

        {/* Feedback messages */}
        {error   && <p className={styles.error}>{error}</p>}
        {success && <p className={styles.success}>{success}</p>}

        {/* Add form */}
        {showForm && (
          <Card className={styles.formCard}>
            <h2 className={styles.formTitle}>New interviewer</h2>
            <form className={styles.form} onSubmit={handleCreate}>
              <div className={styles.row}>
                <Input label="Full name" value={name}  onChange={e => setName(e.target.value)}  placeholder="Jane Smith" required />
                <Input label="Email"     value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="jane@wingmann.co" required />
              </div>
              <div className={styles.row}>
                <Input label="Age" type="number" min="18" max="70" value={age} onChange={e => setAge(e.target.value)} placeholder="28" required />
                <div className={styles.field}>
                  <label className={styles.label}>Gender</label>
                  <div className={styles.pillGroup}>
                    {GENDERS.map(g => (
                      <button key={g} type="button"
                        className={`${styles.pill} ${gender === g ? styles.pillActive : ''}`}
                        onClick={() => setGender(g)}
                      >{g}</button>
                    ))}
                  </div>
                </div>
              </div>
              <Button type="submit" loading={saving} disabled={!gender}>
                Create account & send credentials
              </Button>
            </form>
          </Card>
        )}

        {/* Interviewer list */}
        {loading && <div className={styles.spinner} />}
        <div className={styles.teamGrid}>
          {interviewers.map(iv => (
            <Card key={iv.id} className={`${styles.ivCard} ${!iv.is_active ? styles.inactive : ''}`}>
              <div className={styles.ivTop}>
                <div className={styles.avatar}>{iv.name[0]}</div>
                <div className={styles.ivInfo}>
                  <span className={styles.ivName}>{iv.name}</span>
                  <span className={styles.ivEmail}>{iv.email}</span>
                </div>
                {!iv.is_active && <span className={styles.inactiveBadge}>Inactive</span>}
              </div>

              <div className={styles.ivStats}>
                <div className={styles.stat}>
                  <span className={styles.statVal}>{iv.unbooked_hours}</span>
                  <span className={styles.statLbl}>hrs available</span>
                </div>
                <div className={styles.stat}>
                  <span className={styles.statVal}>{iv.interviews_completed}</span>
                  <span className={styles.statLbl}>completed</span>
                </div>
              </div>

              {iv.is_active && (
                <div className={styles.ivActions}>
                  <Button variant="ghost" size="sm" onClick={() => handleResend(iv.id)}>
                    Resend login
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(iv.id, iv.name)}>
                    Deactivate
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      </div>
    </DashboardShell>
  );
}
