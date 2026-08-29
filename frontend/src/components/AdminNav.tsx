import { ClipboardList, LogOut, Printer, Settings, UtensilsCrossed, Users } from "lucide-react";
import {
  NavLink,
  useNavigate,
} from "react-router-dom";

import { clearAndroidAdminSession } from "../lib/api";
export function AdminNav() {
  const navigate = useNavigate();

  return (
    <nav className="admin-nav">
      <NavLink to="/admin" end>
        <ClipboardList />
        Pedidos
      </NavLink>

      <NavLink to="/admin/cardapio">
        <UtensilsCrossed />
        Cardápio
      </NavLink>

      <NavLink to="/admin/imprimir">
        <Printer />
        Impressão
      </NavLink>

      <NavLink to="/admin/administradores"><Users />Administradores</NavLink>
    <NavLink to="/admin/configuracoes">
        <Settings />
        Configurações
      </NavLink>

      <button
        type="button"
        onClick={() => {
          sessionStorage.removeItem(
            "mesa4.admin.token",
          );
          /* MESA4_ANDROID_LOGOUT_CLEAR_V17_2 */
        clearAndroidAdminSession();
        navigate("/admin/login");
        }}
      >
        <LogOut />
        Sair
      </button>
    </nav>
  );
}
