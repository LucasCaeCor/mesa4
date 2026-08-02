import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { CartDrawer } from "./components/CartDrawer";
import { MenuPage } from "./pages/MenuPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { OrderPage } from "./pages/OrderPage";
import { AdminLoginPage } from "./pages/AdminLoginPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminMenuPage } from "./pages/AdminMenuPage";
import { AdminSettingsPage } from "./pages/AdminSettingsPage";

function ProtectedAdmin({ children }: { children: ReactNode }) { return sessionStorage.getItem("mesa4.admin.token") ? <>{children}</> : <Navigate to="/admin/login" replace />; }
export default function App() { return <BrowserRouter><Routes><Route path="/" element={<MenuPage />} /><Route path="/checkout" element={<CheckoutPage />} /><Route path="/pedido/:publicId" element={<OrderPage />} /><Route path="/admin/login" element={<AdminLoginPage />} /><Route path="/admin" element={<ProtectedAdmin><AdminDashboardPage /></ProtectedAdmin>} /><Route path="/admin/cardapio" element={<ProtectedAdmin><AdminMenuPage /></ProtectedAdmin>} /><Route path="/admin/configuracoes" element={<ProtectedAdmin><AdminSettingsPage /></ProtectedAdmin>} /><Route path="*" element={<Navigate to="/" replace />} /></Routes><CartDrawer /></BrowserRouter>; }
