import React from 'react';

export default function Quickbar({ activePage }) {
    const links = [
        { page: 'dashboard', title: 'Dashboard', icon: '🏠' },
        { page: 'buildings', title: 'Buildings', icon: '🏗️' },
        { page: 'research', title: 'Research', icon: '🔬' },
        { page: 'unit', title: 'Units', icon: '🐄' },
        { page: 'inventory', title: 'Inventory', icon: '📦' },
        { page: 'production', title: 'Productions', icon: '🏭' },
        { page: 'flowchart', title: 'Flowchart', icon: '📂' },
        { page: 'userpage', title: 'User', icon: '👤' },
        { page: 'citizens', title: 'Befolkning', icon: '👤' },
        { page: 'management', title: 'Camp management', icon: '🗺️' },
        //{ page: 'citizensassignment', title: 'Borgertildeling', icon: '🧑‍💼' },
    ];

    return (
        <nav className="quickbar">
            {links.map(link => (
                <a 
                    key={link.page}
                    href={`#/${link.page}`} 
                    data-page={link.page} 
                    title={link.title}
                    className={activePage === link.page ? 'active' : ''}
                >
                    {link.icon}<span>{link.title}</span>
                </a>
            ))}
        </nav>
    );
}