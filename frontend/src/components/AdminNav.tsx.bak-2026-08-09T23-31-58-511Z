import { ClipboardList, LogOut, Settings, UtensilsCrossed } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";

export function AdminNav() {
  const navigate = useNavigate();
  return <nav className="admin-nav">
    <NavLink to="/admin" end><ClipboardList />Pedidos</NavLink>
    <NavLink to="/admin/cardapio"><UtensilsCrossed />Cardápio</NavLink>
    <NavLink to="/admin/configuracoes"><Settings />Configurações</NavLink>
    <button onClick={() => { sessionStorage.removeItem("mesa4.admin.token"); navigate("/admin/login"); }}><LogOut />Sair</button>
  </nav>;
}
