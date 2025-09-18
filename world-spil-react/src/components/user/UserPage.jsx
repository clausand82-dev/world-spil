import React from 'react';
import UserProfileCard from './UserProfileCard.jsx';
import UserStats from './UserStats.jsx';

export default function UserPage() {
  return (
    <div id="user-page" style={{display:'grid', gridTemplateColumns:'1fr', gap:16}}>
      <UserProfileCard />
      <UserStats />
    </div>


                      

  );


}