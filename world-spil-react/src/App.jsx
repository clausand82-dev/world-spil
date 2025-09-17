import React from 'react';
import { useGameData } from './context/GameDataContext.jsx';
import { useRouter } from './services/useRouter.jsx';

// Importer dine nye komponenter
import Header from './components/Header.jsx';
import Sidebar from './components/Sidebar.jsx';
import Quickbar from './components/Quickbar.jsx';
import JobsRehydrator from './components/JobsRehydrator.jsx';
import GlobalJobsTicker from './components/GlobalJobsTicker.jsx';
import ResourceAutoRefresh from './components/ResourceAutoRefresh.jsx';

// Importer dine nye sider
import DashboardPage from './pages/DashboardPage.jsx';
import AnimalsPage from './pages/AnimalsPage.jsx';
import ResearchPage from './pages/ResearchPage.jsx';
import InventoryPage from './pages/InventoryPage.jsx';
import BuildingsPage from './pages/BuildingsPage.jsx';
import BuildingDetailPage from './components/building/BuildingDetailPage.jsx';
import ProductionPage from "./pages/ProductionPage.jsx";
import OverviewPage from "./pages/OverviewPage.jsx";
// ... importer andre sider her

function App() {
    const { isLoading, data, error } = useGameData();
    const { page, param } = useRouter();

    if (isLoading) return <div className="loading-screen">Indlæser spildata...</div>;
    if (error) return <div className="loading-screen">Fejl: Kunne ikke hente data.</div>;

    const renderPage = () => {
        switch (page) {
            case 'dashboard': return <DashboardPage />;
            case 'animals': return <AnimalsPage />;
            case 'research': return <ResearchPage />;
            case 'inventory': return <InventoryPage/>;
            case 'buildings': return <BuildingsPage/>;
            case 'building': return <BuildingDetailPage buildingId={param} />;
            case "production": return <ProductionPage />;
            case "overview": return <OverviewPage />;
            // Tilføj flere 'case' her for dine andre sider
            default: return <h1>Side ikke fundet: {page}</h1>;
        }
    };

    return (
        <>
            <JobsRehydrator />
            <GlobalJobsTicker />
            <ResourceAutoRefresh intervalMs={5000} />
            <Header />
            <div className="content">
                <main id="main">
                    {renderPage()}
                </main>
                <Sidebar />
            </div>
            <Quickbar activePage={page} />
        </>
    );
}

export default App;





