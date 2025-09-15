import React from 'react';
import { useGameData } from '../context/GameDataContext.jsx';

/**
 * En genbrugelig komponent, der viser et spil-billede.
 * Den tjekker automatisk, om billedet eksisterer i manifestet,
 * og viser en fallback, hvis det ikke gør.
 */
export default function GameImage({ src, fallback, alt = '', ...props }) {
    const { artManifest } = useGameData();

    // Udtræk den rene fil-nøgle fra stien, f.eks. "bld.farm.l1.medium.png"
    const imageKey = src.split('/art/')[1];

    const finalSrc = artManifest.has(imageKey) ? src : fallback;

    return <img src={finalSrc} alt={alt} {...props} />;
}