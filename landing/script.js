const LANGS = ["en", "ko", "ja"];
const LANG_LABELS = { en: "EN", ko: "KO", ja: "JA" };
let cache = {};

function detectLang() {
  const saved = localStorage.getItem("canary-lang");
  if (saved && LANGS.includes(saved)) return saved;
  const nav = navigator.language.slice(0, 2);
  if (LANGS.includes(nav)) return nav;
  return "en";
}

async function loadStrings(lang) {
  if (cache[lang]) return cache[lang];
  const res = await fetch(`i18n/${lang}.json`);
  const data = await res.json();
  cache[lang] = data;
  return data;
}

function applyStrings(t) {
  document.title = t.meta_title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", t.meta_description);
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (t[key]) el.textContent = t[key];
  });
}

function updateLangButtons(lang) {
  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === lang);
  });
}

async function setLang(lang) {
  const t = await loadStrings(lang);
  applyStrings(t);
  updateLangButtons(lang);
  localStorage.setItem("canary-lang", lang);
  document.documentElement.lang = lang;
}

document.addEventListener("DOMContentLoaded", async () => {
  // Render lang switcher buttons
  const switcher = document.getElementById("lang-switch");
  LANGS.forEach((lang) => {
    const btn = document.createElement("button");
    btn.className = "lang-btn";
    btn.dataset.lang = lang;
    btn.textContent = LANG_LABELS[lang];
    btn.addEventListener("click", () => setLang(lang));
    switcher.appendChild(btn);
  });

  await setLang(detectLang());
});
