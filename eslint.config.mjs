import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  ...nextCoreWebVitals,
  {
    rules: {
      // Dua aturan ini disiapkan untuk React Compiler, yang tidak dipakai di proyek ini.
      // Pola yang dipakai di sini disengaja:
      // - "ref terbaru" (mis. editingRef.current = editing) supaya handler keyboard/realtime membaca nilai terkini;
      // - memuat data dari Supabase di useEffect saat komponen dipasang.
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "pitch/**", ".claude/**", ".agents/**", "app/ui-preview/**"],
  },
];

export default config;
