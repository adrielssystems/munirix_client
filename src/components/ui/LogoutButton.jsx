"use client";

import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";
import styles from "./LogoutButton.module.css";

export default function LogoutButton() {
  return (
    <button 
      onClick={() => signOut({ callbackUrl: '/login' })}
      className={styles.logoutButton}
      title="Cerrar sesión"
    >
      <LogOut size={20} />
    </button>
  );
}
