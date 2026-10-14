/* Daily real-photo stadium rotation for FantasyX.
   Images are photographs, not generated illustrations. One image is selected per local calendar day. */
(() => {
  const backgrounds = [
    { url: "https://images.unsplash.com/photo-1556816214-6d16c62fbbf6?auto=format&fit=crop&fm=jpg&q=85&w=2400", credit: "Unsplash — football crowd photograph" },
    { url: "https://images.unsplash.com/photo-1780766382589-5e517d4f0b81?auto=format&fit=crop&fm=jpg&q=85&w=2400", credit: "Unsplash — stadium photograph" },
    { url: "https://upload.wikimedia.org/wikipedia/commons/2/2f/Well_lit_soccer_stadium_%28Unsplash%29.jpg", credit: "Mario Klassen / Wikimedia Commons — CC0" },
    { url: "https://images.unsplash.com/photo-1522778119026-d647f0596c20?auto=format&fit=crop&fm=jpg&q=85&w=2400", credit: "Unsplash — football stadium photograph" }
  ];
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((now - start) / 86400000);
  const index = dayOfYear % backgrounds.length;
  const chosen = backgrounds[index];
  document.documentElement.style.setProperty("--fx-daily-bg", 'url("' + chosen.url + '")');
  document.documentElement.dataset.fxBackgroundDay = now.getFullYear() + "-" + String(now.getMonth()+1).padStart(2,"0") + "-" + String(now.getDate()).padStart(2,"0");
  const credit = document.getElementById("fxBackgroundCredit");
  if (credit) credit.textContent = chosen.credit;
  const preload = new Image();
  preload.onload = () => document.documentElement.classList.add("fx-background-ready");
  preload.onerror = () => {
    const fallback = backgrounds[(index + 1) % backgrounds.length];
    document.documentElement.style.setProperty("--fx-daily-bg", 'url("' + fallback.url + '")');
    if (credit) credit.textContent = fallback.credit;
  };
  preload.src = chosen.url;
})();
