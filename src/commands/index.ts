// src/commands/index.ts

// Export all command functions from this directory

export * from './generateStructure';
export * from './undoChanges';
export * from './showDiff'; // Add export for the new diff command
// Removed exports for deleted commands
// export * from './deleteItems';
// export * from './refreshExplorer';
// export * from './createFile'; // Keep commented
// export * from './createFolder';
// export * from './copyFiles';