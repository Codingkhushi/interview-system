import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import Button from '../../components/ui/Button';
import Input  from '../../components/ui/Input';
import styles from './InterviewerLogin.module.css';

export default function ChangePassword() {
  const [current,  setCurrent]  = useState('');
  const [next,     setNext]     = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (next !== confirm) { setError('Passwords do not match'); return; }
    if (next.length < 8)  { setError('Password must be at least 8 characters'); return; }
    setError(''); setLoading(true);

    try {
      await api.post('/auth/change-password', { currentPassword: current, newPassword: next });
      navigate('/interviewer');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${styles.page} grain`}>
      <div className={styles.petal} aria-hidden />
      <div className={styles.card}>
        <div className={styles.logoRow}>
          <div className={styles.logoMark}>W</div>
          <span className={styles.logoName}>Wingmann</span>
        </div>
        <h1 className={styles.title}>Set your password</h1>
        <p className={styles.sub}>
          Your account was created by an admin. Choose a permanent password to continue.
        </p>
        <form className={styles.form} onSubmit={handleSubmit}>
          <Input label="Temporary password"   type="password" value={current} onChange={e => setCurrent(e.target.value)}  placeholder="••••••••" required />
          <Input label="New password"         type="password" value={next}    onChange={e => setNext(e.target.value)}     placeholder="Min. 8 characters" required />
          <Input label="Confirm new password" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}  placeholder="••••••••" required />
          {error && <p className={styles.error}>{error}</p>}
          <Button type="submit" size="lg" loading={loading} style={{ width: '100%' }}>
            Set password & continue
          </Button>
        </form>
      </div>
    </div>
  );
}
