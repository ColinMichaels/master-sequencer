export const shouldShowFirstRunGuide = ({ roots = [], library = [] } = {}) => (
  roots.length === 0 && library.length === 0
);
