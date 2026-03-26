import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function AuthCallback() {
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const { setTokenFromCallback, fetchMe } = useAuth();

  useEffect(() => {
    const token        = params.get('token');
    const needsProfile = params.get('needsProfile') === 'true';

    if (!token) { navigate('/'); return; }

    setTokenFromCallback(token);

    fetchMe().then((user) => {
      if (!user) { navigate('/'); return; }
      if (needsProfile)            navigate('/dashboard/profile');
      else if (user.role === 'admin') navigate('/admin');
      else                         navigate('/dashboard');
    });
  }, []);  // eslint-disable-line

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--plum)',
    }}>
      <div style={{ textAlign: 'center', color: 'var(--cream)' }}>
        <div style={{
          width: 32, height: 32, border: '2px solid var(--gold)',
          borderTopColor: 'transparent', borderRadius: '50%',
          animation: 'spin 0.7s linear infinite', margin: '0 auto 16px',
        }} />
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          Signing you in…
        </p>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
