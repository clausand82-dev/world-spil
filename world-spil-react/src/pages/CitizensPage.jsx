import React from 'react';
import { useGameData } from '../context/GameDataContext.jsx';
import TabsTemplatePage from './TabTemplatePage.jsx';
import PopulationTickPage from './PopulationTickPage.jsx';
import CitizenAssignmentsPage from './CitizensAssignmentsPage.jsx';

export default function MyCitizensHub() {
  const { data } = useGameData();
  const playerStage = Number(data?.state?.user?.currentstage ?? 0);

  // Hardcoded stage-krav pr. tab
  const tabs = [
    { key: 'assignments',   label: 'Borger tildeling', icon: '🧭', Component: CitizenAssignmentsPage, minStage: 2 }, // skal være 3
    { key: 'reppopulation', label: 'Borger status',    icon: '📊', Component: PopulationTickPage,    minStage: 2 },
  ];

  const visibleTabs = tabs.filter(t => playerStage >= (t.minStage || 0));
  const defaultKey = visibleTabs[0]?.key || tabs[0].key;

  return <TabsTemplatePage tabs={visibleTabs} defaultKey={defaultKey} preserve={false} className="my-tabs" />;
}