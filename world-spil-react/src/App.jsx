import React, { useEffect } from 'react';
import { useGameData } from './context/GameDataContext.jsx';
import { useRouter } from './services/useRouter.jsx';

import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import Quickbar from './components/Quickbar.jsx';
import JobsRehydrator from './components/JobsRehydrator.jsx';
import GlobalJobsTicker from './components/GlobalJobsTicker.jsx';
import ResourceAutoRefresh from './components/ResourceAutoRefresh.jsx';

import DashboardPage from './pages/DashboardPage.jsx';
import AnimalsPage from './pages/AnimalsPage.jsx';
import ResearchPage from './pages/ResearchPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import BuildingsPage from './pages/BuildingsPage.jsx';
import BuildingDetailPage from './components/building/BuildingDetailPage.jsx';
import ProductionPage from "./pages/ProductionPage.jsx";
import OverviewPage from "./pages/OverviewPage.jsx";
import UserPage from './components/user/UserPage.jsx';
import MapPage from './pages/MapPage.jsx';
import { BoardProvider } from './components/ui/BoardProvider.jsx';

function App() {
  const { isLoading, data, error } = useGameData();
  const { page, param } = useRouter();

  // Redirect-regler:
  // 1) Hvis x/y mangler => tving til #/map
  // 2) Hvis x/y findes, men "map" ikke er set før => vis #/map én gang
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
      case 'animals': return <AnimalsPage />;
      case 'research': return <ResearchPage />;
      case 'inventory': return <InventoryPage />;
      case 'buildings': return <BuildingsPage />;
      case 'building': return <BuildingDetailPage buildingId={param} />;
      case 'production': return <ProductionPage />;
      case 'overview': return <OverviewPage />;
      case 'userpage': return <UserPage />;
      case 'map': return <MapPage />;
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

        <div className="content">
          <main id="main">
            {mainContent}
          </main>

          {data && <Sidebar />}
        </div>

        <Quickbar activePage={page} />
      </>
    </BoardProvider>
  )
}

export default App;