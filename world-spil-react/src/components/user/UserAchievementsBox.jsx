import React, { useMemo } from 'react'
import Achievements from './Achievements.jsx'
import { useGameData } from '../../context/GameDataContext.jsx'
import './UserPage.css'

/**
 * UserAchievementsBox
 * - Visning af achievements i sidebar under UserProfileCard
 * - Hvis der ikke er data, vises en lille placeholder
 */
export default function UserAchievementsBox() {
  const { data } = useGameData()

  const achievements = useMemo(
    () =>
      data?.achievements || [
        { id: 'a1', title: 'Velkommen', date: '2025-10-01', icon: '/assets/icons/medal_gold.png' }
      ],
    [data]
  )

  return (
    <div className="achievements-box" aria-label="Achievements">
      <div className="achievements-head">
        <strong>Achievements</strong>
      </div>
      <div className="achievements-body">
        <Achievements items={achievements} compact />
      </div>
    </div>
  )
}