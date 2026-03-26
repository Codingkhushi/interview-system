import styles from './Card.module.css';

export function Card({ children, className = '', hover = false, ...props }) {
  return (
    <div
      className={`${styles.card} ${hover ? styles.hoverable : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({ children, variant = 'default' }) {
  return <span className={`${styles.badge} ${styles[`badge_${variant}`]}`}>{children}</span>;
}

// outcome: 'pending' | 'accepted' | 'rejected'
// status:  'available' | 'booked' | 'pending' | 'confirmed' | 'cancelled'
export function StatusPill({ status }) {
  const map = {
    available:  { label: 'Available',  cls: 'available'  },
    booked:     { label: 'Booked',     cls: 'booked'     },
    pending:    { label: 'Pending',    cls: 'pending'     },
    confirmed:  { label: 'Confirmed',  cls: 'confirmed'  },
    cancelled:  { label: 'Cancelled',  cls: 'cancelled'  },
    reassigned: { label: 'Reassigned', cls: 'pending'    },
    accepted:   { label: 'Accepted',   cls: 'confirmed'  },
    rejected:   { label: 'Rejected',   cls: 'cancelled'  },
  };
  const { label, cls } = map[status] || { label: status, cls: 'default' };
  return <span className={`${styles.pill} ${styles[`pill_${cls}`]}`}>{label}</span>;
}
