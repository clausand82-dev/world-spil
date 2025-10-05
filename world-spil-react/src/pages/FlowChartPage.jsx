import React from 'react';
import TabsTemplatePage from './TabTemplatePage.jsx';
import TechTreePage from './OverviewPage.jsx';
import ResearchTreePage from './OverviewResearchPage.jsx';

export default function MyUnitsHub() {
  const tabs = [
    { key: 'research',   label: 'Research', icon: '🏥', Component: ResearchTreePage },
    { key: 'techtree', label: 'TechTree', icon: '🐄', Component: TechTreePage },
    
  ];

  return <TabsTemplatePage tabs={tabs} defaultKey="research" preserve={false} className="my-tabs" />;
}