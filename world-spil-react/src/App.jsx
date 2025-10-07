import React, { useEffect, useState, useRef } from 'react';
import { useGameData } from './context/GameDataContext.jsx';
import { useRouter } from './services/useRouter.jsx';

import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import Quickbar from './components/Quickbar.jsx';
import JobsRehydrator from './components/JobsRehydrator.jsx';
import GlobalJobsTicker from './components/GlobalJobsTicker.jsx';
import ResourceAutoRefresh from './components/ResourceAutoRefresh.jsx';

import DashboardPage from './pages/DashboardPage.jsx';
import ResearchPage from './pages/ResearchPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import BuildingsPage from './pages/BuildingsPage.jsx';
import BuildingDetailPage from './components/building/BuildingDetailPage.jsx';
import ProductionPage from "./pages/ProductionPage.jsx";
import FlowChartPage from "./pages/FlowChartPage.jsx";
import UserPage from './components/user/UserPage.jsx';
import MapPage from './pages/MapPage.jsx';
import { BoardProvider } from './components/ui/BoardProvider.jsx';
import UnitPage from './pages/UnitPage.jsx';
import CitizensPage from './pages/CitizensPage.jsx';
import HelpOverlay from './pages/HelpOverlay.jsx';
import ManagementPage from './pages/ManagementPage.jsx';
import { HELP_TOPICS } from './config/helpTopics.jsx';

function App() {
  const { isLoading, data, error } = useGameData();
  const { page, param } = useRouter();
  const [showHelp, setShowHelp] = useState(false);

  // Husk sidste ikke-help-hash så vi kan gå tilbage ved luk
  const lastNonHelpHashRef = useRef('#/map');

  useEffect(() => {
    const capture = () => {
      const h = window.location.hash || '#/map';
      if (!h.startsWith('#/help')) {
        lastNonHelpHashRef.current = h;
      }
    };
    // fang nuværende straks og på fremtidige ændringer
    capture();
    window.addEventListener('hashchange', capture);
    return () => window.removeEventListener('hashchange', capture);
  }, []);

  // Redirect-regler:
  useEffect(() => {
    if (!data) return;

    const user = data?.state?.user || {};
    const coordsMissing = (user?.x == null) || (user?.y == null);
    const seenMapOnce = (() => {
      try { return localStorage.getItem('ws.map.seen') === '1'; } catch { return false; }
    })();

    if (coordsMissing) {
      if (page !== 'map') window.location.hash = '#/map';
      return;
    }

    if (!seenMapOnce && page !== 'map') {
      window.location.hash = '#/map';
    }
  }, [data, page]);

  const renderPage = () => {
    switch (page) {
      case 'dashboard': return <DashboardPage />;
      case 'unit': return <UnitPage />;
      case 'research': return <ResearchPage />;
      case 'inventory': return <InventoryPage />;
      case 'buildings': return <BuildingsPage />;
      case 'building': return <BuildingDetailPage buildingId={param} />;
      case 'production': return <ProductionPage />;
      case 'flowchart': return <FlowChartPage />;
      case 'userpage': return <UserPage />;
      case 'map': return <MapPage />;
      case 'citizens': return <CitizensPage />;
      case 'management': return <ManagementPage />;
      default: return <h1>Side ikke fundet: {page}</h1>;
    }
  };

  let mainContent;
  if (isLoading) {
    mainContent = <div className="sub">Indlæser spildata...</div>;
  } else if (error || !data) {
    mainContent = (
      <div className="sub">
        Fejl: Kunne ikke hente data. Log ind i topbaren og prøv igen.
      </div>
    );
  } else {
    mainContent = renderPage();
  }

  const isHelpHashOpen = (window.location.hash || '').startsWith('#/help');

  return (
    <BoardProvider>
      <>
        {data && (
          <>
            <JobsRehydrator />
            <GlobalJobsTicker />
            <ResourceAutoRefresh intervalMs={5000} />
          </>
        )}

        <Header />

        {/* Valgfri ekstra knap, hvis du også vil have den her i layoutet */}
        {/* <button className="icon-btn" onClick={() => setShowHelp(true)}>❓ Hjælp</button> */}

        <div className="content">
          <main id="main">
            {mainContent}
          </main>

          {data && <Sidebar />}
        </div>

        {data && page !== 'map' && <Quickbar activePage={page} />}

        <HelpOverlay
          isOpen={showHelp || isHelpHashOpen}
          onClose={() => {
            setShowHelp(false);
            // Hvis vi er på #/help, gå tilbage til sidste kendte rute i stedet for "#/"
            if (isHelpHashOpen) {
              const backTo = lastNonHelpHashRef.current || '#/map';
              window.location.hash = backTo;
            }
          }}
          topics={HELP_TOPICS}
          // initialTopicId="intro"
        />
      </>
    </BoardProvider>
  );
}

export default App;