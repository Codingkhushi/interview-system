import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

import Landing          from './pages/auth/Landing';
import AuthCallback     from './pages/auth/AuthCallback';
import InterviewerLogin from './pages/auth/InterviewerLogin';
import ChangePassword   from './pages/auth/ChangePassword';

import UserDashboard from './pages/user/UserDashboard';
import SlotBooking   from './pages/user/SlotBooking';
import UserProfile   from './pages/user/UserProfile';

import InterviewerDashboard from './pages/interviewer/InterviewerDashboard';
import AvailabilityManager  from './pages/interviewer/AvailabilityManager';

import AdminDashboard from './pages/admin/AdminDashboard';
import AdminTeam      from './pages/admin/AdminTeam';

function Spinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'var(--plum)' }}>
      <div style={{ width: 32, height: 32, border: '2px solid var(--gold)',
        borderTopColor: 'transparent', borderRadius: '50%',
        animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function RequireAuth({ children, role }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user)   return <Navigate to="/" replace />;
  if (role && user.role !== role) {
    if (user.role === 'admin')       return <Navigate to="/admin" replace />;
    if (user.role === 'interviewer') return <Navigate to="/interviewer" replace />;
    return <Navigate to="/dashboard" replace />;
  }
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"                            element={<Landing />} />
        <Route path="/auth/callback"               element={<AuthCallback />} />
        <Route path="/interviewer/login"           element={<InterviewerLogin />} />
        <Route path="/interviewer/change-password" element={<RequireAuth role="interviewer"><ChangePassword /></RequireAuth>} />

        <Route path="/dashboard"         element={<RequireAuth role="user"><UserDashboard /></RequireAuth>} />
        <Route path="/dashboard/slots"   element={<RequireAuth role="user"><SlotBooking /></RequireAuth>} />
        <Route path="/dashboard/profile" element={<RequireAuth role="user"><UserProfile /></RequireAuth>} />

        <Route path="/interviewer"              element={<RequireAuth role="interviewer"><InterviewerDashboard /></RequireAuth>} />
        <Route path="/interviewer/availability" element={<RequireAuth role="interviewer"><AvailabilityManager /></RequireAuth>} />
        <Route path="/interviewer/interviews"   element={<RequireAuth role="interviewer"><InterviewerDashboard /></RequireAuth>} />

        <Route path="/admin"              element={<RequireAuth role="admin"><AdminDashboard /></RequireAuth>} />
        <Route path="/admin/interviewers" element={<RequireAuth role="admin"><AdminTeam /></RequireAuth>} />
        <Route path="/admin/interviews"   element={<RequireAuth role="admin"><AdminDashboard /></RequireAuth>} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
