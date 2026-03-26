import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Button from '../../components/ui/Button';
import Input  from '../../components/ui/Input';
import styles from './InterviewerLogin.module.css';

export default function InterviewerLogin() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const { login } = useAuth();
  const navigate  = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await login(email, password);
      if (user.force_pw_change) navigate('/interviewer/change-password');
      else if (user.role === 'admin') navigate('/admin');
      else navigate('/interviewer');
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${styles.page} grain`}>
      <div className={styles.petal} aria-hidden />

      <div className={styles.card}>
        <Link to="/" className={styles.back}>← Back</Link>

        <div className={styles.logoRow}>
          <div className={styles.logoMark}>W</div>
          <span className={styles.logoName}>Wingmann</span>
        </div>

        <h1 className={styles.title}>Team sign in</h1>
        <p className={styles.sub}>For interviewers and administrators only.</p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="you@wingmann.co"
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          {error && <p className={styles.error}>{error}</p>}
          <Button type="submit" size="lg" loading={loading} style={{ width: '100%' }}>
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
