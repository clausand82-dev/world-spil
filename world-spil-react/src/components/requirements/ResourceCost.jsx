// Default = BUFFED (hele appen får buffed pris uden at du ændrer imports)
export { default } from '../common/BuffedResourceCost.jsx';

// Named export = PURE/BASE (til hover/tooltip sammenligning)
export { default as PureResourceCost } from './ResourceCost.base.jsx';