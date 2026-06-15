import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { CartProvider } from './context/CartContext'
import { ToastProvider } from './components/StatusBadge'
import ProtectedRoute from './components/ProtectedRoute'

import ProductList      from './pages/customer/ProductList'
import Checkout         from './pages/customer/Checkout'
import OrderConfirm     from './pages/customer/OrderConfirm'
import OrderQuery       from './pages/customer/OrderQuery'
import BoothDashboard   from './pages/booth/BoothDashboard'
import CashierPage      from './pages/booth/CashierPage'
import OrderDashboard   from './pages/admin/OrderDashboard'
import ProductManage    from './pages/admin/ProductManage'
import ReportsDashboard from './pages/admin/ReportsDashboard'
import SettingsPage     from './pages/admin/SettingsPage'
import LoginPage        from './pages/LoginPage'

export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <ToastProvider>
          <HashRouter>
            <Routes>
              {/* 顧客前台 */}
              <Route path="/"               element={<ProductList />} />
              <Route path="/checkout"       element={<Checkout />} />
              <Route path="/order/:orderNo" element={<OrderConfirm />} />
              <Route path="/query"          element={<OrderQuery />} />

              {/* 登入 */}
              <Route path="/login" element={<LoginPage />} />

              {/* 後台（需登入）*/}
              <Route path="/booth"           element={<ProtectedRoute><BoothDashboard /></ProtectedRoute>} />
              <Route path="/cashier"         element={<ProtectedRoute><CashierPage /></ProtectedRoute>} />
              <Route path="/admin"           element={<ProtectedRoute><OrderDashboard /></ProtectedRoute>} />
              <Route path="/admin/products"  element={<ProtectedRoute><ProductManage /></ProtectedRoute>} />
              <Route path="/admin/reports"   element={<ProtectedRoute><ReportsDashboard /></ProtectedRoute>} />
              <Route path="/admin/settings"  element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </HashRouter>
        </ToastProvider>
      </CartProvider>
    </AuthProvider>
  )
}
