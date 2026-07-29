import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { SocketProvider } from './contexts/SocketContext';
import { VendorAuthProvider } from './contexts/VendorAuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import VendorLayout from './components/VendorLayout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import AdminDashboard from './pages/AdminDashboard';
import UserManagement from './pages/UserManagement';
import Profile from './pages/Profile';
import Announcements from './pages/Announcements';
import LabelGenerator from './pages/LabelGenerator';
import LabelHistory from './pages/LabelHistory';
import BulkLabels from './pages/BulkLabels';
import BulkLabelGenerator from './pages/BulkLabelGenerator';
import BulkTrackingUpdate from './pages/BulkTrackingUpdate';
import VendorManagement from './pages/VendorManagement';
import UserVendorAccess from './pages/UserVendorAccess';
import AdminManifestOps from './pages/AdminManifestOps';
import LiveActivity from './pages/LiveActivity';
import AdminLiveActivity from './pages/AdminLiveActivity';
import AdminWarehouses from './pages/AdminWarehouses';
import AdminStates from './pages/AdminStates';
import VendorLogin from './pages/vendor/VendorLogin';
import VendorDashboard from './pages/vendor/VendorDashboard';
import VendorJobDetail from './pages/vendor/VendorJobDetail';
import VendorEarnings  from './pages/vendor/VendorEarnings';
import ManifestHistory from './pages/ManifestHistory';
import ResellerClients from './pages/ResellerClients';
import Finance             from './pages/Finance';
import CashBook            from './pages/CashBook';
import FinancialDashboard  from './pages/FinancialDashboard';
import Settings            from './pages/Settings';
import Leaderboard         from './pages/Leaderboard';
import Suggestions         from './pages/Suggestions';
import ResellerUserStats   from './pages/ResellerUserStats';
import ResellerBulkAccess  from './pages/ResellerBulkAccess';
import AdminErrorLogs      from './pages/AdminErrorLogs';
import BulkVendorAccess    from './pages/BulkVendorAccess';
import CCLayout             from './pages/CommandCenter/CCLayout';
import CCDashboard          from './pages/CommandCenter/CCDashboard';
import CCLabels             from './pages/CommandCenter/CCLabels';
import CCBulkLabels         from './pages/CommandCenter/CCBulkLabels';
import CCBulkTrackingUpdate from './pages/CommandCenter/CCBulkTrackingUpdate';
import CCVendorPerformance  from './pages/CommandCenter/CCVendorPerformance';
import CCUsers              from './pages/CommandCenter/CCUsers';
import { ThemeProvider } from './contexts/ThemeContext';
import './App.css';

// Shorthand wrappers to keep JSX clean
const AdminOnly = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute roles={['admin']}>{children}</ProtectedRoute>
);
const AdminOrReseller = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute roles={['admin', 'reseller']}>{children}</ProtectedRoute>
);
const CCAllowed = ({ children }: { children: React.ReactNode }) => (
  <ProtectedRoute roles={['admin']} allowCC>{children}</ProtectedRoute>
);

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <VendorAuthProvider>
            <Router>
              <div className="App">
              <Routes>
                {/* Public routes */}
                <Route path="/login"  element={<Login />} />

                {/* ── Vendor Portal (completely separate, neutral branding) ── */}
                <Route path="/vendor-portal/login" element={<VendorLogin />} />
                <Route path="/vendor-portal" element={<VendorLayout />}>
                  <Route index element={<Navigate to="/vendor-portal/jobs" replace />} />
                  <Route path="jobs"      element={<VendorDashboard />} />
                  <Route path="jobs/:id"  element={<VendorJobDetail />} />
                  <Route path="earnings"  element={<VendorEarnings />} />
                </Route>

                {/* No public landing page — send root straight to login */}
                <Route path="/" element={<Navigate to="/login" replace />} />

                {/* ── Command Center (admin, or reseller with ccAccess — own layout) ── */}
                <Route path="/command-center" element={<CCAllowed><CCLayout /></CCAllowed>}>
                  <Route index element={<Navigate to="/command-center/dashboard" replace />} />
                  <Route path="dashboard"   element={<CCDashboard />} />
                  <Route path="labels"      element={<CCLabels />} />
                  <Route path="bulk-labels" element={<CCBulkLabels />} />
                  <Route path="ai-status"   element={<CCBulkTrackingUpdate />} />
                  <Route path="vendor-perf" element={<CCVendorPerformance />} />
                </Route>

                {/* ── Main portal (Label Flow users) ─────────────────────── */}
                <Route element={
                  <ProtectedRoute>
                    <Layout />
                  </ProtectedRoute>
                }>
                  {/* All authenticated users */}
                  <Route path="/dashboard"           element={<Dashboard />} />
                  <Route path="/profile"             element={<Profile />} />
                  <Route path="/announcements"       element={<Announcements />} />
                  <Route path="/labels/single"       element={<LabelGenerator />} />
                  <Route path="/labels/bulk"         element={<BulkLabelGenerator />} />
                  <Route path="/labels/history"      element={<LabelHistory />} />
                  <Route path="/labels/bulk-history" element={<BulkLabels />} />
                  <Route path="/manifest/upload"     element={<Navigate to="/labels/bulk" replace />} />
                  <Route path="/manifest/history"    element={<ManifestHistory />} />
                  <Route path="/activity"            element={<LiveActivity />} />
                  <Route path="/leaderboard"         element={<Leaderboard />} />
                  <Route path="/suggestions"         element={<Suggestions />} />
                  {/* Topup/payment history now lives inline on the Profile page */}
                  <Route path="/topups"              element={<Navigate to="/profile" replace />} />
                  <Route path="/payments"            element={<Navigate to="/profile" replace />} />

                  {/* Admin-only routes */}
                  <Route path="/admin"                         element={<AdminOnly><AdminDashboard /></AdminOnly>} />
                  <Route path="/admin/users"                   element={<AdminOnly><UserManagement /></AdminOnly>} />
                  <Route path="/admin/users/:userId/access"    element={<AdminOnly><UserVendorAccess /></AdminOnly>} />
                  <Route path="/admin/vendors"                 element={<AdminOnly><VendorManagement /></AdminOnly>} />
                  <Route path="/admin/bulk-vendor-access"      element={<AdminOnly><BulkVendorAccess /></AdminOnly>} />
                  <Route path="/admin/manifest"                element={<AdminOnly><AdminManifestOps /></AdminOnly>} />
                  <Route path="/admin/finance"                 element={<AdminOnly><Finance /></AdminOnly>} />
                  <Route path="/admin/cashbook"                element={<AdminOnly><CashBook /></AdminOnly>} />
                  <Route path="/admin/financial-dashboard"     element={<AdminOnly><FinancialDashboard /></AdminOnly>} />
                  <Route path="/admin/settings"                element={<AdminOnly><Settings /></AdminOnly>} />
                  <Route path="/admin/live"                    element={<AdminOnly><AdminLiveActivity /></AdminOnly>} />
                  <Route path="/admin/warehouses"              element={<AdminOnly><AdminWarehouses /></AdminOnly>} />
                  <Route path="/admin/states"                  element={<AdminOnly><AdminStates /></AdminOnly>} />
                  <Route path="/admin/bulk-tracking-update"   element={<AdminOnly><BulkTrackingUpdate /></AdminOnly>} />
                  <Route path="/admin/user-stats"              element={<AdminOnly><CCUsers /></AdminOnly>} />
                  <Route path="/admin/logs"                    element={<AdminOnly><AdminErrorLogs /></AdminOnly>} />

                  {/* Reseller routes (admin can also access) */}
                  <Route path="/reseller/clients"     element={<AdminOrReseller><ResellerClients /></AdminOrReseller>} />
                  <Route path="/reseller/finance"     element={<AdminOrReseller><Finance /></AdminOrReseller>} />
                  <Route path="/reseller/user-stats"  element={<AdminOrReseller><ResellerUserStats /></AdminOrReseller>} />
                  <Route path="/reseller/bulk-access" element={<AdminOrReseller><ResellerBulkAccess /></AdminOrReseller>} />
                </Route>

                {/* Catch all → root domain */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
            </Router>
          </VendorAuthProvider>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
