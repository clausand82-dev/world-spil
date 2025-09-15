import React, { useState } from 'react';
import { useGameData } from '../context/GameDataContext';
import { normalizePrice } from '../services/helpers'; // Importerer fra din nye helper-fil

// Vi laver de gamle funktioner om til React-komponenter
function OwnedAnimalsList({ owned, defs }) {
    // ... logik til at bygge listen ...
    return (
        <div>
            {Object.entries(owned).map(([aniId, data]) => {
                // ...
                return <div key={aniId} className="item">{/* ... JSX for en række ... */}</div>
            })}
        </div>
    );
}

function AvailableAnimalsList({ state, defs }) {
    // ...
    return (
        <div>
            {/* JSX for købs-sektionen */}
        </div>
    );
}

// Hovedkomponenten for siden
export default function AnimalsPage() {
    const { data, isLoading } = useGameData();
    const [animalsToBuy, setAnimalsToBuy] = useState({});

    if (isLoading) {
        return <div className="sub">Indlæser dyredata...</div>;
    }

    if (!data) {
        return <div className="sub">Kunne ikke hente dyredata.</div>;
    }

    // Her ville du kalde dine nye komponenter
    return (
        <>
            <section className="panel section">
                <div className="section-head">Dine Dyr</div>
                <div className="section-body">
                    <OwnedAnimalsList owned={data.state.ani} defs={data.defs.ani} />
                </div>
            </section>
            <section className="panel section">
                <div className="section-head">Køb Dyr</div>
                <div className="section-body">
                    <AvailableAnimalsList state={data.state} defs={data.defs} />
                </div>
            </section>
        </>
    );
}