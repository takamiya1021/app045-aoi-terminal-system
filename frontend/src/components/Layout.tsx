import React from 'react';
import OfflineIndicator from './OfflineIndicator';

interface LayoutProps {
  children: React.ReactNode;
  headerRight?: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children, headerRight }) => {
  return (
    <div className="flex flex-col h-[100dvh] bg-gray-900 text-gray-100">
      <OfflineIndicator />
      <header className="flex-none p-4 bg-gray-800 border-b border-gray-700 flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold text-orange-400">Aoi-Terminals</h1>
        {headerRight ? <div className="flex items-center gap-2">{headerRight}</div> : null}
      </header>

      <main className="flex-grow overflow-auto relative">
        {children}
      </main>

      <footer className="flex-none p-2 bg-gray-800 border-t border-gray-700 text-xs text-center text-gray-500">
        &copy; 2025 Aoi-Terminals
      </footer>
    </div>
  );
};

export default Layout;
