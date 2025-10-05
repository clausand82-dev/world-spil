import React from 'react';
import TabsTemplatePage from './TabTemplatePage.jsx';
import TechTreePage from './OverviewPage.jsx';
import ResearchTreePage from './OverviewResearchPage.jsx';

export default function MyUnitsHub() {
  const tabs = [
    { key: 'techtree', label: 'TechTree', icon: '🐄', Component: TechTreePage },
    { key: 'research',   label: 'Research', icon: '🏥', Component: ResearchTreePage },
  ];

  return <TabsTemplatePage tabs={tabs} defaultKey="techtree" preserve={false} className="my-tabs" />;
}