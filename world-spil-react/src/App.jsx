import React from 'react';
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

function App() {
  const { isLoading, data, error } = useGameData();
  const { page, param } = useRouter();

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
    <>
      {/* Data-afhængige baggrundsprocesser kun når data er indlæst */}
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

        {/* Sidebar kan også være data-afhængig */}
        {data && <Sidebar />}
      </div>

      <Quickbar activePage={page} />
    </>
  );
}

export default App;