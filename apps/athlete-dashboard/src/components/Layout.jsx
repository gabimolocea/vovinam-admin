import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground lg:flex-row">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-4 py-6 lg:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
