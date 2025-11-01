import React from 'react';
import UserProfileCard from './UserProfileCard.jsx';
import UserStatsTabs from './UserStatsTabs.jsx';

export default function UserPage() {
  return (
    <div id="user-page" className="page" style={{ padding: 20 }}>
      <header className="section-head" style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: '0 0 auto' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Brugerprofil</h1>
          <div className="sub" style={{ color: 'var(--muted-color, #666)' }}>Oversigt og statistik</div>
        </div>
      </header>

      <main style={{
        display: 'grid',
        gridTemplateColumns: '320px 1fr',
        gap: 16,
        alignItems: 'start',
      }}>
        <div className="panel" style={{ padding: 12 }}>
          <UserProfileCard />
        </div>

        <div className="panel" style={{ padding: 12 }}>
          <UserStatsTabs />
        </div>
      </main>
    </div>
  );
}