import { useState, useEffect } from 'react';

// En simpel "hash-baseret" router
export function useRouter() {
    const [route, setRoute] = useState({ page: 'dashboard', param: null });

    useEffect(() => {
        const handleHashChange = () => {
            const hash = window.location.hash.slice(2) || 'dashboard'; // f.eks. "building/farm.l1"
            const [page, ...params] = hash.split('/'); // Giver ["building", "farm.l1"]
            setRoute({ page, param: params.join('/') }); // Samler params igen, hvis der er slashes i
        };

        window.addEventListener('hashchange', handleHashChange);
        handleHashChange(); // Kør med det samme

        return () => window.removeEventListener('hashchange', handleHashChange);
    }, []);

    return route;
}