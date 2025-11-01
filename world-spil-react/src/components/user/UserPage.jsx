import React from 'react'
import UserProfileCard from './UserProfileCard.jsx'
import UserStatsTabs from './UserStatsTabs.jsx'
import UserAchievementsBox from './UserAchievementsBox.jsx'
import './UserPage.css'

/**
 * UserPage - refactor af layout
 * - Flytter achievements ind i sidebar under brugerinfo (UserAchievementsBox)
 * - Fjerner activity-tab (handled i UserStatsTabs)
 * - Holder .page og .panel så tema/ globale styles bevares
 */
export default function UserPage() {
  return (
    <div id="user-page" className="page user-page">
      <header className="section-head userpage-header">
        <div className="userpage-title">
          <h1>Brugerprofil</h1>
          <div className="sub">Oversigt og statistik</div>
        </div>
      </header>

      <main className="userpage-grid">
        <aside className="panel userpage-sidebar" aria-label="Bruger kort">
          <UserProfileCard />
          <UserAchievementsBox />
        </aside>

        <section className="panel userpage-main" aria-label="Bruger statistik og faner">
          <UserStatsTabs />
        </section>
      </main>
    </div>
  )
}