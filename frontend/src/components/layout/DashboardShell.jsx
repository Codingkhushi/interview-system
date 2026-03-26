import Sidebar from './Sidebar';
import styles from './DashboardShell.module.css';

export default function DashboardShell({ children, links, role, theme = 'dark' }) {
  return (
    <div className={styles.shell} data-theme={theme}>
      <Sidebar links={links} role={role} />
      <main className={`${styles.main} page-enter`}>
        {children}
      </main>
    </div>
  );
}
