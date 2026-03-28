import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, BookOpen, Network, PenTool, Bot, FlaskConical, Settings,
  Search, Bell, Menu, X, Star, MessageSquare,
  Cloud, Cpu, Database, Wifi, ChevronDown, LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/domains/auth/useAuth';

// ─── Nav Config ────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { path: '/learning', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/courses', label: '我的课程', icon: BookOpen },
  { path: '/graph', label: '知识图谱', icon: Network },
  { path: '/writing', label: '写作工坊', icon: PenTool },
  { path: '/ai', label: 'AI 中心', icon: Bot },
  { path: '/simulations', label: '模拟任务', icon: FlaskConical },
];

const BOTTOM_NAV_ITEMS = [
  { path: '/learning', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/courses', label: '课程', icon: BookOpen },
  { path: '/graph', label: '图谱', icon: Network },
  { path: '/writing', label: '写作', icon: PenTool },
  { path: '/ai', label: 'AI', icon: Bot },
];

const ROLE_LABEL: Record<string, string> = {
  student: '学生',
  teacher: '教师',
  admin: '管理员',
};

const ROLE_COLOR: Record<string, string> = {
  student: 'bg-blue-100 text-blue-700',
  teacher: 'bg-purple-100 text-purple-700',
  admin: 'bg-amber-100 text-amber-700',
};

// ─── AI Status Panel (sidebar section) ────────────────────────────────────────
const AIStatusPanel: React.FC = () => {
  const [cloudStatus] = useState<'online' | 'offline'>('online');
  const [localStatus] = useState<'online' | 'offline'>('offline');
  const [kgStatus] = useState<'sync' | 'idle'>('sync');

  return (
    <div className="px-3 py-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2 mb-3">
        AI 状态
      </p>
      <div className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <Cloud className="w-3.5 h-3.5" />
          <span>Cloud LLM</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn('w-1.5 h-1.5 rounded-full', cloudStatus === 'online' ? 'bg-green-500' : 'bg-slate-300')} />
          <span className="text-[10px] text-slate-400">{cloudStatus === 'online' ? '在线' : '离线'}</span>
        </div>
      </div>
      <div className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <Cpu className="w-3.5 h-3.5" />
          <span>Local LLM</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn('w-1.5 h-1.5 rounded-full', localStatus === 'online' ? 'bg-green-500' : 'bg-slate-300')} />
          <span className="text-[10px] text-slate-400">{localStatus === 'online' ? '在线' : '离线'}</span>
        </div>
      </div>
      <div className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
        <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
          <Database className="w-3.5 h-3.5" />
          <span>知识引擎</span>
        </div>
        <div className="flex items-center gap-1">
          <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', kgStatus === 'sync' ? 'bg-blue-500' : 'bg-slate-300')} />
          <span className="text-[10px] text-slate-400">{kgStatus === 'sync' ? '同步中' : '空闲'}</span>
        </div>
      </div>
    </div>
  );
};

// ─── User Profile Footer (sidebar) ────────────────────────────────────────────
const SidebarUserProfile: React.FC<{ user: any }> = ({ user }) => {
  const [open, setOpen] = useState(false);
  const initials = user?.name ? user.name.charAt(0).toUpperCase() : 'U';
  const role = user?.role || 'student';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          {initials}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{user?.name || '学生用户'}</p>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium', ROLE_COLOR[role])}>
            {ROLE_LABEL[role] || role}
          </span>
        </div>
        <ChevronDown className={cn('w-4 h-4 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-lg overflow-hidden">
          <NavLink
            to="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-3 px-4 py-3 text-sm text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700"
          >
            <Settings className="w-4 h-4" /> 设置
          </NavLink>
          <button className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 border-t border-slate-100 dark:border-slate-700">
            <LogOut className="w-4 h-4" /> 退出登录
          </button>
        </div>
      )}
    </div>
  );
};

// ─── Desktop Sidebar ───────────────────────────────────────────────────────────
const DesktopSidebar: React.FC<{ user: any }> = ({ user }) => (
  <aside className="hidden lg:flex flex-col w-60 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex-shrink-0">
    {/* Logo */}
    <div className="flex items-center gap-2.5 px-5 h-16 border-b border-slate-100 dark:border-slate-800">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center flex-shrink-0">
        <Network className="w-4 h-4 text-white" />
      </div>
      <div>
        <span className="text-base font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          EduGraph
        </span>
        <p className="text-[9px] text-slate-400 leading-none">知识图谱学习平台</p>
      </div>
    </div>

    {/* Nav */}
    <nav className="flex-1 overflow-y-auto px-3 pt-4 space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2 mb-3">导航</p>
      {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) => cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
            isActive
              ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900'
          )}
        >
          {({ isActive }) => (
            <>
              <Icon className={cn('w-4 h-4', isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400')} />
              {label}
            </>
          )}
        </NavLink>
      ))}

      {/* Quick Access */}
      <div className="pt-4">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 px-2 mb-2">快捷访问</p>
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-50 transition-colors">
          <Star className="w-4 h-4 text-slate-400" /> 收藏节点
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-slate-500 hover:bg-slate-50 transition-colors">
          <MessageSquare className="w-4 h-4 text-slate-400" /> 最近对话
        </button>
      </div>
    </nav>

    {/* AI Status */}
    <AIStatusPanel />

    {/* User Profile */}
    <div className="px-3 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800">
      <SidebarUserProfile user={user} />
    </div>
  </aside>
);

// ─── Topbar ────────────────────────────────────────────────────────────────────
const Topbar: React.FC<{ user: any; onMenuClick: () => void }> = ({ user, onMenuClick }) => {
  const location = useLocation();
  const [searchOpen, setSearchOpen] = useState(false);

  const getBreadcrumb = () => {
    const path = location.pathname;
    if (path === '/learning') return 'Dashboard';
    if (path.startsWith('/courses')) return '我的课程';
    if (path === '/graph') return '知识图谱';
    if (path === '/writing') return '写作工坊';
    if (path === '/ai') return 'AI 中心';
    if (path === '/simulations') return '模拟任务';
    if (path === '/settings') return '设置';
    return 'EduGraph';
  };

  return (
    <header className="h-16 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center gap-4 px-4 lg:px-6 sticky top-0 z-30 flex-shrink-0">
      {/* Mobile menu button */}
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 transition-colors"
      >
        <Menu className="w-5 h-5" />
      </button>

      {/* Breadcrumb */}
      <div className="flex-1 flex items-center gap-2 min-w-0">
        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
          {getBreadcrumb()}
        </span>
      </div>

      {/* Search */}
      <div className="hidden sm:flex relative">
        {searchOpen ? (
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                autoFocus
                type="text"
                placeholder="搜索课程、概念..."
                className="w-64 pl-9 pr-4 py-1.5 text-sm bg-slate-100 dark:bg-slate-800 rounded-full border-none focus:ring-2 focus:ring-blue-500 dark:text-slate-100 outline-none"
                onBlur={() => setSearchOpen(false)}
              />
            </div>
          </div>
        ) : (
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
          >
            <Search className="w-4 h-4" />
            <span className="hidden md:inline">搜索</span>
            <kbd className="hidden md:inline text-[10px] px-1.5 py-0.5 bg-white dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600 text-slate-400">⌘K</kbd>
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button className="relative p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* Avatar (mobile only, desktop uses sidebar profile) */}
        <button className="lg:hidden w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
          {user?.name ? user.name.charAt(0).toUpperCase() : 'U'}
        </button>
      </div>
    </header>
  );
};

// ─── Status Bar ────────────────────────────────────────────────────────────────
const StatusBar: React.FC = () => (
  <div className="hidden lg:flex items-center gap-6 h-7 px-6 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 flex-shrink-0">
    <span className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" /> GPT-4o · 在线
    </span>
    <span className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> KG 同步中
    </span>
    <span className="flex items-center gap-1.5">
      <Wifi className="w-3 h-3" /> 已连接
    </span>
    <span className="ml-auto">EduGraph v1.0</span>
  </div>
);

// ─── Mobile Drawer ──────────────────────────────────────────────────────────────
const MobileDrawer: React.FC<{ open: boolean; onClose: () => void; user: any }> = ({ open, onClose, user }) => (
  <>
    {open && (
      <div className="lg:hidden fixed inset-0 z-50 flex">
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
        <aside className="relative flex flex-col w-72 bg-white dark:bg-slate-900 h-full shadow-2xl">
          <div className="flex items-center justify-between px-5 h-16 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                <Network className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-bold text-transparent bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text">
                EduGraph
              </span>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400">
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 pt-4 space-y-1">
            {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                onClick={onClose}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all',
                  isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                <Icon className="w-5 h-5" />
                {label}
              </NavLink>
            ))}
          </nav>

          <AIStatusPanel />
          <div className="px-3 pb-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <SidebarUserProfile user={user} />
          </div>
        </aside>
      </div>
    )}
  </>
);

// ─── Layout Root ───────────────────────────────────────────────────────────────
export const Layout: React.FC = () => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user } = useAuth();

  // Close drawer on route change
  const location = useLocation();
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">
      {/* Main layout row */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <DesktopSidebar user={user} />

        {/* Content column */}
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Topbar user={user} onMenuClick={() => setDrawerOpen(true)} />

          {/* Main scrollable area */}
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>

          {/* Mobile bottom tab bar */}
          <nav className="lg:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-around items-center py-2 px-2 safe-area-bottom flex-shrink-0">
            {BOTTOM_NAV_ITEMS.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                className={({ isActive }) => cn(
                  'flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-colors min-w-[44px]',
                  isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400'
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[9px] font-medium">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Status bar */}
          <StatusBar />
        </div>
      </div>

      {/* Mobile Drawer */}
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} user={user} />
    </div>
  );
};
