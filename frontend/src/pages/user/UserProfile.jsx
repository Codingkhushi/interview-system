import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import DashboardShell from '../../components/layout/DashboardShell';
import Button from '../../components/ui/Button';
import Input  from '../../components/ui/Input';
import api from '../../lib/api';
import styles from './UserProfile.module.css';

const NAV = [
  { to: '/dashboard',         icon: '◈', label: 'My application' },
  { to: '/dashboard/slots',   icon: '◷', label: 'Book interview'  },
  { to: '/dashboard/profile', icon: '◉', label: 'My profile'      },
];

const GENDERS = ['Man', 'Woman', 'Non-binary', 'Prefer not to say'];

export default function UserProfile() {
  const { user, fetchMe } = useAuth();
  const navigate          = useNavigate();

  const [name,    setName]    = useState(user?.name    || '');
  const [age,     setAge]     = useState(user?.age     || '');
  const [gender,  setGender]  = useState(user?.gender  || '');
  const [city,    setCity]    = useState(user?.city    || '');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      await api.post('/user/profile', { name, age: parseInt(age), gender, city });
      await fetchMe();
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardShell links={NAV} role="user">
      <div className={styles.page}>
        <div className={styles.header}>
          <p className="label-caps">Your details</p>
          <h1 className={`display-lg ${styles.title}`}>Complete your profile</h1>
          <p className={styles.sub}>
            This information helps our team understand you before the interview.
            It's not about impressing us — it's about being understood.
          </p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.row}>
            <Input label="Full name" value={name} onChange={e => setName(e.target.value)}
              placeholder="Your name" required />
            <Input label="Age" type="number" min="18" max="99" value={age}
              onChange={e => setAge(e.target.value)} placeholder="25" required />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Gender</label>
            <div className={styles.pillGroup}>
              {GENDERS.map(g => (
                <button
                  key={g} type="button"
                  className={`${styles.pill} ${gender === g ? styles.pillActive : ''}`}
                  onClick={() => setGender(g)}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <Input label="City" value={city} onChange={e => setCity(e.target.value)}
            placeholder="Mumbai, Delhi, Bangalore…" required />

          {error && <p className={styles.error}>{error}</p>}

          <Button type="submit" size="lg" loading={loading}
            disabled={!name || !age || !gender || !city}>
            Save and browse slots →
          </Button>
        </form>
      </div>
    </DashboardShell>
  );
}
