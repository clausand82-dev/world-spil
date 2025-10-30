import React from 'react';
import Icon from './ui/Icon.jsx';

export default function Quickbar({ activePage }) {
    const links = [
        { page: 'dashboard', title: 'Dashboard', icon: '/assets/icons/menu_dashboard.png' },
        { page: 'buildings', title: 'Buildings', icon: '/assets/icons/menu_building.png' },
        { page: 'research', title: 'Research', icon: '/assets/icons/menu_research.png' },
        { page: 'unit', title: 'Units', icon: '/assets/icons/menu_unit.png' },
        { page: 'resources', title: 'Resources', icon: '/assets/icons/menu_resources.png' },
        { page: 'production', title: 'Productions', icon: '/assets/icons/menu_production.png' },
        { page: 'flowchart', title: 'Flowchart', icon: '/assets/icons/menu_flowcharts.png' },
        { page: 'userpage', title: 'User', icon: '/assets/icons/menu_user.png' },
        { page: 'citizens', title: 'Befolkning', icon: '/assets/icons/menu_citizens.png' },
        { page: 'management', title: 'Camp management', icon: '/assets/icons/campmanagement.png' },
        //{ page: 'citizensassignment', title: 'Borgertildeling', icon: '🧑‍💼' },
    ];

    const renderIcon = (icon, title) => {
        if (!icon) return null;
        // accept either emoji/text or image src (absolute or relative path ending with .png/.svg)
        if (typeof icon === 'string' && (icon.startsWith('/') || icon.endsWith('.png') || icon.endsWith('.svg') || icon.includes('/assets/'))) {
            return <Icon src={icon} size={32} alt={title} />;
        }
        return <span aria-hidden style={{ lineHeight: 0 }}>{icon}</span>;
    };

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
                    {renderIcon(link.icon, link.title)}<span>{link.title}</span>
                </a>
            ))}
        </nav>
    );
}