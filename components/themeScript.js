// Dijalankan inline di <head> sebelum halaman tampil supaya tidak ada kedipan tema yang salah.
// File terpisah (bukan "use client") karena dipakai oleh layout yang merupakan server component.
export const THEME_KEY = "theme";

export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t);}catch(e){}})();`;
