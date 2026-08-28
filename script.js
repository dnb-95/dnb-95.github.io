import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  doc, query, where, onSnapshot, orderBy, setDoc, limit
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const FB = {
  apiKey: "AIzaSyAP5gV1yUVEKnd_x3RkqyxYwF7vpnROgR0",
  authDomain: "tstmg-1.firebaseapp.com",
  projectId: "tstmg-1",
  storageBucket: "tstmg-1.firebasestorage.app",
  appId: "1:626888970289:web:23880053888f3dd1a88510"
};

const app  = initializeApp(FB);
const auth = getAuth(app);
const db   = getFirestore(app);

window.emailjs.init("2VkygefcXxbSOlhFX");

const GROQ_API_URL = "https://groqrelay.greninja71144.workers.dev";
const GROQ_MODEL   = "openai/gpt-oss-120b"; 

const ADMIN_PUSH_ENDPOINT = "https://groqrelay.greninja71144.workers.dev/onesignal";

const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 30000;
let loginFailedAttempts = 0;
let loginLockedUntil = 0;


function withOneSignal(callback, timeoutMs = 30000) {
  const ready = window.dnbOneSignalReady || new Promise((resolve, reject) => {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    window.OneSignalDeferred.push(async function(OneSignal) {
      try {
        resolve(OneSignal);
      } catch (error) {
        reject(error);
      }
    });
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("ONESIGNAL_TIMEOUT"));
    }, timeoutMs);

    ready.then(async (OneSignal) => {
      if (settled) return;
      try {
        const result = await callback(OneSignal);
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result);
      } catch (error) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      }
    }).catch(error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

let oneSignalPushListenerRegistered = false;

function setPushToggleState(enabled) {
  const checkbox = document.getElementById("tog-push-notif");
  if (checkbox) checkbox.checked = !!enabled;
}

function setLocalPushState(enabled, subscriptionId = null) {
  if (!currentUser) return;

  currentUser.pushEnabled = !!enabled;
  currentUser.oneSignalSubscriptionId = subscriptionId || null;

  try {
    saveSessionLocally(currentUser);
  } catch (error) {
    console.warn("Impossible de mettre à jour la session locale :", error);
  }

  setPushToggleState(enabled);
}

function registerOneSignalPushListener() {
  if (oneSignalPushListenerRegistered) return;
  oneSignalPushListenerRegistered = true;

  withOneSignal(async (OneSignal) => {
    OneSignal.User.PushSubscription.addEventListener("change", (event) => {
      const subscription = event?.current || OneSignal.User.PushSubscription;
      const optedIn = !!subscription?.optedIn;
      const subscriptionId = subscription?.id || null;

      setLocalPushState(optedIn, subscriptionId);
    });
  }).catch(error => {
    oneSignalPushListenerRegistered = false;
    console.error("Erreur d'initialisation du listener OneSignal :", error);
  });
}

async function getOneSignalPushState() {
  return withOneSignal(async (OneSignal) => {
    const subscription = OneSignal.User.PushSubscription;
    return {
      supported: OneSignal.Notifications.isPushSupported(),
      optedIn: !!subscription?.optedIn,
      subscriptionId: subscription?.id || null,
      permission: OneSignal.Notifications.permission || null
    };
  });
}

async function waitForOneSignalSubscription(timeoutMs = 5000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const state = await getOneSignalPushState();

    if (state.optedIn && state.subscriptionId) {
      return state;
    }

    await new Promise(resolve => setTimeout(resolve, 250));
  }

  return getOneSignalPushState();
}

async function syncOneSignalUser(u) {
  if (!u?.id) return;

  try {
    await withOneSignal(async (OneSignal) => {
      await OneSignal.login(String(u.id));
      registerOneSignalPushListener();

      const supported = OneSignal.Notifications.isPushSupported();
      if (!supported) {
        setLocalPushState(false, null);
        return;
      }

      const subscription = OneSignal.User.PushSubscription;
      setLocalPushState(!!subscription?.optedIn, subscription?.id || null);
    });
  } catch (error) {
    console.error("Erreur de synchronisation du compte OneSignal :", error);
  }
}

window.currentUser = null;

function saveSessionLocally(user = currentUser) {
  if (!user) return;
  try {
    const safe = { ...user };
    delete safe.password;
    delete safe.authPassword;
    localStorage.setItem("dnb_reviz_session", JSON.stringify(safe));
  } catch (error) {
    console.warn("Impossible de sauvegarder la session locale :", error);
  }
}

window.usersMap    = new Map();
window.subjectsMap = new Map();
window.etabsMap = new Map();
window.classesMap = new Map();
window._uploadedFiles = [];

window._coursUnsub   = null;
window._frUnsub      = null;
window._pinnedUnsub  = null;

window._quizUnsub    = null;
window._aiQuizUnsub  = null;
window._liveQuizzesData = [];
window._liveAIQuizzesData = [];

window._pubFeedUnsub = null;
window._dmChatsUnsub = null;
window._dmMsgsUnsub  = null;
window._currentViewedUser = null;

window._filterContext = 'cours';
window.filterVisibleContent = (items, type = 'post') => {
if (!currentUser) return items;
const filters = window.getUserVisibilityFilters();

if (filters.isAdminOrHS) return items;

return items.filter(item => {
  if (item.authorRole === 'HS') return false;

  if (!filters.etablissementId) {
    return item.authorId === currentUser.username;
  }

  if (item.authorId === currentUser.username) return true;

  if (!item.etablissementId || item.etablissementId !== filters.etablissementId) return false;

  if (filters.classeId) {
    if (!item.classeId || item.classeId !== filters.classeId) return false;
  }

  return true;
});
};
window._coursFilter = { subject: 'all', tags: [], order: 'recent' };
window._frFilter    = { subject: 'all', type: 'all', order: 'recent' };
window._quizFilter  = { subject: 'all', type: 'all', tags: [], order: 'recent' };

window._pubSubjFilter = "all";
window._pubTabActive  = "cours";

window._pubLikesData = { posts: [], quizzes: [], ai_quizzes: [] };
window._pubLikesUnsubPosts = null;
window._pubLikesUnsubQuizzes = null;
window._pubLikesUnsubAIQuizzes = null;

window._activeChatId = null;
window._activeChatPartnerId = null;
window._dmFileToUpload = null;

const CLOUDINARY_CLOUD_NAME    = "dmtggmxrm";
const CLOUDINARY_UPLOAD_PRESET = "iAcqTr_Pg13v5d-Es84wIkdUqaw";

window._currentQuizData = null;
window._quizMode = null; 
window._currentQuestionIndex = 0;
window._quizUserAnswers = [];
window._quizStartTime = 0;
window._hasViewedAnswers = false;

window._currentAudio = null;
window._galleryImages = [];
window._galleryIndex = 0;
window._allAdminUsers = [];
window._analyticsSessionId = null;
window._analyticsSessionUserId = null;
window._analyticsHeartbeatTimer = null;
window._statisticsCharts = {};
window._statisticsCache = { users: [], sessions: [], events: [], daily: [], hourly: [], concurrent: [] };

const GA_MEASUREMENT_ID = window.DNB_GA_MEASUREMENT_ID || "";
let _gaReady = false;

function isAdminUser(user = currentUser) {
  return !!user && (user.role === "admin" || (Array.isArray(user.subRoles) && user.subRoles.includes("admin")));
}

const PASSWORD_REQUIREMENTS_TEXT = "8 caractères minimum, avec 1 majuscule, 1 minuscule, 1 chiffre et 1 caractère spécial.";
const PASSWORD_SPECIAL_RE = /[^A-Za-z0-9]/;
function isStrongPassword(password) {
  return typeof password === "string" && password.length >= 8 &&
    /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && PASSWORD_SPECIAL_RE.test(password);
}

function isProfessorUser(user = currentUser) {
  return !!user && user.role === "professeur";
}

function analyticsSafeText(value, fallback = "") {
  return String(value ?? fallback).slice(0, 160);
}
function analyticsTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "Inconnu"; } catch (_) { return "Inconnu"; }
}
function analyticsLocale() {
  try { return navigator.language || "Inconnu"; } catch (_) { return "Inconnu"; }
}
function analyticsDevice() {
  const w = Number(window.innerWidth || 0);
  return w < 700 ? "mobile" : (w < 1100 ? "tablet" : "desktop");
}
function analyticsSessionIdForUser(user) {
  if (!user?.id) return null;
  if (window._analyticsSessionUserId === user.id && window._analyticsSessionId) return window._analyticsSessionId;
  window._analyticsSessionUserId = user.id;
  window._analyticsSessionId = `${user.id}_${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
  return window._analyticsSessionId;
}
async function recordAnalyticsEvent(type, payload = {}) {
  if (!currentUser?.id) return;
  try {
    await addDoc(collection(db, "analytics_events"), {
      type: analyticsSafeText(type),
      userId: analyticsSafeText(currentUser.id),
      username: analyticsSafeText(currentUser.username || currentUser.id),
      role: analyticsSafeText(currentUser.role || ""),
      timestamp: Date.now(),
      timezone: analyticsTimezone(),
      locale: analyticsLocale(),
      device: analyticsDevice(),
      countryHint: analyticsLocale().split("-")[1] || "",
      ...payload
    });
  } catch (error) {
    console.debug("Analytics indisponibles :", error?.code || error?.message || error);
  }
}
async function startAnalyticsSession(user) {
  if (!user?.id) return;
  const sessionId = analyticsSessionIdForUser(user);
  const shouldStart = !window._analyticsHeartbeatTimer;
  try {
    await setDoc(doc(db, "analytics_sessions", sessionId), {
      userId: analyticsSafeText(user.id),
      username: analyticsSafeText(user.username || user.id),
      role: analyticsSafeText(user.role || ""),
      ...(shouldStart ? { startedAt: Date.now() } : {}),
      lastSeenAt: Date.now(),
      timezone: analyticsTimezone(),
      locale: analyticsLocale(),
      device: analyticsDevice(),
      countryHint: analyticsLocale().split("-")[1] || ""
    }, { merge: true });
  } catch (error) {
    console.debug("Session analytics indisponible :", error?.code || error?.message || error);
  }
  if (window._analyticsHeartbeatTimer) clearInterval(window._analyticsHeartbeatTimer);
  window._analyticsHeartbeatTimer = setInterval(async () => {
    if (!currentUser?.id || currentUser.id !== user.id) return;
    try { await updateDoc(doc(db, "analytics_sessions", sessionId), { lastSeenAt: Date.now() }); } catch (_) {}
  }, 60000);
  if (shouldStart) recordAnalyticsEvent("login", { sessionId });
}
async function endAnalyticsSession() {
  const id = window._analyticsSessionId;
  if (!id) return;
  if (window._analyticsHeartbeatTimer) clearInterval(window._analyticsHeartbeatTimer);
  window._analyticsHeartbeatTimer = null;
  try { await updateDoc(doc(db, "analytics_sessions", id), { lastSeenAt: Date.now(), endedAt: Date.now() }); } catch (_) {}
  window._analyticsSessionId = null;
  window._analyticsSessionUserId = null;
}
function initGoogleAnalytics() {
  if (!GA_MEASUREMENT_ID || _gaReady) return;
  _gaReady = true;
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  document.head.appendChild(script);
  window.dataLayer = window.dataLayer || [];
  function gtag(){ window.dataLayer.push(arguments); }
  window.gtag = gtag;
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID, { anonymize_ip: true, send_page_view: true });
}
function sendGoogleAnalyticsPageView(page) {
  if (!GA_MEASUREMENT_ID || typeof window.gtag !== "function") return;
  const safePage = analyticsSafeText(page || "accueil").replace(/[^a-z0-9_-]/gi, "_").slice(0, 80);
  window.gtag("event", "page_view_app", { page_name: safePage });
}


function isAdminOrHSUser(user = currentUser) {
  return !!user && (
    user.role === "admin" ||
    user.role === "HS" ||
    (Array.isArray(user.subRoles) && user.subRoles.includes("admin"))
  );
}

function getStreakRankingUsers() {
  if (!currentUser) return [];

  const allUsers = Array.from(window.usersMap.values());
  const me = window.usersMap.get(currentUser.username) || currentUser;
  if (!allUsers.some(u => u.id === me.id)) allUsers.push(me);

  if (isAdminOrHSUser()) {
    return allUsers.filter(u => !isProfessorUser(u));
  }

  const myClasseId = currentUser.classeId || me.classeId || null;
  const myEtabId = currentUser.etablissementId || me.etablissementId || null;

  if (!myClasseId) {
    return allUsers.filter(u => u.id === me.id);
  }

  return allUsers.filter(u => {
    if (!u || isProfessorUser(u) || u.classeId !== myClasseId) return false;
    if (myEtabId && u.etablissementId && u.etablissementId !== myEtabId) return false;
    return true;
  });
}

function getEffectiveStreak(user) {
  if (!user) return 0;
  const streak = Math.max(0, Number(user.streak) || 0);
  if (streak <= 0) return 0;
  const lastStreakDay = getUserLastStreakDay(user);
  if (!lastStreakDay) return streak;
  return daysBetweenStr(lastStreakDay, getTodayStr()) >= 2 ? 0 : streak;
}

function getStreakRankingRank(users, username) {
  const idx = users.findIndex(u => u && u.username === username);
  return idx === -1 ? null : idx + 1;
}

function renderStreakRankingRow(user, rank) {
  const name = user.displayName || user.username || "Utilisateur";
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";
  const streak = getEffectiveStreak(user);
  const isMe = user.id === currentUser?.id || user.username === currentUser?.username;
  const avatar = user.avatar
    ? `<img class="streak-ranking-avatar-image" src="${user.avatar}" alt="" loading="lazy">`
    : `<span class="streak-ranking-avatar-initials">${initials}</span>`;
  const badge = typeof getBadge === "function" ? getBadge(user) : "";

  return `
    <div class="streak-ranking-row${isMe ? " is-me" : ""}">
      <div class="streak-ranking-place">#${rank}</div>
      <div class="streak-ranking-avatar">${avatar}</div>
      <div class="streak-ranking-user">
        <div class="streak-ranking-name">${name}${badge}</div>
        <div class="streak-ranking-username">@${user.username || "—"}${isMe ? " · Toi" : ""}</div>
      </div>
      <div class="streak-ranking-score">
        <span class="streak-mini-flame" aria-hidden="true"></span>
        <strong>${streak} ${streak === 1 ? "jour" : "jours"}</strong>
      </div>
    </div>`;
}

window.renderStreakRanking = function renderStreakRanking() {
  const list = document.getElementById("streak-ranking-list");
  const scope = document.getElementById("streak-ranking-scope");
  if (!list) return;

  const users = getStreakRankingUsers()
    .filter(Boolean)
    .sort((a, b) => {
      const streakDiff = getEffectiveStreak(b) - getEffectiveStreak(a);
      if (streakDiff !== 0) return streakDiff;
      return String(a.displayName || a.username || "").localeCompare(String(b.displayName || b.username || ""), "fr", { sensitivity: "base" });
    });

  const globalScope = isAdminOrHSUser();
  if (scope) {
    if (globalScope) {
      scope.textContent = "Tous les utilisateurs";
    } else {
      const classe = currentUser?.classeId ? window.classesMap.get(currentUser.classeId) : null;
      const classeName = classe?.nom || classe?.name || currentUser?.classeId || "ta classe";
      scope.textContent = `Classe : ${classeName}`;
    }
  }

  if (!users.length) {
    list.innerHTML = `<div class="streak-ranking-empty">Aucun membre à afficher pour le moment.</div>`;
    return;
  }

  list.innerHTML = users.map((user, index) => renderStreakRankingRow(user, index + 1)).join("");

  const meRank = getStreakRankingRank(users, currentUser?.username);
  const rankEl = document.getElementById("home-streak-rank");
  if (rankEl) rankEl.textContent = meRank ? `#${meRank} au classement` : "Non classé";
};

window.updateStreakRankingUI = function updateStreakRankingUI() {
  if (!currentUser) return;
  const users = getStreakRankingUsers()
    .filter(Boolean)
    .sort((a, b) => {
      const diff = getEffectiveStreak(b) - getEffectiveStreak(a);
      if (diff !== 0) return diff;
      return String(a.username || "").localeCompare(String(b.username || ""));
    });
  const rank = getStreakRankingRank(users, currentUser.username);
  const rankEl = document.getElementById("home-streak-rank");
  if (rankEl) rankEl.textContent = rank ? `#${rank} au classement` : "Non classé";
  if (document.getElementById("page-classement")?.classList.contains("active")) {
    renderStreakRanking();
  }
};

window.openStreakRanking = function openStreakRanking() {
  if (!currentUser) return;
  closeDrawer();
  closeDropdown();
  window.location.hash = "#classement";
};

async function loadMaps() {
try {
  const etabsSnap = await getDocs(collection(db, 'etablissements'));
  etabsSnap.forEach(d => {
    window.etabsMap.set(d.id, d.data());
  });
  
  const classesSnap = await getDocs(collection(db, 'classes'));
  classesSnap.forEach(d => {
    window.classesMap.set(d.id, d.data());
  });
  
  console.log('✅ Maps chargées :', {
    etablissements: window.etabsMap.size,
    classes: window.classesMap.size
  });
} catch (error) {
  console.error('Erreur lors du chargement des Maps :', error);
}
}

window.getUserVisibilityFilters = () => {
if (!currentUser) return { classeId: null, etablissementId: null, isAdminOrHS: false };

const isAdminOrHS = currentUser.role === 'admin' || currentUser.role === 'HS' || 
                   (currentUser.subRoles && currentUser.subRoles.includes('admin'));

return {
  classeId: currentUser.classeId || null,
  etablissementId: currentUser.etablissementId || null,
  isAdminOrHS: isAdminOrHS
};
};

window.canContactUser = (targetUser) => {
  if (!currentUser || !targetUser) return false;
  if (targetUser.username === currentUser.username) return false;
  if (targetUser.role === 'HS') return false;

  const myIsAdminOrHS = currentUser.role === 'admin' || currentUser.role === 'HS' ||
                       (currentUser.subRoles && currentUser.subRoles.includes('admin'));
  if (myIsAdminOrHS) return true;

  const targetIsAdmin = targetUser.role === 'admin' || (targetUser.subRoles && targetUser.subRoles.includes('admin'));
  if (targetIsAdmin) return true;

  if (!currentUser.etablissementId || !currentUser.classeId) return false;
  if (!targetUser.etablissementId || !targetUser.classeId) return false;

  return targetUser.etablissementId === currentUser.etablissementId &&
         targetUser.classeId === currentUser.classeId;
};

window._maintenanceActive = false;
window._maintenanceMessage = "";

window.applyMaintenanceUI = () => {
  const overlay = document.getElementById("view-maintenance");
  const banner = document.getElementById("maintenance-admin-banner");
  if (!overlay) return;

  if (!currentUser) {
    overlay.classList.remove("active");
    if (banner) banner.classList.remove("show");
    return;
  }

  const isAdmin = currentUser.role === 'admin' || (currentUser.subRoles && currentUser.subRoles.includes('admin'));

  if (window._maintenanceActive && !isAdmin) {
    const msgEl = document.getElementById("maintenance-message");
    if (msgEl) msgEl.innerText = window._maintenanceMessage || "DnB Reviz est actuellement en maintenance. Nous serons de retour très bientôt, merci de ta patience !";
    overlay.classList.add("active");
    if (banner) banner.classList.remove("show");
  } else {
    overlay.classList.remove("active");
    if (banner) banner.classList.toggle("show", !!(window._maintenanceActive && isAdmin));
  }
};

onSnapshot(doc(db, "settings", "site"), snap => {
  const data = snap.exists() ? snap.data() : {};
  window._maintenanceActive = !!data.maintenanceMode;
  window._maintenanceMessage = data.maintenanceMessage || "";
  window.applyMaintenanceUI();

  const tog = document.getElementById("adm-maintenance-toggle");
  if (tog) tog.checked = window._maintenanceActive;
  const msgInput = document.getElementById("adm-maintenance-message");
  if (msgInput && document.activeElement !== msgInput) msgInput.value = window._maintenanceMessage;
}, err => console.error("Erreur d'écoute du mode maintenance :", err));

window.saveMaintenanceSettings = async (activate) => {
  const isAdmin = isAdminUser(currentUser);
  if (!isAdmin) { showToast("Accès non autorisé."); return; }

  const msg = document.getElementById("adm-maintenance-message")?.value.trim() || "";
  try {
    await setDoc(doc(db, "settings", "site"), {
      maintenanceMode: !!activate,
      maintenanceMessage: msg,
      updatedBy: currentUser.username,
      updatedAt: Date.now()
    }, { merge: true });
    showToast(activate ? "Mode maintenance activé ✓" : "Mode maintenance désactivé ✓");
  } catch (e) {
    console.error(e);
    showToast("Erreur lors de la mise à jour du mode maintenance.");
  }
};

window.sendAdminPushNotification = async () => {
  const isAdmin = currentUser && (currentUser.role === 'admin' || (currentUser.subRoles && currentUser.subRoles.includes('admin')));
  if (!isAdmin) { showToast("Accès non autorisé."); return; }

  const title = document.getElementById("adm-push-title")?.value.trim() || "";
  const body  = document.getElementById("adm-push-body")?.value.trim() || "";
  const statusEl = document.getElementById("adm-push-status");
  const btn = document.getElementById("adm-push-send-btn");

  if (!title || !body) {
    showToast("Renseigne un titre et un message.");
    return;
  }

  if (btn) { btn.disabled = true; btn.innerText = "Envoi en cours..."; }
  if (statusEl) statusEl.innerText = "";

  try {
    const res = await fetch(ADMIN_PUSH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: "d0900059-082b-458f-9bb1-8798546b8010",
        title,
        body,
        url: "https://dnb95.github.io/home/"
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Erreur serveur");

    if (data.sent > 0) {
      showToast(`Notification envoyée à ${data.sent} abonné(s) ✓`);
      if (statusEl) statusEl.innerText = `${data.sent} notification(s) envoyée(s) ✓`;
    } else {
      showToast("Aucun utilisateur n'a activé les notifications push.");
      if (statusEl) statusEl.innerText = "Aucun utilisateur n'est actuellement abonné aux notifications push.";
    }

    document.getElementById("adm-push-title").value = "";
    document.getElementById("adm-push-body").value = "";
  } catch (e) {
    console.error("Erreur notification push :", e);
    showToast("Erreur lors de l'envoi de la notification.");
    if (statusEl) statusEl.innerText = e?.message ? `Erreur : ${e.message}` : "Une erreur est survenue lors de l'envoi.";
  } finally {
    if (btn) { btn.disabled = false; btn.innerText = "Envoyer la notification"; }
  }
};

async function migrateOldPosts() {
try {
  const postsSnap = await getDocs(collection(db, "posts"));
  let updated = 0;
  for (const doc of postsSnap.docs) {
    const data = doc.data();
    if (data.type === "annonce") continue;
    if (!data.etablissementId || !data.classeId) {
      const author = window.usersMap.get(data.authorId);
      if (author && author.etablissementId && author.classeId) {
        await updateDoc(doc.ref, {
          etablissementId: author.etablissementId,
          classeId: author.classeId
        });
        updated++;
      }
    }
  }
  if (updated > 0) {
    localStorage.setItem("dnb_migration_posts_done", "true");
    showToast(`✅ ${updated} posts anciens ont été mis à jour avec les infos de classe !`);
    console.log(`Migration terminée : ${updated} posts mis à jour.`);
  } else {
    localStorage.setItem("dnb_migration_posts_done", "true");
    console.log("Aucun post à migrer.");
  }
} catch (e) {
  console.error("Erreur lors de la migration :", e);
}
}
window.formatNumber = (num) => {
  if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (num >= 10000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return num.toString();
};

window.getBadge = (userObj) => {
  return (userObj && userObj.isVerified) ? `<img src="https://cdn.prod.website-files.com/6214eaa668d0de27c3ea80cf/652fd0e960df145545f25f12_Pastille%20bleu%20certification%20instagram.png" class="verified-icon" title="Compte certifié">` : '';
};

window.updateUnreadDots = (count) => {
  document.querySelectorAll('.nav-unread-dot').forEach(d => {
    d.style.display = count > 0 ? 'inline-block' : 'none';
  });
};

function loadTheme() {
  const dark = localStorage.getItem("dnb_theme") === "dark";
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const t = document.getElementById("tog-dark");
  if(t) t.checked = dark;
}
loadTheme();

window.applyTheme = (dark) => {
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  localStorage.setItem("dnb_theme", dark ? "dark" : "light");
};

function loadAnimationsSetting() {
  const noAnim = localStorage.getItem("dnb_no_transitions") === "true";
  document.body.classList.toggle("no-transitions", noAnim);
  const tog = document.getElementById("tog-animations");
  if(tog) tog.checked = !noAnim;
}
loadAnimationsSetting();

window.toggleAnimations = (enabled) => {
  document.body.classList.toggle("no-transitions", !enabled);
  localStorage.setItem("dnb_no_transitions", (!enabled).toString());
  showToast(enabled ? "Animations activées ✨" : "Animations désactivées ⚡");
};

window.showToast = (msg) => {
  const t = document.getElementById("toast");
  t.innerText = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 3000);
};

onSnapshot(collection(db, "users"), snap => {
  snap.forEach(d => {
    const u = d.data();
    window.usersMap.set(u.username, { id: d.id, ...u });
    if (currentUser && u.username === currentUser.username) {
      Object.assign(currentUser, { id: d.id, ...u });
    }
  });
  
  if (currentUser) {
    updateStreakRankingUI();
  }

  if (document.getElementById("page-cours").classList.contains("active")) loadCoursFeed();
  if (document.getElementById("page-fichesrev").classList.contains("active")) loadFRFeed();
  if (document.getElementById("page-quiz").classList.contains("active")) loadQuizFeed();
  
  if (window._currentViewedUser) {
    renderPublicProfile(window._currentViewedUser.username);
    if (window._pubTabActive === 'likes') renderPubLikes();
  }
  
  if (currentUser) {
    const myBadge = getBadge(currentUser);
    document.getElementById("drop-name").innerHTML = (currentUser.displayName || currentUser.username) + myBadge;
    document.getElementById("drawer-name").innerHTML = (currentUser.displayName || currentUser.username) + myBadge;
  }
});

window.addEventListener("hashchange", handleHashChange);

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(handleHashChange, 50);
  if (!localStorage.getItem('dnb_cookie_consent')) {
    document.getElementById('cookie-banner').style.display = 'flex';
  }
});

window.handleCookies = (accept) => {
  localStorage.setItem('dnb_cookie_consent', accept ? 'true' : 'false');
  document.getElementById('cookie-banner').style.display = 'none';
  if (accept) {
     console.log("Google Analytics activé");
  }
};


function formatStatsDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
function startOfLocalDay(date = new Date()) { const d = new Date(date); d.setHours(0,0,0,0); return d; }
function statsDateKey(ts) { return new Date(ts).toLocaleDateString("fr-CA"); }
function destroyStatsCharts() { Object.values(window._statisticsCharts || {}).forEach(chart => { try { chart.destroy(); } catch (_) {} }); window._statisticsCharts = {}; }
function chartDefaults() {
  const ink = getComputedStyle(document.body).color;
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--ink-m').trim() || ink;
  return { responsive:true, maintainAspectRatio:false,
    interaction:{mode:'index',intersect:false},
    plugins:{ legend:{display:true,labels:{color:ink,usePointStyle:true,boxWidth:8,padding:16}}, tooltip:{backgroundColor:'rgba(20,20,24,.92)',padding:10,cornerRadius:10,titleColor:'#fff',bodyColor:'#fff',displayColors:true} },
    scales:{ x:{ticks:{color:muted,maxRotation:0},grid:{display:false}}, y:{beginAtZero:true,ticks:{precision:0,color:muted},grid:{color:'rgba(127,127,127,.12)'}} }
  };
}
const STATS_CHART_COLORS = ['#007aff','#5856d6','#34c759','#ff9500','#ff3b30','#af52de','#5ac8fa'];
function statsPalette(n){ return Array.from({length:n},(_,i)=>STATS_CHART_COLORS[i % STATS_CHART_COLORS.length]); }
function makeDoughnutChart(canvasId, labels, values, legendId, totalId){
  const canvas=document.getElementById(canvasId); if(!canvas || !window.Chart) return;
  const safeVals=values.map(v=>Number(v)||0), total=safeVals.reduce((a,b)=>a+b,0); const colors=statsPalette(labels.length);
  const center=document.getElementById(totalId); if(center) center.textContent=total;
  const chart=new Chart(canvas,{type:'doughnut',data:{labels,datasets:[{data:safeVals,backgroundColor:colors,borderWidth:0,hoverOffset:4}]},options:{responsive:true,maintainAspectRatio:false,cutout:'72%',plugins:{legend:{display:false},tooltip:{callbacks:{label:(ctx)=>`${ctx.label}: ${ctx.raw}`}}}}});
  const legend=document.getElementById(legendId); if(legend){ legend.innerHTML=labels.map((label,i)=>`<div class="stats-legend-item"><div class="stats-legend-label"><span class="stats-legend-dot" style="background:${colors[i]}"></span><span class="stats-legend-name">${esc(label)}</span></div><span class="stats-legend-value">${safeVals[i]}</span></div>`).join(''); }
  return chart;
}
function buildHourlyConnectionData(events) {
  const arr=Array(24).fill(0);
  events.filter(e=>e.type==="login").forEach(e=>{ const h=new Date(e.timestamp).getHours(); if(h>=0&&h<24) arr[h]++; });
  return arr;
}
function buildDailyData(events, rangeDays) {
  const today=startOfLocalDay(), keys=[], map=new Map();
  for(let i=rangeDays-1;i>=0;i--){const d=new Date(today);d.setDate(d.getDate()-i);const k=statsDateKey(d.getTime());keys.push(k);map.set(k,{sessions:0,views:0});}
  events.forEach(e=>{const k=statsDateKey(e.timestamp);if(!map.has(k))return;if(e.type==="login")map.get(k).sessions++;if(e.type==="page_view")map.get(k).views++;});
  return {labels:keys.map(k=>new Date(`${k}T00:00:00`).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"})),sessions:keys.map(k=>map.get(k).sessions),views:keys.map(k=>map.get(k).views)};
}
function buildConcurrentByHour(sessions) {
  const arr=Array(24).fill(0);
  for(let hour=0;hour<24;hour++){arr[hour]=sessions.reduce((count,s)=>{const start=Number(s.startedAt||0),end=Number(s.endedAt||s.lastSeenAt||start);if(!start)return count;const d=new Date(start);d.setHours(hour,30,0,0);const t=d.getTime();return(start<=t&&end>=t)?count+1:count;},0);}
  return arr;
}
window.renderStatisticsUsers=()=> {
  const tb=document.getElementById("stats-users-tbody"); if(!tb)return;
  const search=(document.getElementById("stats-user-search")?.value||"").trim().toLowerCase();
  const countEl=document.getElementById("stats-user-count");
  if(countEl) countEl.textContent=`${(window._statisticsCache.users||[]).length} utilisateurs`;
  const users=(window._statisticsCache.users||[]).filter(u=>!search||String(u.username||"").toLowerCase().includes(search)||String(u.role||"").toLowerCase().includes(search));
  if(!users.length){tb.innerHTML='<tr><td colspan="6" class="stats-empty">Aucun utilisateur trouvé.</td></tr>';return;}
  tb.innerHTML=users.slice(0,500).map(u=>`<tr><td><strong>@${esc(u.username||u.id||"—")}</strong></td><td>${esc(u.role||"—")}</td><td>${formatStatsDate(u.lastLogin)}</td><td>${u.sessions||0}</td><td>${esc(u.lastPage||"—")}</td><td>${esc([u.timezone,u.countryHint].filter(Boolean).join(" · ")||"—")}</td></tr>`).join("");
};
function renderStatisticsTimezones(users){
  const wrap=document.getElementById("stats-timezones");if(!wrap)return;
  const counts=new Map();users.forEach(u=>{const tz=u.timezone||"Inconnu";counts.set(tz,(counts.get(tz)||0)+1);});
  const entries=Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,20);
  wrap.innerHTML=entries.length?entries.map(([tz,n])=>`<div class="stats-pill"><div><strong>${n}</strong><small>${esc(tz)}</small></div><span>◉</span></div>`).join(""):'<div class="stats-empty" style="width:100%;">Aucune donnée de lieu disponible.</div>';
}
function renderStatisticsPages(events){
  const el=document.getElementById("stats-pages");if(!el)return;
  const hiddenPages=new Set(["admin","statistiques"]);
  const counts=new Map();events.filter(e=>e.type==="page_view"&&!hiddenPages.has(String(e.page||"").toLowerCase())).forEach(e=>{const p=e.page||"inconnu";counts.set(p,(counts.get(p)||0)+1);});
  const rows=Array.from(counts.entries()).sort((a,b)=>b[1]-a[1]).slice(0,18),max=rows[0]?.[1]||1;
  el.innerHTML=rows.length?rows.map(([p,n])=>`<div class="stats-page-item"><strong>${esc(p)}</strong><div class="caption">${n} vue${n>1?"s":""}</div><div class="bar" style="width:${Math.max(8,Math.round(n/max*100))}%"></div></div>`).join(""):'<div class="stats-empty">Aucune donnée de navigation.</div>';
}
window.loadStatisticsDashboard=async()=>{
  if(!isAdminUser(currentUser)){showToast("Accès non autorisé.");window.location.hash="#accueil";return;}
  const status=document.getElementById("stats-status"),rangeDays=Math.max(1,Number(document.getElementById("stats-range")?.value||7)),since=Date.now()-rangeDays*86400000;
  if(status)status.textContent="Chargement des statistiques…";
  try{
    const [usersSnap,sessionsSnap,eventsSnap]=await Promise.all([
      getDocs(collection(db,"users")),
      getDocs(query(collection(db,"analytics_sessions"),where("startedAt",">=",since))),
      getDocs(query(collection(db,"analytics_events"),where("timestamp",">=",since)))
    ]);
    const users=[],sessions=[],events=[];usersSnap.forEach(d=>users.push({id:d.id,...d.data()}));sessionsSnap.forEach(d=>sessions.push({id:d.id,...d.data()}));eventsSnap.forEach(d=>events.push({id:d.id,...d.data()}));
    const perUser=new Map();users.forEach(u=>perUser.set(u.id,{id:u.id,username:u.username||u.id,role:u.role||"—",sessions:0,lastLogin:0,lastPage:"—",timezone:"—",countryHint:""}));
    sessions.forEach(s=>{const u=perUser.get(s.userId)||{id:s.userId,username:s.username||s.userId,role:s.role||"—",sessions:0,lastLogin:0,lastPage:"—",timezone:s.timezone||"—",countryHint:s.countryHint||""};u.sessions++;u.lastLogin=Math.max(u.lastLogin||0,Number(s.startedAt||0));u.timezone=s.timezone||u.timezone;u.countryHint=s.countryHint||u.countryHint;perUser.set(s.userId,u);});
    events.filter(e=>e.type==="login").forEach(e=>{const u=perUser.get(e.userId)||{id:e.userId,username:e.username||e.userId,role:e.role||"—",sessions:0,lastLogin:0,lastPage:"—",timezone:e.timezone||"—",countryHint:e.countryHint||""};u.lastLogin=Math.max(u.lastLogin||0,Number(e.timestamp||0));u.timezone=e.timezone||u.timezone;u.countryHint=e.countryHint||u.countryHint;perUser.set(e.userId,u);});
    events.filter(e=>e.type==="page_view").forEach(e=>{const u=perUser.get(e.userId);if(u&&Number(e.timestamp||0)>=Number(u.lastLogin||0))u.lastPage=e.page||u.lastPage;});
    const userRows=Array.from(perUser.values()).sort((a,b)=>(b.lastLogin||0)-(a.lastLogin||0));
    const hourly=buildHourlyConnectionData(events),concurrent=buildConcurrentByHour(sessions),daily=buildDailyData(events,rangeDays);
    const liveCutoff=Date.now()-3*60*1000,live=sessions.filter(s=>Number(s.lastSeenAt||0)>=liveCutoff&&!s.endedAt).length,views=events.filter(e=>e.type==="page_view").length,peak=Math.max(0,...concurrent);
    window._statisticsCache={users:userRows,sessions,events,hourly,concurrent,daily};
    document.getElementById("stats-kpi-users").textContent=users.length;
    document.getElementById("stats-kpi-sessions").textContent=sessions.length;
    document.getElementById("stats-kpi-logins").textContent=events.filter(e=>e.type==="login").length;
    document.getElementById("stats-kpi-peak").textContent=peak;
    document.getElementById("stats-kpi-live").textContent=live;
    document.getElementById("stats-kpi-views").textContent=views;
    renderStatisticsUsers();renderStatisticsTimezones(userRows);renderStatisticsPages(events);destroyStatsCharts();
    if(window.Chart){
      const opts=chartDefaults();
      window._statisticsCharts.hourly=new Chart(document.getElementById("stats-hourly-chart"),{type:"bar",data:{labels:Array.from({length:24},(_,i)=>`${String(i).padStart(2,"0")}h`),datasets:[{label:"Connexions",data:hourly,backgroundColor:"rgba(0,122,255,.72)",borderRadius:7,borderSkipped:false,maxBarThickness:20}]},options:opts});
      window._statisticsCharts.concurrent=new Chart(document.getElementById("stats-concurrent-chart"),{type:"line",data:{labels:Array.from({length:24},(_,i)=>`${String(i).padStart(2,"0")}h`),datasets:[{label:"Connectés estimés",data:concurrent,borderColor:"#5856d6",backgroundColor:"rgba(88,86,214,.12)",pointRadius:2.5,pointHoverRadius:5,tension:.34,fill:true}]},options:opts});
      window._statisticsCharts.daily=new Chart(document.getElementById("stats-daily-chart"),{type:"line",data:{labels:daily.labels,datasets:[{label:"Sessions",data:daily.sessions,borderColor:"#007aff",backgroundColor:"rgba(0,122,255,.08)",pointRadius:2,tension:.3},{label:"Pages vues",data:daily.views,borderColor:"#34c759",backgroundColor:"rgba(52,199,89,.06)",pointRadius:2,tension:.3}]},options:opts});
      const roleCounts=new Map(),deviceCounts=new Map(); userRows.forEach(u=>{const role=u.role||"Inconnu";roleCounts.set(role,(roleCounts.get(role)||0)+1);}); sessions.forEach(ss=>{const device=ss.device||"Inconnu";deviceCounts.set(device,(deviceCounts.get(device)||0)+1);});
      window._statisticsCharts.roles=makeDoughnutChart("stats-role-chart",Array.from(roleCounts.keys()),Array.from(roleCounts.values()),"stats-role-legend","stats-role-total");
      window._statisticsCharts.devices=makeDoughnutChart("stats-device-chart",Array.from(deviceCounts.keys()),Array.from(deviceCounts.values()),"stats-device-legend",null);
    }
    if(status)status.textContent=`Données internes : ${rangeDays} jour${rangeDays>1?"s":""}. Dernière actualisation ${formatStatsDate(Date.now())}.`;
  }catch(error){console.error("Erreur statistiques :",error);if(status)status.textContent="Impossible de charger les statistiques. Vérifie les règles Firestore pour analytics_events et analytics_sessions.";showToast("Statistiques indisponibles.");}
};
function statisticsExportPayload(){return{generatedAt:new Date().toISOString(),rangeDays:Number(document.getElementById("stats-range")?.value||7),summary:{users:document.getElementById("stats-kpi-users")?.textContent||"0",sessions:document.getElementById("stats-kpi-sessions")?.textContent||"0",logins:document.getElementById("stats-kpi-logins")?.textContent||"0",peakConcurrent:document.getElementById("stats-kpi-peak")?.textContent||"0",liveNow:document.getElementById("stats-kpi-live")?.textContent||"0",pageViews:document.getElementById("stats-kpi-views")?.textContent||"0"},hourlyConnections:window._statisticsCache.hourly||[],concurrentByHour:window._statisticsCache.concurrent||[],daily:window._statisticsCache.daily||{},users:window._statisticsCache.users||[],sessions:window._statisticsCache.sessions||[],events:window._statisticsCache.events||[]};}
window.exportStatisticsJSON=()=>{if(!isAdminUser(currentUser))return showToast("Accès non autorisé.");const blob=new Blob([JSON.stringify(statisticsExportPayload(),null,2)],{type:"application/json;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`dnb-statistiques-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);};
window.exportStatisticsPDF=()=>{if(!isAdminUser(currentUser))return showToast("Accès non autorisé.");if(!window.jspdf?.jsPDF)return showToast("Le module PDF n'est pas disponible.");const{jsPDF}=window.jspdf,p=statisticsExportPayload(),doc=new jsPDF({unit:"mm",format:"a4"});doc.setFontSize(20);doc.text("DnB Reviz — Rapport statistiques",14,18);doc.setFontSize(10);doc.text(`Généré le ${new Date().toLocaleString("fr-FR")} · Période: ${p.rangeDays} jour(s)`,14,25);let y=35;doc.setFontSize(12);[`Utilisateurs connus : ${p.summary.users}`,`Sessions : ${p.summary.sessions}`,`Connexions : ${p.summary.logins}`,`Pic de connectés estimé : ${p.summary.peakConcurrent}`,`Connectés maintenant : ${p.summary.liveNow}`,`Pages vues : ${p.summary.pageViews}`].forEach(t=>{doc.text(t,14,y);y+=7;});y+=4;doc.setFontSize(14);doc.text("Connexions par heure",14,y);y+=7;doc.setFontSize(10);for(let i=0;i<24;i+=4){const row=[0,1,2,3].map(j=>{const h=i+j;return`${String(h).padStart(2,"0")}h: ${p.hourlyConnections[h]||0}`;}).join("    ");doc.text(row,14,y);y+=6;}y+=4;doc.setFontSize(14);doc.text("Utilisateurs",14,y);y+=7;doc.setFontSize(9);(p.users||[]).slice(0,30).forEach(u=>{const line=`@${u.username||u.id} · ${u.role||"—"} · ${formatStatsDate(u.lastLogin)} · ${u.sessions||0} session(s) · ${[u.timezone,u.countryHint].filter(Boolean).join(" · ")||"—"}`;const wrapped=doc.splitTextToSize(line,180);if(y>275){doc.addPage();y=18;}doc.text(wrapped,14,y);y+=5*wrapped.length;});doc.save(`dnb-statistiques-${new Date().toISOString().slice(0,10)}.pdf`);};

function handleHashChange() {
  let hash = window.location.hash.trim();
  if (!hash || hash === "#") {
    showInternalView('accueil');
    return;
  }

  if (hash.startsWith("#page-")) hash = "#" + hash.slice(6);

  const target = decodeURIComponent(hash.substring(1)).toLowerCase().trim();
  const internalTargets = new Set([
    'accueil', 'classement', 'cours', 'fichesrev', 'quiz', 'creerquiz',
    'messages', 'depot', 'pub-profil', 'profil', 'setting', 'admin', 'statistiques'
  ]);

  if (target === 'matieres') {
    showInternalView('accueil');
    return;
  }

  if (internalTargets.has(target)) {
    showInternalView(target);
    return;
  }

  if (target) renderPublicProfile(target);
  else showInternalView('accueil');
}

function showInternalView(target) {
  if (target === 'matieres') target = 'accueil';
  if (target === 'admin') {
    const isAdmin = currentUser && (currentUser.role === 'admin' || (currentUser.subRoles && currentUser.subRoles.includes('admin')));
    if (!isAdmin) { 
      showToast("Accès non autorisé."); 
      window.location.hash = "#accueil"; 
      return; 
    }
    syncAdminDashboardStats();
    syncAdminUsers();
    syncAdminMats();
    syncAdminEtablissements(); 
    syncAdminClasses();  
  }
  if (target === 'statistiques' && !isAdminUser(currentUser)) {
    showToast("Accès non autorisé.");
    window.location.hash = "#accueil";
    return;
  }

  document.querySelectorAll(".page-view").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".drawer-btn[data-tab]").forEach(b => b.classList.remove("active"));
  
  const page = document.getElementById(`page-${target}`);
  if (page) {
    page.classList.remove("active");
    void page.offsetWidth; 
    page.classList.add("active");
  }

  const tab = document.querySelector(`.nav-tab[data-target="${target}"]`);
  if (tab) tab.classList.add("active");

  const drawerBtn = document.querySelector(`.drawer-btn[data-tab="${target}"]`);
  if (drawerBtn) drawerBtn.classList.add("active");

  window.scrollTo({ top: 0, behavior: "smooth" });
  sendGoogleAnalyticsPageView(target);
  recordAnalyticsEvent("page_view", { page: analyticsSafeText(target) });

  if (target === 'messages') loadDMChats();
  if (target === 'quiz') loadQuizFeed();
  if (target === 'setting') { loadAIQuizHistory(); loadAnimationsSetting(); }
  if (target === 'cours') loadCoursFeed();
  if (target === 'fichesrev') loadFRFeed();
  if (target === 'accueil') {
    loadPinnedAnnonces();
    loadAnnonces();
    updateStreakRankingUI();
  }
  if (target === 'classement') {
    updateStreakRankingUI();
    renderStreakRanking();
  }
  if (target === 'depot') {
  setTimeout(initCharCounters, 100);}
  if (target === 'statistiques') loadStatisticsDashboard();
}

signInAnonymously(auth).then(async () => {
  const s = localStorage.getItem("dnb_reviz_session");
  if (s) {
    const cached = JSON.parse(s);
    hydrateSession(cached);
    try {
      const freshSnap = await getDoc(doc(db, "users", cached.id));
      if (freshSnap.exists()) {
        hydrateSession({ id: freshSnap.id, ...freshSnap.data() });
      }
    } catch(e) {
      console.error(e);
    }
  }
  handleHashChange();
}).catch(console.error);

window.handleLogin = async () => {
  const now = Date.now();
  if (loginLockedUntil > now) {
    const seconds = Math.ceil((loginLockedUntil - now) / 1000);
    showToast(`Trop de tentatives. Réessaie dans ${seconds}s.`);
    return;
  }

  const id  = document.getElementById("login-id").value.trim().toLowerCase();
  const pwd = document.getElementById("login-pwd").value.trim();
  if (!id || !pwd) {
    showToast("Remplis tous les champs.");
    return;
  }

  try {
    const q = query(collection(db, "users"), where("username", "==", id));
    const snap = await getDocs(q);
    if (snap.empty) {
      loginFailedAttempts += 1;
      if (loginFailedAttempts >= LOGIN_MAX_ATTEMPTS) {
        loginLockedUntil = Date.now() + LOGIN_LOCK_MS;
        loginFailedAttempts = 0;
      }
      showToast("Identifiant ou mot de passe incorrect.");
      return;
    }

    const d = snap.docs[0];
    const u = { id: d.id, ...d.data() };
    if (u.password !== pwd) {
      loginFailedAttempts += 1;
      if (loginFailedAttempts >= LOGIN_MAX_ATTEMPTS) {
        loginLockedUntil = Date.now() + LOGIN_LOCK_MS;
        loginFailedAttempts = 0;
      }
      showToast("Identifiant ou mot de passe incorrect.");
      return;
    }

    loginFailedAttempts = 0;
    loginLockedUntil = 0;
    hydrateSession(u);
  } catch (error) {
    console.error(error);
    showToast("Impossible de se connecter pour le moment.");
  }
};

document.getElementById("login-pwd").addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); });
document.getElementById("login-id").addEventListener("keydown", e => { if (e.key === "Enter") handleLogin(); });

window.handleLogout = async () => {
  const previousUser = currentUser;
  await endAnalyticsSession();
  currentUser = null;
  window.currentUser = null;

  try {
    localStorage.removeItem("dnb_reviz_session");
  } catch (error) {
    console.warn("Impossible de supprimer la session locale :", error);
  }

  try {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    const cleanup = withOneSignal(async (OneSignal) => {
      try {
        if (OneSignal.User?.PushSubscription?.optOut) {
          await OneSignal.User.PushSubscription.optOut();
        }
      } catch (error) {
        console.warn("Impossible de désactiver temporairement le Push à la déconnexion :", error);
      }

      try {
        if (OneSignal.logout) {
          await OneSignal.logout();
        }
      } catch (error) {
        console.warn("Impossible de déconnecter l'identité OneSignal :", error);
      }
    }, 1200);

    cleanup.catch(error => console.warn("Nettoyage OneSignal ignoré :", error));
  } catch (error) {
    console.warn("Nettoyage OneSignal indisponible :", error);
  }

  try {
    closeDropdown?.();
    closeDrawer?.();
  } catch (_) {}

  void previousUser;

  window.location.hash = "";
  window.location.reload();
};

async function seedSubjects() {
  const base = [
    { name: "Management", icon: "💼" },
    { name: "Sciences de Gestion", icon: "📊" },
    { name: "Droit et Économie", icon: "⚖️" },
    { name: "Philosophie", icon: "🦉" },
    { name: "Mathématiques", icon: "📐" },
    { name: "Histoire-Géographie", icon: "🌍" },
    { name: "Langues Vivantes", icon: "🗣️" },
    { name: "Spécialité MSGN", icon: "🚀" }
  ];
  for (const m of base) {
    await addDoc(collection(db, "subjects"), m);
  }
}

function displayNameFromId(id) {
  return id.split(/[\.\-_]/).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}

const STREAK_CONFIRM_MS = 60 * 1000;

window._streakTimer = null;
window._streakPersistTimer = null;
window._streakDayTimer = null;
window._streakState = null;
window._streakLastTickAt = 0;

function getTodayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysBetweenStr(dateStrA, dateStrB) {
  const a = new Date(`${dateStrA}T00:00:00`);
  const b = new Date(`${dateStrB}T00:00:00`);
  return Math.round((b - a) / 86400000);
}

function getDateFromTimestamp(timestamp) {
  if (!Number.isFinite(timestamp)) return null;
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function renderStreakBadge(streak, id) {
  return `<span id="${id}" style="background: #ff6b00; color:white; padding: 4px 12px; border-radius: 999px; font-size: 13px; font-weight:bold;">
  🔥 Série : ${streak} jours
</span>`;
}

function getStreakStorageKey(username) {
  return `dnb_streak_watch_${username || "guest"}`;
}

function getStoredStreakWatch(username, dayKey) {
  try {
    const raw = localStorage.getItem(getStreakStorageKey(username));
    if (!raw) return { dayKey, accumulatedMs: 0 };

    const data = JSON.parse(raw);
    if (data.dayKey !== dayKey) {
      return { dayKey, accumulatedMs: 0 };
    }

    return {
      dayKey,
      accumulatedMs: Math.max(0, Number(data.accumulatedMs) || 0)
    };
  } catch (_) {
    return { dayKey, accumulatedMs: 0 };
  }
}

function saveStreakWatch(state) {
  if (!currentUser || !state || state.confirmed || !state.dayKey) return;

  localStorage.setItem(getStreakStorageKey(currentUser.username), JSON.stringify({
    dayKey: state.dayKey,
    accumulatedMs: Math.max(0, Math.floor(state.accumulatedMs || 0))
  }));
}

function clearStreakWatch() {
  if (!currentUser) return;
  localStorage.removeItem(getStreakStorageKey(currentUser.username));
}

function parseStreakConfirmedAt(u) {
  const value = u?.lastStreakConfirmedAt;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value?.toMillis) return value.toMillis();
  if (value?.seconds) return value.seconds * 1000;
  return null;
}

function getUserLastStreakDay(u) {
  if (typeof u?.lastActiveDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(u.lastActiveDate)) {
    return u.lastActiveDate;
  }

  return getDateFromTimestamp(parseStreakConfirmedAt(u));
}

function updateStreakStatus(text) {
  const el = document.getElementById("home-streak-status");
  if (el) el.textContent = text || "";
}

function updateStreakBadgeUI(streak, options = {}) {
  if (!currentUser) return;

  const displayStreak = Number(options.displayStreak ?? streak) || 0;
  const isPending = !!options.pending;
  const homeStreak = document.getElementById("home-streak-count");

  currentUser.streak = Number(streak) || 0;

  if (homeStreak) {
    homeStreak.textContent = `${displayStreak} ${displayStreak > 1 ? "jours" : "jour"}`;
  }

  const card = document.getElementById("home-streak-card");
  if (card) card.classList.toggle("streak-pending", isPending);

  if (options.status) updateStreakStatus(options.status);
  updateStreakRankingUI();
}

function stopStreakTimer() {
  if (window._streakTimer) {
    clearInterval(window._streakTimer);
    window._streakTimer = null;
  }

  if (window._streakPersistTimer) {
    clearInterval(window._streakPersistTimer);
    window._streakPersistTimer = null;
  }
}

function stopStreakDayTimer() {
  if (window._streakDayTimer) {
    clearTimeout(window._streakDayTimer);
    window._streakDayTimer = null;
  }
}

function getPendingDisplayStreak() {

  return Math.max(0, Number(currentUser?.streak) || 0);
}

function getNextLocalMidnightMs() {
  const now = new Date();
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    0
  );
  return next.getTime();
}

function scheduleNextStreakDay() {
  stopStreakDayTimer();

  if (!currentUser) return;

  const delay = Math.max(1000, getNextLocalMidnightMs() - Date.now());

  window._streakDayTimer = setTimeout(() => {
    checkStreak(currentUser).catch(error => {
      console.error("Erreur lors du changement de journée de série :", error);
    });
  }, delay);
}

function startStreakMinuteTimer() {
  stopStreakTimer();

  if (!currentUser || !window._streakState?.pending) return;

  const state = window._streakState;
  const startedAt = Date.now();
  window._streakLastTickAt = startedAt;

  const tick = () => {
    if (!currentUser || !window._streakState?.pending) return;

    const today = getTodayStr();

    if (state.dayKey !== today) {
      saveStreakWatch(state);
      stopStreakTimer();
      checkStreak(currentUser).catch(error => {
        console.error("Erreur de recalcul de série après minuit :", error);
      });
      return;
    }

    const now = Date.now();
    const delta = Math.max(0, now - (window._streakLastTickAt || now));
    window._streakLastTickAt = now;

    if (document.visibilityState === "visible") {
      state.accumulatedMs += delta;
    }

    const remainingMs = Math.max(0, STREAK_CONFIRM_MS - state.accumulatedMs);
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    updateStreakStatus(
      `Encore ${remainingSeconds}s de présence aujourd'hui pour confirmer la flamme`
    );

    if (state.accumulatedMs >= STREAK_CONFIRM_MS) {
      stopStreakTimer();

      confirmPendingStreak().catch(error => {
        console.error("Erreur de confirmation de série :", error);
        updateStreakStatus("Impossible de confirmer la flamme pour le moment");
        saveStreakWatch(state);
      });
    }
  };

  window._streakTimer = setInterval(tick, 1000);
  window._streakPersistTimer = setInterval(() => saveStreakWatch(state), 5000);

  tick();
}

async function confirmPendingStreak() {
  const state = window._streakState;

  if (!currentUser || isProfessorUser(currentUser) || !state?.pending || state.confirming) return;

  const today = getTodayStr();


  if (state.dayKey !== today) {
    await checkStreak(currentUser);
    return;
  }

  state.confirming = true;

  const latestLastActiveDate = getUserLastStreakDay(currentUser);
  if (latestLastActiveDate === today) {
    state.pending = false;
    state.confirmed = true;
    clearStreakWatch();

    updateStreakBadgeUI(currentUser.streak, {
      displayStreak: Number(currentUser.streak) || 0,
      pending: false,
      status: "Flamme du jour déjà confirmée ✓"
    });

    scheduleNextStreakDay();
    return;
  }

  const lastStreakDay = getUserLastStreakDay(currentUser);
  const streakBeforeToday = Number(currentUser.streak) || 0;
  const continuesStreak = lastStreakDay && daysBetweenStr(lastStreakDay, today) === 1;
  const newStreak = continuesStreak
    ? Math.max(1, streakBeforeToday + 1)
    : 1;

  const newMax = Math.max(Number(currentUser.maxStreak) || 0, newStreak);
  const confirmedAt = Date.now();

  await updateDoc(doc(db, "users", currentUser.id), {
    streak: newStreak,
    maxStreak: newMax,
    lastActiveDate: today,
    lastStreakConfirmedAt: confirmedAt
  });

  currentUser.streak = newStreak;
  currentUser.maxStreak = newMax;
  currentUser.lastActiveDate = today;
  currentUser.lastStreakConfirmedAt = confirmedAt;

  saveSessionLocally(currentUser);
  clearStreakWatch();

  window._streakState = {
    pending: false,
    confirmed: true,
    dayKey: today,
    confirmedAt,
    accumulatedMs: 0
  };

  updateStreakBadgeUI(newStreak, {
    displayStreak: newStreak,
    pending: false,
    status: "Flamme du jour confirmée ✓"
  });

  scheduleNextStreakDay();
}

function animateStreakExtinguish(lostStreak) {
  const card = document.getElementById("home-streak-card");
  if (!card) return;

  const flame = card.querySelector(".duo-flame");
  card.classList.remove("streak-extinguishing");
  void card.offsetWidth;
  card.classList.add("streak-extinguishing");

  const message = card.querySelector(".streak-extinguish-message");
  if (message) {
    message.textContent = `Ta série de ${lostStreak} jours s'est éteinte`;
  }

  setTimeout(() => {
    card.classList.remove("streak-extinguishing");
    if (flame) flame.style.removeProperty("opacity");
  }, 2600);
}

async function breakStreakForMissedDay(u) {
  const lostStreak = Number(u.streak) || 0;

  if (lostStreak <= 0) {
    currentUser.streak = 0;
    return;
  }

  await updateDoc(doc(db, "users", u.id), {
    streak: 0,
    lastActiveDate: null,
    lastStreakConfirmedAt: null
  });

  currentUser.streak = 0;
  currentUser.lastActiveDate = null;
  currentUser.lastStreakConfirmedAt = null;

  saveSessionLocally(currentUser);

  if (lostStreak > 0) {
    animateStreakExtinguish(lostStreak);
  }

  return lostStreak;
}

async function checkStreak(u) {
  if (!u || !currentUser || currentUser.id !== u.id || isProfessorUser(currentUser)) {
    stopStreakTimer();
    stopStreakDayTimer();
    return;
  }

  stopStreakTimer();
  stopStreakDayTimer();

  const today = getTodayStr();
  let lastStreakDay = getUserLastStreakDay(u);

  if (!u.lastActiveDate && lastStreakDay) {
    u.lastActiveDate = lastStreakDay;
    currentUser.lastActiveDate = lastStreakDay;
  }

  const currentStreak = Math.max(0, Number(u.streak) || 0);

  if (!lastStreakDay || currentStreak <= 0) {
    const windowKey = `day:${today}`;
    const storedWatch = getStoredStreakWatch(u.username, windowKey);

    window._streakState = {
      pending: true,
      confirmed: false,
      dayKey: today,
      windowKey,
      accumulatedMs: storedWatch.accumulatedMs
    };

    updateStreakBadgeUI(0, {
      displayStreak: 1,
      pending: true,
      status: `Encore ${Math.max(1, Math.ceil((STREAK_CONFIRM_MS - storedWatch.accumulatedMs) / 1000))}s aujourd'hui pour obtenir la première flamme`
    });

    startStreakMinuteTimer();
    scheduleNextStreakDay();
    return;
  }

  const dayGap = daysBetweenStr(lastStreakDay, today);

  if (dayGap === 0) {
    clearStreakWatch();

    window._streakState = {
      pending: false,
      confirmed: true,
      dayKey: today,
      confirmedAt: parseStreakConfirmedAt(u),
      accumulatedMs: 0
    };

    updateStreakBadgeUI(currentStreak, {
      displayStreak: currentStreak,
      pending: false,
      status: "Flamme du jour confirmée ✓"
    });

    scheduleNextStreakDay();
    return;
  }

  if (dayGap === 1) {
    const windowKey = `day:${today}`;
    const storedWatch = getStoredStreakWatch(u.username, windowKey);

    window._streakState = {
      pending: true,
      confirmed: false,
      dayKey: today,
      windowKey,
      accumulatedMs: storedWatch.accumulatedMs
    };

    updateStreakBadgeUI(currentStreak, {
      displayStreak: currentStreak,
      pending: true,
      status: `Encore ${Math.max(1, Math.ceil((STREAK_CONFIRM_MS - storedWatch.accumulatedMs) / 1000))}s aujourd'hui pour gagner la flamme du jour`
    });

    startStreakMinuteTimer();
    scheduleNextStreakDay();
    return;
  }

  const lostStreak = await breakStreakForMissedDay(u);
  const windowKey = `day:${today}`;
  const storedWatch = getStoredStreakWatch(u.username, windowKey);

  window._streakState = {
    pending: true,
    confirmed: false,
    dayKey: today,
    windowKey,
    accumulatedMs: storedWatch.accumulatedMs,
    lostStreak: lostStreak || 0
  };

  updateStreakBadgeUI(0, {
    displayStreak: 1,
    pending: true,
    status: `Nouvelle série : encore ${Math.max(1, Math.ceil((STREAK_CONFIRM_MS - storedWatch.accumulatedMs) / 1000))}s aujourd'hui`
  });

  startStreakMinuteTimer();
  scheduleNextStreakDay();
}

function hydrateSession(u) {
  window.currentUser = u;
  saveSessionLocally(u);
  updateRichTextToolbarVisibility();
  initGoogleAnalytics();
  startAnalyticsSession(u);
  registerOneSignalPushListener();

  document.getElementById("view-login").style.display = "none";
  document.getElementById("view-app").style.display = "block";
  const streakCard = document.getElementById("home-streak-card");
  if (streakCard) streakCard.style.display = isProfessorUser(u) ? "none" : "";
  checkStreak(u).catch(error => console.error("Erreur du système de série :", error));
  window.applyMaintenanceUI();
  loadTheme();

  setAvatar(u.avatar, u.displayName || u.username);
  
  const myBadge = getBadge(u);
  document.getElementById("drop-name").innerHTML  = (u.displayName || u.username) + myBadge;
  document.getElementById("drawer-name").innerHTML  = (u.displayName || u.username) + myBadge;
  
  document.getElementById("drop-role").innerText  = u.role;
  document.getElementById("prof-id").value        = u.username;
  document.getElementById("prof-display").value   = u.displayName || u.username;

  document.getElementById("prof-bio-input").value      = u.bio || "";
  document.getElementById("prof-insta-input").value    = u.instagram || "";
  document.getElementById("prof-linkedin-input").value = u.linkedin || "";
  document.getElementById("prof-banner-input").value   = u.banner || "";
  loadMaps().then(() => {
  const etabNom = u.etablissementId ? (window.etabsMap.get(u.etablissementId)?.nom || u.etablissementId) : "Non attribué";
  const classeNom = u.classeId ? (window.classesMap.get(u.classeId)?.nom || u.classeId) : "Non attribuée";
  

});
  
  const isAdmin  = u.role === "admin" || (u.subRoles && u.subRoles.includes("admin"));
  const groupTiktok = document.getElementById("group-tiktok");
  if (groupTiktok && isAdmin) {
    groupTiktok.classList.remove("hidden");
    document.getElementById("prof-tiktok-input").value = u.tiktok || "";
  }

  if (document.getElementById("tog-allow-msgs")) {
    document.getElementById("tog-allow-msgs").checked = u.allowMessages !== false;
  }
  if (document.getElementById("tog-email-notif")) {
    document.getElementById("tog-email-notif").checked = !!u.emailNotifs;
  }
  if (document.getElementById("tog-push-notif")) {
    setPushToggleState(false);
    syncOneSignalUser(u).catch(error => console.error("Erreur de synchronisation Push :", error));
  }
  if (document.getElementById("setting-email")) {
    document.getElementById("setting-email").value = u.email || "";
  }

  const canDepot = u.role === "professeur" || u.role === "admin" || u.role === "HS" || (u.subRoles && (u.subRoles.includes("volontaire") || u.subRoles.includes("admin")));

  document.getElementById("tab-admin").classList.toggle("hidden", !isAdmin);
  document.getElementById("tab-statistiques").classList.toggle("hidden", !isAdmin);
  document.getElementById("tab-depot").classList.toggle("hidden", !canDepot);
  document.getElementById("tab-creer-quiz").classList.toggle("hidden", !canDepot);
  
  document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden", !isAdmin));

  const drawerDepot = document.getElementById("drawer-depot");
  const drawerAdmin = document.getElementById("drawer-admin");
  const drawerStats = document.getElementById("drawer-statistiques");
  const drawerCreerQuiz = document.getElementById("drawer-creer-quiz");
  
  if (drawerDepot) drawerDepot.classList.toggle("hidden", !canDepot);
  if (drawerCreerQuiz) drawerCreerQuiz.classList.toggle("hidden", !canDepot);
  if (drawerAdmin) drawerAdmin.classList.toggle("hidden", !isAdmin);
  if (drawerStats) drawerStats.classList.toggle("hidden", !isAdmin);

  document.getElementById("drawer-role").innerText = u.role;
  setDrawerAvatar(u.avatar, u.displayName || u.username);

  if (u.isTempPassword) openModal("m-force-pwd");

  loadMaps().then(() => {
    updateStreakRankingUI();
  });
  loadMatieres();
  syncContrib();
  
  if (isAdmin) {
    syncAdminDashboardStats();
    syncAdminUsers();
    syncAdminMats();
  }
  
  loadAnnonces();
  loadPinnedAnnonces();
  loadCoursFeed();
  loadFRFeed();
  loadDMChats(); 
if (document.getElementById("page-quiz").classList.contains("active")) {
  loadQuizFeed();
}

if (isAdmin) {
  const migrationDone = localStorage.getItem("dnb_migration_posts_done");
  if (!migrationDone) {
    setTimeout(() => {
      migrateOldPosts();
    }, 2000);
  }
}
}
function setAvatar(data, name) {
  const initials = (name || "?").split(" ").map(p => p[0]).join("").substring(0, 2).toUpperCase();
  
  ["nav-initials", "prof-initials"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerText = initials;
  });
  
  ["nav-av-img", "prof-av-img"].forEach(id => {
    const el = document.getElementById(id); 
    if (!el) return;
    if (data) {
      el.src = data;
      el.style.display = "block";
    } else {
      el.style.display = "none";
    }
  });
  
  const navI = document.getElementById("nav-initials");
  if (navI) navI.style.display = data ? "none" : "block";
  const pI = document.getElementById("prof-initials");
  if (pI) pI.style.display = data ? "none" : "block";
}

function setDrawerAvatar(data, name) {
  const initials = (name || "?").split(" ").map(p => p[0]).join("").substring(0, 2).toUpperCase();
  const el = document.getElementById("drawer-initials");
  const img = document.getElementById("drawer-av-img");
  
  if (el) el.innerText = initials;
  if (img) {
    if (data) {
      img.src = data;
      img.style.display = "block";
      if (el) el.style.display = "none";
    } else {
      img.style.display = "none";
      if (el) el.style.display = "block";
    }
  }
}

window.handleForcePwd = async () => {
  const p = document.getElementById("force-pwd").value.trim();
  if (!isStrongPassword(p)) {
    showToast(PASSWORD_REQUIREMENTS_TEXT);
    return;
  }
  const emailInput = document.getElementById("force-email");
  const e = emailInput ? emailInput.value.trim() : "";

  const updates = { password: p, isTempPassword: false };
  if (e) updates.email = e;

  await updateDoc(doc(db, "users", currentUser.id), updates);
  currentUser.password = p; 
  currentUser.isTempPassword = false;
  if (e) currentUser.email = e;
  saveSessionLocally(currentUser);
  closeModal("m-force-pwd");
  showToast(e ? "Mot de passe mis à jour ✓ Pense à activer les notifications dans les paramètres." : "Mot de passe mis à jour ✓");

  // Le pré-prompt maison apparaît uniquement après la définition du mot de passe définitif.
  setTimeout(() => showPushConsentPrompt(currentUser), 250);
};

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneWebApp() {
  return window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;
}

async function showPushConsentPrompt(user = currentUser) {
  if (!user?.id) return;
  const modal = document.getElementById("m-push-consent");
  const text = document.getElementById("push-consent-text");
  if (!modal) return;

  const shownKey = `dnb_push_consent_prompt_${user.id}`;
  if (localStorage.getItem(shownKey) === "1") return;

  try {
    const state = await getOneSignalPushState();
    if (!state.supported || state.optedIn || state.permission === "denied") {
      localStorage.setItem(shownKey, "1");
      return;
    }
  } catch (error) {
    console.warn("État OneSignal indisponible pour le pré-prompt :", error);
  }

  if (text && isIOSDevice() && !isStandaloneWebApp()) {
    text.textContent = "Sur iPhone/iPad, ajoute d'abord DnB Reviz à l'écran d'accueil puis ouvre l'application depuis son icône. Tu pourras ensuite activer les notifications.";
  }

  modal.dataset.userId = String(user.id);
  modal.classList.add("active");
}

window.handlePushConsent = async (accepted) => {
  const modal = document.getElementById("m-push-consent");
  const userId = modal?.dataset.userId || currentUser?.id;
  closeModal("m-push-consent");

  if (!userId || !currentUser?.id) return;

  const shownKey = `dnb_push_consent_prompt_${userId}`;

  if (!accepted) {
    localStorage.setItem(shownKey, "1");
    return;
  }

  if (isIOSDevice() && !isStandaloneWebApp()) {
    showToast("Sur iPhone/iPad, ajoute DnB Reviz à l'écran d'accueil puis ouvre l'app pour activer les notifications.");
    return;
  }

  localStorage.setItem(shownKey, "1");

  try {
    await togglePushNotifs(true);
  } catch (error) {
    console.error("Activation Push depuis le pré-prompt impossible :", error);
  }
};

async function uploadToCloudinary(file) {
  if (!file) throw new Error("Fichier manquant");
  if (file.size > 25 * 1024 * 1024) throw new Error("Fichier trop volumineux");

  const fd = new FormData();
  fd.append("file", file);
  fd.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
  fd.append("resource_type", "auto");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/upload`, {
      method: "POST",
      body: fd,
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Cloudinary HTTP ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    if (!data.secure_url || !/^https:\/\//i.test(data.secure_url)) throw new Error("URL Cloudinary invalide");
    return data.secure_url;
  } finally {
    clearTimeout(timeout);
  }
}

window.uploadAvatar = (e) => {
  const file = e.target.files[0]; 
  if (!file) return;
  
  const r = new FileReader();
  r.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas"); 
      c.width = c.height = 140;
      c.getContext("2d").drawImage(img, 0, 0, 140, 140);
      const b64 = c.toDataURL("image/jpeg", 0.8);
      
      updateDoc(doc(db, "users", currentUser.id), { avatar: b64 }).then(() => {
        currentUser.avatar = b64;
        saveSessionLocally(currentUser);
        setAvatar(b64, currentUser.displayName); 
        showToast("Photo mise à jour ✓");
      });
    };
    img.src = ev.target.result;
  };
  r.readAsDataURL(file);
};

window.uploadMyBanner = async (e) => {
  const file = e.target.files[0]; 
  if (!file) return;
  
  showToast("Upload de la bannière en cours...");
  try {
    const url = await uploadToCloudinary(file);
    document.getElementById("prof-banner-input").value = url;
    showToast("Bannière chargée ✓ N'oublie pas d'Enregistrer");
  } catch (err) { 
    showToast("Erreur Cloudinary"); 
  }
};

window.saveProfile = async () => {
  const d        = document.getElementById("prof-display").value.trim();
  const bio      = document.getElementById("prof-bio-input").value.trim();
  const insta    = document.getElementById("prof-insta-input").value.trim();
  const linkedin = document.getElementById("prof-linkedin-input").value.trim();
  const banner   = document.getElementById("prof-banner-input").value.trim();
  const tkInput  = document.getElementById("prof-tiktok-input");
  const tiktok   = tkInput ? tkInput.value.trim() : "";

  if (!d) return;

  const updates = { displayName: d, bio, instagram: insta, linkedin, banner, tiktok };
  await updateDoc(doc(db, "users", currentUser.id), updates);
  
  Object.assign(currentUser, updates);
  saveSessionLocally(currentUser);
  
  const myBadge = getBadge(currentUser);
  document.getElementById("drop-name").innerHTML = d + myBadge;
  document.getElementById("drawer-name").innerHTML = d + myBadge;
  setAvatar(currentUser.avatar, d);
  setDrawerAvatar(currentUser.avatar, d);
  
  showToast("Profil enregistré ✓");
  syncContrib();
};

window.goToMyLikes = () => {
  if (!currentUser) return;
  window.location.hash = '#' + currentUser.username;
  setTimeout(() => {
    switchPubTab('likes');
  }, 400);
};

window.toggleAllowMsgs = async (val) => {
  await updateDoc(doc(db, "users", currentUser.id), { allowMessages: val });
  currentUser.allowMessages = val;
  saveSessionLocally(currentUser);
};

window.toggleEmailNotifs = async (val) => {
  await updateDoc(doc(db, "users", currentUser.id), { emailNotifs: val });
  currentUser.emailNotifs = val;
  saveSessionLocally(currentUser);
};

window.togglePushNotifs = async (enabled) => {
  const checkbox = document.getElementById("tog-push-notif");

  if (!currentUser) {
    setPushToggleState(false);
    return;
  }

  if (!enabled) {
    try {
      await withOneSignal(async (OneSignal) => {
        if (!OneSignal.Notifications.isPushSupported()) {
          throw new Error("PUSH_NOT_SUPPORTED");
        }

        await OneSignal.login(String(currentUser.id));
        registerOneSignalPushListener();

        if (OneSignal.User?.PushSubscription?.optOut) {
          await OneSignal.User.PushSubscription.optOut();
        }
      });

      const state = await getOneSignalPushState();
      setLocalPushState(false, state.subscriptionId || null);
      showToast("Notifications push désactivées");
    } catch (e) {
      console.error("Erreur de désactivation Push OneSignal :", e);
      setPushToggleState(true);
      showToast("Impossible de désactiver les notifications push.");
    }
    return;
  }

  try {
    await withOneSignal(async (OneSignal) => {
      if (!OneSignal.Notifications.isPushSupported()) {
        throw new Error("PUSH_NOT_SUPPORTED");
      }

      await OneSignal.login(String(currentUser.id));
      registerOneSignalPushListener();

      if (OneSignal.Notifications.permission !== "granted") {
        await OneSignal.Notifications.requestPermission();
      }

      if (OneSignal.Notifications.permission !== "granted") {
        throw new Error("PUSH_NOT_GRANTED");
      }

      if (OneSignal.User?.PushSubscription?.optIn) {
        await OneSignal.User.PushSubscription.optIn();
      }
    });

    const state = await waitForOneSignalSubscription(5000);
    const optedIn = !!state.optedIn;
    const subscriptionId = state.subscriptionId || null;

    if (!optedIn || !subscriptionId) {
      throw new Error("PUSH_NOT_GRANTED");
    }

    setLocalPushState(true, subscriptionId);
    showToast("Notifications push activées ✓");
  } catch (e) {
    console.error("Erreur Push OneSignal :", e);

    if (checkbox) checkbox.checked = false;

    if (e?.message === "PUSH_NOT_SUPPORTED") {
      showToast("Ton navigateur ne supporte pas les notifications push.");
    } else if (e?.message === "PUSH_NOT_GRANTED") {
      showToast("Notifications non activées. Autorise les notifications pour ce site dans les paramètres du navigateur.");
    } else if (e?.message === "ONESIGNAL_TIMEOUT") {
      showToast("Le service de notifications n'est pas disponible pour le moment.");
    } else {
      showToast("Erreur lors de la configuration des notifications push.");
    }
  }
};

window.saveEmailSettings = async () => {
  const e = document.getElementById("setting-email").value.trim();
  await updateDoc(doc(db, "users", currentUser.id), { email: e });
  currentUser.email = e;
  saveSessionLocally(currentUser);
  showToast("Adresse email sauvegardée ✓");
};

async function sendEmailNotif(type, receiverObj, extraParams) {
  if (!receiverObj.emailNotifs || !receiverObj.email) return;
  let templateId = type === 'message' ? 'template_ira8lxo' : 'template_uxyq7sp';
  emailjs.send("service_cza73j9", templateId, {
    username: receiverObj.displayName || receiverObj.username,
    sender: currentUser.displayName || currentUser.username,
    email: receiverObj.email,
    ...extraParams
  }).catch(console.error);
}

async function syncContrib() {
  const q1 = query(collection(db, "posts"), where("authorId", "==", currentUser.username));
  const q2 = query(collection(db, "quizzes"), where("authorId", "==", currentUser.username));
  const q3 = query(collection(db, "ai_quizzes"), where("authorId", "==", currentUser.username));
  
  const snap1 = await getDocs(q1);
  const snap2 = await getDocs(q2);
  const snap3 = await getDocs(q3);
  
  const el = document.getElementById("contrib-count"); 
  if (el) el.innerText = snap1.size + snap2.size + snap3.size;
}

window.changePassword = async () => {
  const p = document.getElementById("setting-pwd").value.trim(); 
  if (!isStrongPassword(p)) {
    showToast(PASSWORD_REQUIREMENTS_TEXT);
    return;
  }
  
  await updateDoc(doc(db, "users", currentUser.id), { password: p, isTempPassword: false });
  currentUser.password = p;
  saveSessionLocally(currentUser);
  document.getElementById("setting-pwd").value = "";
  showToast("Mot de passe changé ✓");
};

function loadMatieres() {
  onSnapshot(collection(db, "subjects"), (snap) => {
    const isAdmin = currentUser.role === "admin" || (currentUser.subRoles && currentUser.subRoles.includes("admin"));
    const mainGrid = document.getElementById("matieres-grid");
    const selDepot = document.getElementById("post-matiere");
    const selQuizCreate = document.getElementById("quiz-create-matiere");
    const selQuizIA = document.getElementById("quiz-ia-matiere");
    
    mainGrid.innerHTML = ""; 
    selDepot.innerHTML = ""; 
    selQuizCreate.innerHTML = ""; 
    selQuizIA.innerHTML = ""; 
    window.subjectsMap.clear();

    snap.forEach(d => {
      const m = d.data();
      window.subjectsMap.set(m.name, m.icon);

      mainGrid.innerHTML += `
        <div class="slider-matiere-card" onclick="openSubjectInMatieres('${esc(m.name)}')">
          ${isAdmin ? `<button class="card-del" onclick="event.stopPropagation();delMatiere('${d.id}')">✕</button>` : ""}
          <div>
            <div class="card-icon" style="font-size:36px;margin-bottom:14px;">${m.icon}</div>
            <div class="card-title" style="font-size:18px;font-weight:600;color:var(--ink);margin-bottom:6px;">${m.name}</div>
          </div>
          ${isAdmin ? `<button class="btn-ghost btn-sm" style="align-self:flex-start;margin-top:12px;" onclick="event.stopPropagation();editMatiere('${d.id}','${esc(m.name)}','${m.icon}')">✏️ Modifier</button>`
                   : `<span class="caption" style="color:var(--primary);font-weight:600;margin-top:auto;display:inline-block;">Consulter →</span>`}
        </div>`;
        
      const opt = `<option value="${esc(m.name)}">${m.icon} ${m.name}</option>`;
      selDepot.innerHTML += opt;
      selQuizCreate.innerHTML += opt;
      selQuizIA.innerHTML += opt;
    });
    selQuizIA.innerHTML += `<option value="autre">Autre (préciser...)</option>`;
  });
}
function sanitizeRichText(html) {
  const parser = new DOMParser();
  const source = parser.parseFromString(String(html || ""), "text/html");
  const allowed = new Set(["STRONG", "B", "EM", "I", "U", "SPAN", "FONT", "BR"]);
  const normalizeColor = value => {
    const v = String(value || "").trim().toLowerCase();
    if (!v) return "";
    if (/^#[0-9a-f]{3,8}$/.test(v) || /^(rgb|hsl)a?\([0-9a-z, .%()-]+\)$/.test(v) || /^[a-z]{3,20}$/.test(v)) return v;
    return "";
  };

  const cleanNode = node => {
    Array.from(node.childNodes).forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) return;
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child.remove();
        return;
      }

      const tag = child.tagName;
      if (!allowed.has(tag)) {
        const parent = child.parentNode;
        while (child.firstChild) parent.insertBefore(child.firstChild, child);
        child.remove();
        return;
      }

      const spanColor = tag === "SPAN" ? normalizeColor(child.style?.color) : "";
      const fontColor = tag === "FONT" ? normalizeColor(child.getAttribute("color")) : "";

      Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name));
      if (tag === "SPAN") {
        if (spanColor) child.style.color = spanColor;
      } else if (tag === "FONT") {
        if (fontColor) child.setAttribute("color", fontColor);
        else {
          const parent = child.parentNode;
          while (child.firstChild) parent.insertBefore(child.firstChild, child);
          child.remove();
          return;
        }
      }
      cleanNode(child);
    });
  };

  cleanNode(source.body);
  return source.body.innerHTML;
}

function richTextPlainLength(editor) {
  return String(editor?.textContent || "").length;
}

function limitRichText(editor, maxLength = 350) {
  if (!editor) return;
  let current = richTextPlainLength(editor);
  if (current <= maxLength) return;
  let excess = current - maxLength;
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (let i = nodes.length - 1; i >= 0 && excess > 0; i--) {
    const node = nodes[i];
    const removeCount = Math.min(excess, node.nodeValue.length);
    node.nodeValue = node.nodeValue.slice(0, node.nodeValue.length - removeCount);
    excess -= removeCount;
  }
}

function syncRichTextDescription() {
  const editor = document.getElementById("post-desc-editor");
  const hidden = document.getElementById("post-desc");
  const counter = document.getElementById("desc-counter");
  if (!editor || !hidden) return;
  limitRichText(editor, 350);
  const cleaned = sanitizeRichText(editor.innerHTML);
  if (cleaned !== editor.innerHTML) editor.innerHTML = cleaned;
  hidden.value = cleaned;
  if (counter) counter.textContent = richTextPlainLength(editor);
}

function updateRichTextToolbarVisibility() {
  const toolbar = document.getElementById("post-desc-toolbar");
  if (!toolbar) return;
  const isProfessorOrAdmin = isProfessorUser(currentUser) || currentUser?.role === "admin" || currentUser?.subRoles?.includes("admin");
  toolbar.classList.toggle("hidden", !isProfessorOrAdmin);
}

window.applyRichTextCommand = (command, value = null) => {
  const editor = document.getElementById("post-desc-editor");
  if (!editor) return;
  editor.focus();
  document.execCommand(command, false, value);
  syncRichTextDescription();
};

window.toggleRichTextColorMenu = () => {
  const palette = document.getElementById("post-desc-color-palette");
  if (palette) palette.classList.toggle("hidden");
};

window.applyRichTextColor = color => {
  window.applyRichTextCommand("foreColor", color);
  const palette = document.getElementById("post-desc-color-palette");
  if (palette) palette.classList.add("hidden");
};

function initRichTextDescription() {
  const editor = document.getElementById("post-desc-editor");
  const hidden = document.getElementById("post-desc");
  if (!editor || !hidden || editor.dataset.ready === "true") return;
  editor.dataset.ready = "true";

  editor.addEventListener("input", syncRichTextDescription);
  editor.addEventListener("paste", event => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") || "";
    document.execCommand("insertText", false, text);
    syncRichTextDescription();
  });

  document.querySelectorAll("#post-desc-toolbar button").forEach(button => {
    button.addEventListener("mousedown", event => event.preventDefault());
  });

  syncRichTextDescription();
}

function initCharCounters() {
  const titleInput = document.getElementById('post-title');
  const titleCounter = document.getElementById('title-counter');

  if (titleInput && titleCounter && !titleInput.dataset.counterReady) {
    titleInput.dataset.counterReady = "true";
    const updateTitle = () => {
      titleCounter.textContent = titleInput.value.length;
    };
    titleInput.addEventListener('input', updateTitle);
    updateTitle();
  }

  initRichTextDescription();
  updateRichTextToolbarVisibility();
  syncRichTextDescription();
}
window.openSubjectInMatieres = (name) => {
  window._coursFilter.subject = name; 
  switchTab('cours');
  loadCoursFeed();
};

const TAG_DEFS = {
  bac: { label: "Bac", icon: "🎓" },
  exercices: { label: "Exercices", icon: "📝" },
  information: { label: "Information", icon: "ℹ️" }
};
const getSelectedTags = (selector) => Array.from(document.querySelectorAll(selector + ':checked')).map(el => el.value);
const renderContentTags = (tags = []) => (Array.isArray(tags) ? tags : []).filter(t => TAG_DEFS[t]).map(t => `<span class="content-tag">${TAG_DEFS[t].icon} ${TAG_DEFS[t].label}</span>`).join('');

window.openFilterModal = (context) => {
  window._filterContext = context;
  const typeGroup = document.getElementById("filter-type-group");
  const typeLabel = document.getElementById("filter-type-label");
  const subjSelect = document.getElementById("filter-subject");
  const orderSelect = document.getElementById("filter-order");
  const typeSelect = document.getElementById("filter-type");
  const tagsGroup = document.getElementById("filter-tags-group");
  const tagsOptions = document.getElementById("filter-tags-options");

  let htmlSubjs = `<option value="all">Toutes les matières</option>`;
  Array.from(window.subjectsMap.entries()).sort((a,b) => a[0].localeCompare(b[0])).forEach(([name, icon]) => {
    htmlSubjs += `<option value="${esc(name)}">${icon} ${name}</option>`;
  });
  subjSelect.innerHTML = htmlSubjs;

  if (context === 'cours') {
    typeGroup.style.display = 'none';
    tagsGroup.style.display = 'flex';
    tagsOptions.innerHTML = Object.entries(TAG_DEFS).map(([value, tag]) => `<label class="tag-option"><input type="checkbox" value="${value}" ${window._coursFilter.tags.includes(value) ? 'checked' : ''}><span>${tag.icon} ${tag.label}</span></label>`).join('');
    subjSelect.value = window._coursFilter.subject;
    orderSelect.value = window._coursFilter.order;
  } else if (context === 'quiz') {
    typeGroup.style.display = 'flex';
    tagsGroup.style.display = 'flex';
    typeLabel.innerText = "Type de quiz";
    typeSelect.innerHTML = `
      <option value="all">Tous</option>
      <option value="manuel">Classiques</option>
      <option value="ia">Générés par l'IA</option>
    `;
    tagsOptions.innerHTML = `<label class="tag-option"><input type="checkbox" value="bac" ${window._quizFilter.tags.includes('bac') ? 'checked' : ''}><span>🎓 Bac</span></label>`;
    typeSelect.value = window._quizFilter.type;
    subjSelect.value = window._quizFilter.subject;
    orderSelect.value = window._quizFilter.order;
  } else {
    typeGroup.style.display = 'flex';
    tagsGroup.style.display = 'none';
    typeLabel.innerText = "Type de document";
    typeSelect.innerHTML = `
      <option value="all">Tout</option>
      <option value="fiches">Fiches</option>
      <option value="revisions">Révisions</option>
    `;
    subjSelect.value = window._frFilter.subject;
    typeSelect.value = window._frFilter.type;
    orderSelect.value = window._frFilter.order;
  }
  openModal("m-filters");
};

window.applyFilters = () => {
  if (window._filterContext === 'cours') {
    window._coursFilter.subject = document.getElementById("filter-subject").value;
    window._coursFilter.tags = getSelectedTags('#filter-tags-options input');
    window._coursFilter.order = document.getElementById("filter-order").value;
    closeModal("m-filters");
    loadCoursFeed();
  } else if (window._filterContext === 'quiz') {
    window._quizFilter.subject = document.getElementById("filter-subject").value;
    window._quizFilter.type = document.getElementById("filter-type").value;
    window._quizFilter.tags = getSelectedTags('#filter-tags-options input');
    window._quizFilter.order = document.getElementById("filter-order").value;
    closeModal("m-filters");
    loadQuizFeed();
  } else {
    window._frFilter.subject = document.getElementById("filter-subject").value;
    window._frFilter.type = document.getElementById("filter-type").value;
    window._frFilter.order = document.getElementById("filter-order").value;
    closeModal("m-filters");
    loadFRFeed();
  }
};

window.navCarousel = (id, dir) => {
  const el = document.getElementById(`carousel-${id}`);
  if (!el) return;
  const mediaStr = el.getAttribute("data-media") || "[]";
  let media = [];
  try { media = JSON.parse(mediaStr); } catch(e) { return; }
  if (media.length <= 1) return;

  let idx = parseInt(el.getAttribute("data-index") || "0", 10);
  idx = (idx + dir + media.length) % media.length;
  el.setAttribute("data-index", idx);

  const stage = document.getElementById(`carousel-stage-${id}`);
  const badgeEl = document.getElementById(`carousel-badge-${id}`);
  if (!stage) return;
  const item = media[idx];
  if (item.kind === "image") {
    stage.innerHTML = `<img class="carousel-media-content" src="${esc(item.url)}" alt="Aperçu" onclick="event.stopPropagation(); openGalleryModal([${media.filter(m => m.kind === 'image').map(m => `'${esc(m.url)}'`).join(',')}], ${media.filter((m, i) => m.kind === 'image' && i < idx).length})">`;
  } else if (item.kind === "video") {
    stage.innerHTML = customMp4PlayerHTML(item.url, `carousel-${id}-${idx}`);
  } else if (item.kind === "youtube") {
    stage.innerHTML = `<iframe class="carousel-media-content carousel-youtube" src="${esc(item.embedUrl)}" title="Vidéo YouTube" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
  }
  if (item.kind === "video") initCustomMp4Players(stage);
  if (badgeEl) badgeEl.innerText = `${idx + 1} / ${media.length}`;
};

window.openGalleryModal = (images, index = 0) => {
  if (!images || !images.length) return;
  window._galleryImages = images;
  window._galleryIndex = index;
  updateGalleryDisplay();
  openModal("m-gallery");
};

window.navGallery = (dir, event) => {
  if (event) event.stopPropagation();
  if (window._galleryImages.length <= 1) return;
  window._galleryIndex = (window._galleryIndex + dir + window._galleryImages.length) % window._galleryImages.length;
  updateGalleryDisplay();
};

function updateGalleryDisplay() {
  const imgEl = document.getElementById("gal-img");
  const counterEl = document.getElementById("gal-counter");
  const prevBtn = document.getElementById("gal-prev");
  const nextBtn = document.getElementById("gal-next");
  if (imgEl) imgEl.src = window._galleryImages[window._galleryIndex];
  if (counterEl) {
    counterEl.innerText = window._galleryImages.length > 1 ? `${window._galleryIndex + 1} / ${window._galleryImages.length}` : "";
  }
  if (prevBtn) prevBtn.style.display = window._galleryImages.length > 1 ? "flex" : "none";
  if (nextBtn) nextBtn.style.display = window._galleryImages.length > 1 ? "flex" : "none";
}
window.openImageInNewTab = function() {
  const img = document.getElementById('gal-img');
  if (img && img.src) {
    window.open(img.src, '_blank');
  } else {
    showToast('Aucune image à ouvrir.');
  }
};
window.openReportModal = (id, title, author) => {
  document.getElementById("report-post-id").value = id;
  document.getElementById("report-post-title").value = title;
  document.getElementById("report-post-author").value = author;
  document.getElementById("report-reason").value = "";
  openModal("m-report");
};

window.submitReport = async () => {
  const postId = document.getElementById("report-post-id").value;
  const postTitle = document.getElementById("report-post-title").value;
  const postAuthor = document.getElementById("report-post-author").value;
  const reason = document.getElementById("report-reason").value.trim() || "Aucune raison précisée";
  
  try {
    await addDoc(collection(db, "reports"), {
      postId, postTitle, postAuthor,
      reporterId: currentUser ? currentUser.username : "Anonyme",
      reason, status: "pending",
      timestamp: Date.now()
    });
    closeModal("m-report");
    showToast("Publication signalée à la modération ✓");
  } catch(e) {
    showToast("Erreur lors de l'envoi du signalement.");
  }
};

window.getPostHTML = (p, context) => {
  const pId = p.id;
  const isAdmin = currentUser?.role === "admin" || (currentUser?.subRoles && currentUser.subRoles.includes("admin"));
  const canDel = isAdmin || p.authorId === currentUser?.username;
  const hasLiked = (p.likes || []).includes(currentUser?.username);
  const likeCount = (p.likes || []).length;

  const liveAuthor = window.usersMap.get(p.authorId) || {};
  const liveRole   = liveAuthor.role || p.authorRole || "élève";
  const liveName   = liveAuthor.displayName || p.authorDisplayName || p.authorId;
  const liveAv     = liveAuthor.avatar !== undefined ? liveAuthor.avatar : p.authorAvatar;
  const authorBadge = getBadge(liveAuthor);
  
  const subjIcon = p.type === "annonce" ? "📌" : (window.subjectsMap.get(p.matiere) || "📚");

  const avContent = liveAv ? `<img src="${liveAv}" alt="">` : liveName.split(" ").map(x => x[0]).join("").substring(0, 2).toUpperCase();
  const roleClass = liveRole === "professeur" ? "professeur" : liveRole === "admin" ? "admin" : liveRole === "HS" ? "hs" : "eleve";
  
  const typeLabels = { cours: "Cours", fiches: "Fiche", revisions: "Révisions", annonce: "Annonce Épinglée" };
  const typeLabel  = typeLabels[p.type] || p.type;
  
  const tagBgClass = p.type === "annonce" ? "background:var(--danger);color:#fff;" : "";

  let filesList = [];
  if (p.files && Array.isArray(p.files) && p.files.length > 0) {
    filesList = p.files;
  } else if (p.fileData || p.url) {
    const targetUrl = p.fileData || p.url;
    filesList = [{
      url: targetUrl,
      name: p.fileName || p.title || "Document",
      type: p.fileType || ""
    }];
  }

  const images = [];
  const videos = [];
  const docs = [];
  let youtube = null;

  const getYouTubeEmbed = (url) => {
    try {
      const u = new URL(url);
      let id = "";
      if (u.hostname.includes("youtu.be")) id = u.pathname.slice(1).split("/")[0];
      else if (u.hostname.includes("youtube.com")) {
        if (u.pathname === "/watch") id = u.searchParams.get("v") || "";
        else if (u.pathname.startsWith("/shorts/")) id = u.pathname.split("/")[2] || "";
        else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2] || "";
        else if (u.pathname.startsWith("/live/")) id = u.pathname.split("/")[2] || "";
      }
      return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
    } catch(e) { return null; }
  };

  filesList.forEach((f, index) => {
    const u = (f.url || "");
    const lowerU = u.toLowerCase();
    const t = (f.type || "").toLowerCase();
    const yt = getYouTubeEmbed(u);
    const isPDF = t === "application/pdf" || lowerU.endsWith(".pdf");
    const isVideo = !isPDF && (t === "video/mp4" || lowerU.endsWith(".mp4"));
    const isImg = !isPDF && !isVideo && (t.startsWith("image/") || lowerU.match(/\.(jpeg|jpg|gif|png|webp)$/i) || lowerU.includes("res.cloudinary.com"));
    if (yt) youtube = { url: u, embedUrl: yt, name: f.name || "YouTube", type: "video/youtube" };
    else if (isImg) images.push({ ...f, kind: "image", _order: index });
    else if (isVideo) videos.push({ ...f, kind: "video", _order: index });
    else if (f.url) docs.push(f);
  });

  const mediaItems = [];
  if (youtube) mediaItems.push({ ...youtube, kind: "youtube" });
  filesList.forEach((f, index) => {
    const found = [...videos, ...images].find(m => m._order === index);
    if (found) mediaItems.push(found);
  });

  let mediaBox = "";
  if (mediaItems.length === 1) {
    const item = mediaItems[0];
    let singleContent = "";
    if (item.kind === "image") {
      singleContent = `<img class="carousel-media-content" src="${esc(item.url)}" alt="Aperçu" onclick="openGalleryModal(['${esc(item.url)}'], 0)">`;
    } else if (item.kind === "video") {
      singleContent = `${customMp4PlayerHTML(item.url, `single-${pId}-${index}`)}`;
    } else {
      singleContent = `<iframe class="carousel-media-content carousel-youtube" src="${esc(item.embedUrl)}" title="Vidéo YouTube" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
    }
    mediaBox = `<div class="post-carousel post-carousel-single">${singleContent}</div>`;
  } else if (mediaItems.length > 1) {
    const mediaJson = esc(JSON.stringify(mediaItems.map(m => ({ kind: m.kind, url: m.url, embedUrl: m.embedUrl || "" }))));
    const first = mediaItems[0];
    let firstContent = "";
    if (first.kind === "image") firstContent = `<img class="carousel-media-content" src="${esc(first.url)}" alt="Aperçu" onclick="openGalleryModal(['${esc(first.url)}'], 0)">`;
    else if (first.kind === "video") firstContent = `${customMp4PlayerHTML(first.url, `first-${pId}-${context}`)}`;
    else firstContent = `<iframe class="carousel-media-content carousel-youtube" src="${esc(first.embedUrl)}" title="Vidéo YouTube" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`;
    mediaBox = `
      <div class="post-carousel" id="carousel-${context}-${pId}" data-index="0" data-media="${mediaJson}">
        <div id="carousel-stage-${context}-${pId}" class="post-carousel-stage">${firstContent}</div>
        <div class="carousel-badge" id="carousel-badge-${context}-${pId}">1 / ${mediaItems.length}</div>
        <button type="button" class="carousel-btn prev" onclick="event.stopPropagation(); navCarousel('${context}-${pId}', -1)">‹</button>
        <button type="button" class="carousel-btn next" onclick="event.stopPropagation(); navCarousel('${context}-${pId}', 1)">›</button>
      </div>`;
  }
  let fileChips = "";
  if (docs.length > 0) {
    fileChips = docs.map(d => {
      const cleanName = d.name || p.title || "Document";
      const isPDF = d.type === "application/pdf" || (d.url || "").toLowerCase().endsWith(".pdf");
      return `
      <div class="file-chip mt-1">
        <div class="file-chip-info" title="${esc(cleanName)}">
          <span style="font-size:22px">${isPDF ? "📄" : "🔗"}</span>
          <span>${cleanName}</span>
        </div>
        <a href="${d.url}" target="_blank" rel="noopener" class="btn-download">📥 Consulter</a>
      </div>`;
    }).join("");
  }

  let comments = p.comments || [];
  let commentsCount = comments.reduce((acc, c) => acc + 1 + (c.replies ? c.replies.length : 0), 0);
  
  comments.sort((a,b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return (a.timestamp || 0) - (b.timestamp || 0);
  });

  let cmtHTML = "";
  comments.forEach(c => {
    const cmtId = c.id || String(c.timestamp); 
    const cmtAuthor = window.usersMap.get(c.userId) || {};
    const cmtName = cmtAuthor.displayName || c.displayName || c.userId;
    const cmtBadge = getBadge(cmtAuthor);
    const canModCmt = isAdmin || currentUser?.username === c.userId || currentUser?.username === p.authorId;
    const canPin = isAdmin || currentUser?.username === p.authorId;
    
    let repliesHTML = "";
    if (c.replies && c.replies.length > 0) {
      c.replies.sort((r1, r2) => (r1.timestamp || 0) - (r2.timestamp || 0)).forEach(r => {
        const rId = r.id || String(r.timestamp);
        const rAuthor = window.usersMap.get(r.userId) || {};
        const rName = rAuthor.displayName || r.displayName || r.userId;
        const rBadge = getBadge(rAuthor);
        const canDelRep = isAdmin || currentUser?.username === r.userId || currentUser?.username === p.authorId;
        
        repliesHTML += `
        <div class="cmt-reply">
          <a href="#${r.userId}" class="cmt-user">${escapeHTML(rName)}${rBadge}</a> : ${escapeHTML(r.text || "")}
          ${canDelRep ? `<div class="cmt-actions"><button class="del" onclick="delCmt('${pId}','${cmtId}','${rId}')">Supprimer</button></div>` : ''}
        </div>`;
      });
    }

    cmtHTML += `
    <div class="cmt-block ${c.isPinned ? 'pinned' : ''}">
      <div class="cmt-header">
        <div class="cmt-row">
          ${c.isPinned ? '📌 ' : ''}<a href="#${c.userId}" class="cmt-user">${escapeHTML(cmtName)}${cmtBadge}</a> : ${escapeHTML(c.text || "")}
        </div>
      </div>
      <div class="cmt-actions">
        <button onclick="toggleReplyBox('${pId}','${cmtId}','${context}')">Répondre</button>
        ${canPin ? `<button onclick="pinCmt('${pId}','${cmtId}')">${c.isPinned ? 'Désépingler' : 'Épingler'}</button>` : ''}
        ${canModCmt ? `<button class="del" onclick="delCmt('${pId}','${cmtId}')">Supprimer</button>` : ''}
      </div>
      ${repliesHTML ? `<div class="cmt-replies">${repliesHTML}</div>` : ''}
      <form class="cmt-form" id="reply-form-${context}-${pId}-${cmtId}" style="display:none;" onsubmit="addReply(event,'${pId}','${cmtId}')">
        <input type="text" placeholder="Répondre..." required>
        <button type="submit" class="cmt-send">Envoyer</button>
      </form>
    </div>`;
  });

  const dateStr = p.timestamp ? new Date(p.timestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Date inconnue";

  return `
    <div class="post-card">
      <div style="display:flex;flex-direction:column;gap:14px;flex:1">
        <div class="post-header">
          <a href="#${p.authorId}" class="post-av">${avContent}</a>
          <div style="flex:1;min-width:0">
            <a href="#${p.authorId}" class="post-author-name">${escapeHTML(liveName)}${authorBadge}</a>
            <div class="post-meta">
              <span class="rbadge ${roleClass}">${liveRole}</span>
              <span class="type-tag ${p.type}" style="${tagBgClass}">${typeLabel}</span>
              <span class="subj-tag">${subjIcon} ${p.matiere}</span>
              ${renderContentTags(p.tags)}
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            ${canDel ? `<button class="btn-danger btn-sm" onclick="deletePost('${pId}')">Supprimer</button>` : ""}
            <button onclick="openReportModal('${pId}', '${esc(p.title || "Document")}', '${p.authorId}')" style="background:transparent; color:var(--ink-m); font-size:20px; font-weight:bold; cursor:pointer; padding:0 6px; border:none; line-height:1;" title="Signaler la publication">…</button>
          </div>
        </div>
        <div>
          <div>
  <div class="post-title">${p.title.length > 50 ? p.title.substring(0, 47) + '...' : p.title}</div>
  ${p.description ? `<div class="post-desc">${sanitizeRichText(p.description)}</div>` : ""}
</div>
        ${fileChips}
        ${mediaBox}
      </div>
      <div>
        <div class="post-date">Publié le ${dateStr}</div>
        <div class="post-actions">
          <button class="like-btn ${hasLiked ? "liked" : ""}" onclick="toggleLike('${pId}')">
            ${hasLiked ? "❤️" : "🤍"} ${likeCount}
          </button>
          <button class="comment-tog-btn" onclick="toggleComments('${pId}','${context}')">💬 ${commentsCount} commentaires</button>
          <button class="like-btn" onclick="openShareModal('${pId}', 'post', '${esc(p.title)}')">↗️ Partager</button>
        </div>
        <div class="comments-wrap" id="comments-wrap-${context}-${pId}">
          <div class="comments-box">
            ${cmtHTML}
          </div>
          <form class="cmt-form mt-1" onsubmit="addComment(event,'${pId}')">
            <input type="text" placeholder="Ajouter un commentaire…" required>
            <button type="submit" class="cmt-send">Commenter</button>
          </form>
        </div>
      </div>
    </div>`;
};

window.getQuizHTML = (q) => {
  const qId = q.id;
  const isAdmin = currentUser?.role === "admin" || (currentUser?.subRoles && currentUser.subRoles.includes("admin"));
  const canDel = isAdmin || q.authorId === currentUser?.username;

  const liveAuthor = window.usersMap.get(q.authorId) || {};
  const liveRole   = liveAuthor.role || q.authorRole || "élève";
  const liveName   = liveAuthor.displayName || q.authorDisplayName || q.authorId;
  const liveAv     = liveAuthor.avatar !== undefined ? liveAuthor.avatar : q.authorAvatar;
  const authorBadge = getBadge(liveAuthor);
  const subjIcon   = window.subjectsMap.get(q.matiere) || "📚";

  const avContent = liveAv ? `<img src="${liveAv}" alt="">` : liveName.split(" ").map(x => x[0]).join("").substring(0, 2).toUpperCase();
  const roleClass = liveRole === "professeur" ? "professeur" : liveRole === "admin" ? "admin" : liveRole === "HS" ? "hs" : "eleve";
  const dateStr = q.timestamp ? new Date(q.timestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "Inconnue";

  const hasLiked = (q.likes || []).includes(currentUser?.username);
  const likeCount = (q.likes || []).length;

  return `
    <div class="quiz-card">
      <div class="post-header">
        <a href="#${q.authorId}" class="post-av">${avContent}</a>
        <div style="flex:1;min-width:0">
          <a href="#${q.authorId}" class="post-author-name">${escapeHTML(liveName)}${authorBadge}</a>
          <div class="post-meta">
            <span class="rbadge ${roleClass}">${liveRole}</span>
            <span class="subj-tag">${subjIcon} ${q.matiere}</span>
            <span class="type-tag" style="background:var(--primary); color:#fff;">${q.isAI ? 'Quiz IA' : 'Quiz'}</span>
            ${renderContentTags(q.tags)}
          </div>
        </div>
        ${canDel ? `<button class="btn-danger btn-sm" onclick="${q.isAI ? 'deleteAIQuiz' : 'deleteQuiz'}('${qId}')">Supprimer</button>` : ""}
      </div>
      <div>
        <div class="post-title">${q.title}</div>
        ${q.description ? `<p class="post-desc">${q.description}</p>` : ""}
        <div class="caption mt-1">${(q.questions || []).length} questions • Créé le ${dateStr} • <strong>Fait par ${q.attemptsCount || 0} personne(s)</strong></div>
      </div>
      <div class="post-actions" style="margin-top: 8px; border-top: 1px solid var(--hl); padding-top: 12px;">
        <button class="like-btn ${hasLiked ? 'liked' : ''}" onclick="toggleQuizLike('${qId}', ${q.isAI})">
          ${hasLiked ? '❤️' : '🤍'} ${likeCount}
        </button>
        <button class="like-btn" onclick="openShareModal('${qId}', '${q.isAI ? 'ai_quiz' : 'quiz'}', '${esc(q.title)}')">↗️ Partager</button>
      </div>
      <button class="btn-pill mt-1" style="justify-content:center; width:100%;" onclick="checkAndStartQuiz('${qId}', ${q.isAI})">Commencer le quiz</button>
    </div>`;
};

function isAnnouncementVisibleToCurrentUser(post) {
  const visibility = post?.announcementVisibility || "tous";
  if (visibility === "tous" || !currentUser) return true;
  if (isAdminOrHSUser()) return true;
  if (visibility === "professeurs") return isProfessorUser(currentUser);
  if (visibility === "eleves") return !isProfessorUser(currentUser);
  return true;
}

function loadPinnedAnnonces() {
  if (window._pinnedUnsub) { window._pinnedUnsub(); window._pinnedUnsub = null; }
  const zone = document.getElementById("pinned-annonces-zone");
  if (!zone) return;
  
  const qPinned = query(collection(db, "posts"), where("type", "==", "annonce"));
  window._pinnedUnsub = onSnapshot(qPinned, snap => {
    if (snap.empty) {
      zone.innerHTML = "";
      return;
    }
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs = docs.filter(isAnnouncementVisibleToCurrentUser);
    docs.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
    
    let html = `<div class="pinned-post-wrapper">
                  <h3 style="margin-bottom:16px; color:var(--ink); display:flex; align-items:center; gap:8px;">📌 Annonces Épinglées</h3>
                  <div style="display:flex; flex-direction:column; gap:16px;">`;
    docs.forEach(p => {
      html += window.getPostHTML(p, "pinned");
    });
    html += `</div></div>`;
    zone.innerHTML = html;
    initCustomMp4Players(zone);
  });
}

function loadCoursFeed() {
if (window._coursUnsub) { window._coursUnsub(); window._coursUnsub = null; }

const container = document.getElementById("cours-feed"); 
if (!container) return;

container.innerHTML = `<div style="display:flex;justify-content:center;grid-column:1/-1;padding:40px"><div class="spinner"></div></div>`;

let q = query(collection(db, "posts"), where("type", "==", "cours"));

if (window._coursFilter.subject !== "all") {
  q = query(q, where("matiere", "==", window._coursFilter.subject));
}

window._coursUnsub = onSnapshot(q, snap => {
  let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  docs = window.filterVisibleContent(docs, 'post');
  if (window._coursFilter.tags.length) docs = docs.filter(p => (Array.isArray(p.tags) ? p.tags : []).some(tag => window._coursFilter.tags.includes(tag)));
  if (window._coursFilter.order === 'likes') {
    docs.sort((a,b) => (b.likes || []).length - (a.likes || []).length);
  } else if (window._coursFilter.order === 'oldest') {
    docs.sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
  } else {
    docs.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
  }
  renderFeedFromDocs(docs, container, "Aucun cours disponible pour le moment", 'recent', 'cours');
});
}
function loadFRFeed() {
if (window._frUnsub) { window._frUnsub(); window._frUnsub = null; }

const container = document.getElementById("fr-feed"); 
if (!container) return;

container.innerHTML = `<div style="display:flex;justify-content:center;grid-column:1/-1;padding:40px"><div class="spinner"></div></div>`;

const filters = window.getUserVisibilityFilters();
const types = window._frFilter.type === "all" ? ["fiches", "revisions"] : [window._frFilter.type];
let q;

if (window._frFilter.subject === "all") {
  q = types.length > 1 ? query(collection(db, "posts"), where("type", "in", types)) : query(collection(db, "posts"), where("type", "==", types[0]));
} else {
  q = types.length > 1 ? query(collection(db, "posts"), where("matiere", "==", window._frFilter.subject), where("type", "in", types)) : query(collection(db, "posts"), where("matiere", "==", window._frFilter.subject), where("type", "==", types[0]));
}

window._frUnsub = onSnapshot(q, snap => {
let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
docs = window.filterVisibleContent(docs, 'post');
if (window._frFilter.order === 'likes') {
  docs.sort((a,b) => (b.likes || []).length - (a.likes || []).length);
} else if (window._frFilter.order === 'oldest') {
  docs.sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
} else {
  docs.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
}
renderFeedFromDocs(docs, container, "Aucune fiche ou révision disponible", 'recent', 'fr');
});
}

function renderFeedFromDocs(postsArray, container, emptyMsg, sortOrder = 'recent', context = 'main') {
  container.innerHTML = "";
  if (postsArray.length === 0) {
    container.innerHTML = `<div class="empty-text">${emptyMsg || "Aucune ressource pour l'instant"}</div>`; 
    return;
  }

  if (sortOrder === 'likes') {
    postsArray.sort((a,b) => (b.likes || []).length - (a.likes || []).length);
  } else if (sortOrder === 'oldest') {
    postsArray.sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
  } else {
    postsArray.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  postsArray.forEach(p => {
    container.innerHTML += window.getPostHTML(p, context);
  });
  initCustomMp4Players(container);
  setTimeout(() => {
    if (typeof window.checkDescriptionHeight === "function") {
      window.checkDescriptionHeight();
    }
  }, 50);
}
function loadAnnonces() {
  const isAdmin = currentUser?.role === "admin" || (currentUser?.subRoles && currentUser.subRoles.includes("admin"));
  const zone = document.getElementById("annonces-zone"); 
  if (!zone) return;

  onSnapshot(collection(db, "annonces"), (snap) => {
    const titleRow = `
    <div class="ann-section-title">
      📢 Annonces
      ${isAdmin ? `<button class="btn-pill-van btn-sm" onclick="openAnnonceModal('')">+ Nouvelle annonce</button>` : ""}
    </div>`;
    
    if (snap.empty) {
      zone.innerHTML = isAdmin ? titleRow + `<div class="empty-text">Aucune petite annonce pour le moment</div>` : ""; 
      return;
    }
    
    let cards = "";
    snap.docs.sort((a,b) => (b.data().timestamp || 0) - (a.data().timestamp || 0)).forEach(d => {
      const a = d.data();
      cards += `
      <div class="ann-card">
        <div class="ann-card-title">${a.title}</div>
        <div class="ann-card-body">${a.body || ""}</div>
        ${isAdmin ? `<div class="ann-actions"><button class="btn-ghost btn-sm" onclick="openAnnonceModal('${d.id}','${esc(a.title)}','${esc(a.body || '')}')">Modifier</button><button class="btn-danger btn-sm" onclick="delAnnonce('${d.id}')">Supprimer</button></div>` : ""}
      </div>`;
    });
    zone.innerHTML = titleRow + `<div style="display:flex;flex-direction:column;gap:12px;grid-column:1/-1">${cards}</div>`;
  });
}

window.openAnnonceModal = (id, title = "", body = "") => {
  document.getElementById("m-ann-title").innerText = id ? "Modifier l'annonce" : "Nouvelle annonce";
  document.getElementById("ann-edit-id").value = id; 
  document.getElementById("ann-title").value = title; 
  document.getElementById("ann-body").value = body;
  openModal("m-ann");
};

window.saveAnnonce = async () => {
  const id = document.getElementById("ann-edit-id").value;
  const title = document.getElementById("ann-title").value.trim();
  const body = document.getElementById("ann-body").value.trim();
  
  if (!title) {
    showToast("Titre requis.");
    return;
  }
  
  if (id) {
    await updateDoc(doc(db, "annonces", id), { title, body }); 
  } else {
    await addDoc(collection(db, "annonces"), { title, body, timestamp: Date.now() });
  }
  
  closeModal("m-ann"); 
  showToast("Annonce publiée ✓");
};

window.delAnnonce = async (id) => {
  if (confirm("Supprimer cette annonce ?")) await deleteDoc(doc(db, "annonces", id));
};

window.handleFileSelect = (e) => {
  const files = Array.from(e.target.files || []); 
  if (!files.length) return;
  
  if (files.length > 5) {
    showToast("Maximum 5 fichiers autorisés par document.");
    e.target.value = "";
    window._uploadedFiles = [];
    document.getElementById("file-prev").style.display = "none";
    return;
  }

  let totalSize = 0;
  files.forEach(f => totalSize += f.size);
  if (totalSize > 25 * 1024 * 1024) {
    e.target.value = ""; 
    window._uploadedFiles = []; 
    document.getElementById("file-prev").style.display = "none"; 
    openModal("m-filesize"); 
    return;
  }
  
  window._uploadedFiles = files;
  const bar = document.getElementById("file-prev"); 
  bar.style.display = "flex";
  
  document.getElementById("file-prev-name").innerText = `${files.length} fichier(s) sélectionné(s)`;
  document.getElementById("file-prev-icon").innerText = "📁"; 
  
  const listDiv = document.getElementById("file-prev-list");
  if (listDiv) {
    listDiv.innerHTML = files.map(f => `<div>• ${f.name} (${(f.size/1024/1024).toFixed(2)} Mo)</div>`).join("");
  }
};

window.clearFile = () => {
  window._uploadedFiles = []; 
  document.getElementById("post-file").value = ""; 
  document.getElementById("file-prev").style.display = "none";
};

window.handlePostTypeChange = () => {
  const type = document.getElementById("post-type").value;
  const matiereGroup = document.getElementById("group-post-matiere");
  const tagsGroup = document.getElementById("group-post-tags");
  const visibilityGroup = document.getElementById("group-post-announcement-visibility");
  if (type === "annonce") {
    matiereGroup.style.display = "none";
    if (tagsGroup) tagsGroup.style.display = "none";
    if (visibilityGroup) visibilityGroup.style.display = "flex";
  } else {
    matiereGroup.style.display = "flex";
    if (tagsGroup) tagsGroup.style.display = type === "cours" ? "flex" : "none";
    if (visibilityGroup) visibilityGroup.style.display = "none";
  }
};

const getYouTubeEmbedUrl = (url) => {
  try {
    const u = new URL(url);
    let id = "";
    if (u.hostname.includes("youtu.be")) id = u.pathname.slice(1).split("/")[0];
    else if (u.hostname.includes("youtube.com")) {
      if (u.pathname === "/watch") id = u.searchParams.get("v") || "";
      else if (u.pathname.startsWith("/shorts/")) id = u.pathname.split("/")[2] || "";
      else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2] || "";
      else if (u.pathname.startsWith("/live/")) id = u.pathname.split("/")[2] || "";
    }
    return id && /^[A-Za-z0-9_-]{6,}$/.test(id) ? `https://www.youtube.com/embed/${id}` : null;
  } catch(e) { return null; }
};

const SVG_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.2v13.6a1 1 0 0 0 1.53.85l10.1-6.8a1 1 0 0 0 0-1.66l-10.1-6.8A1 1 0 0 0 8 5.2Z" fill="currentColor"/></svg>';
const SVG_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5.5A1.5 1.5 0 0 1 8.5 4h1A1.5 1.5 0 0 1 11 5.5v13A1.5 1.5 0 0 1 9.5 20h-1A1.5 1.5 0 0 1 7 18.5v-13Zm6 0A1.5 1.5 0 0 1 14.5 4h1A1.5 1.5 0 0 1 17 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-1a1.5 1.5 0 0 1-1.5-1.5v-13Z" fill="currentColor"/></svg>';
const SVG_VOLUME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4Zm11.5 0.5a1 1 0 0 0-1.4 1.4c.6.6.9 1.1.9 2.1s-.3 1.5-.9 2.1a1 1 0 1 0 1.4 1.4c1-1 1.5-2.2 1.5-3.5s-.5-2.5-1.5-3.5Zm2.4-2.4a1 1 0 0 0-1.4 1.4c1.3 1.3 2 3 2 4.6s-.7 3.3-2 4.6a1 1 0 0 0 1.4 1.4c1.7-1.7 2.6-3.8 2.6-6s-.9-4.3-2.6-6Z" fill="currentColor"/></svg>';
const SVG_FULLSCREEN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 4H5a1 1 0 0 0-1 1v3h2V6h2V4Zm8 0h3a1 1 0 0 1 1 1v3h-2V6h-2V4ZM4 16h2v2h2v2H5a1 1 0 0 1-1-1v-3Zm16 0v3a1 1 0 0 1-1 1h-3v-2h2v-2h2Z" fill="currentColor"/></svg>';

function customMp4PlayerHTML(url, id) {
  return `<div class="custom-mp4-player" data-video-id="${id}" data-video-url="${esc(url)}">
    <video class="custom-mp4-video" src="${esc(url)}" playsinline preload="metadata"></video>
    <button type="button" class="custom-mp4-center" aria-label="Lire / mettre en pause">${SVG_PLAY}</button>
    <div class="custom-mp4-controls" aria-label="Contrôles vidéo">
      <input class="custom-mp4-progress" type="range" min="0" max="1000" value="0" step="1" aria-label="Position de la vidéo">
      <div class="custom-mp4-bottom">
        <button type="button" class="custom-mp4-action custom-mp4-toggle" aria-label="Lire / mettre en pause">${SVG_PLAY}</button>
        <span class="custom-mp4-time">0:00 / 0:00</span>
        <div class="custom-mp4-spacer"></div>
        <button type="button" class="custom-mp4-action custom-mp4-volume-icon" aria-label="Activer ou couper le son">${SVG_VOLUME}</button>
        <input class="custom-mp4-volume" type="range" min="0" max="1" value="1" step="0.01" aria-label="Volume">
        <button type="button" class="custom-mp4-action custom-mp4-fullscreen" aria-label="Plein écran">${SVG_FULLSCREEN}</button>
      </div>
    </div>
  </div>`;
}

function formatVideoTime(seconds) {
  if (!Number.isFinite(seconds)) return "0:00";
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = String(total % 60).padStart(2, "0");
  return `${minutes}:${secs}`;
}

function refreshCustomMp4Player(player) {
  const video = player?.querySelector(".custom-mp4-video");
  if (!video) return;
  const progress = player.querySelector(".custom-mp4-progress");
  const time = player.querySelector(".custom-mp4-time");
  const icons = player.querySelectorAll(".custom-mp4-toggle, .custom-mp4-center");
  const ratio = video.duration ? video.currentTime / video.duration : 0;
  if (progress) progress.value = String(Math.round(ratio * 1000));
  if (time) time.textContent = `${formatVideoTime(video.currentTime)} / ${formatVideoTime(video.duration)}`;
  icons.forEach(icon => icon.innerHTML = video.paused ? SVG_PLAY : SVG_PAUSE);
}

function setCustomMp4ControlsVisible(player, visible) {
  if (!player) return;
  player.classList.toggle("controls-hidden", !visible);
}

function armCustomMp4Controls(player) {
  if (!player) return;
  clearTimeout(player._hideTimer);
  setCustomMp4ControlsVisible(player, true);
  player._hideTimer = setTimeout(() => {
    const video = player.querySelector(".custom-mp4-video");
    if (video && !video.paused) setCustomMp4ControlsVisible(player, false);
  }, 2000);
}

function toggleCustomMp4(video, player) {
  if (!video) return;
  if (video.paused) video.play().catch(() => {});
  else video.pause();
  refreshCustomMp4Player(player);
  armCustomMp4Controls(player);
}

function initCustomMp4Players(root = document) {
  root.querySelectorAll(".custom-mp4-player").forEach(player => {
    if (player.dataset.ready === "true") return;
    player.dataset.ready = "true";
    const video = player.querySelector(".custom-mp4-video");
    const center = player.querySelector(".custom-mp4-center");
    const toggle = player.querySelector(".custom-mp4-toggle");
    const volume = player.querySelector(".custom-mp4-volume");
    const volumeIcon = player.querySelector(".custom-mp4-volume-icon");
    const progress = player.querySelector(".custom-mp4-progress");
    const fullscreen = player.querySelector(".custom-mp4-fullscreen");
    if (!video) return;

    video.pause();
    video.currentTime = 0;
    video.volume = 1;
    video.muted = false;

    const activity = () => armCustomMp4Controls(player);
    ["pointermove", "pointerdown", "touchstart"].forEach(eventName => player.addEventListener(eventName, activity, { passive: true }));
    center?.addEventListener("click", event => { event.stopPropagation(); toggleCustomMp4(video, player); });
    toggle?.addEventListener("click", event => { event.stopPropagation(); toggleCustomMp4(video, player); });
    volumeIcon?.addEventListener("click", event => {
      event.stopPropagation();
      video.muted = !video.muted;
      if (!video.muted && video.volume === 0) video.volume = 0.5;
      if (volume) volume.value = String(video.muted ? 0 : video.volume);
      armCustomMp4Controls(player);
    });
    volume?.addEventListener("input", event => {
      video.muted = false;
      video.volume = Number(event.target.value);
      refreshCustomMp4Player(player);
      armCustomMp4Controls(player);
    });
    progress?.addEventListener("input", event => {
      if (!video.duration) return;
      video.currentTime = (Number(event.target.value) / 1000) * video.duration;
      refreshCustomMp4Player(player);
      armCustomMp4Controls(player);
    });
    fullscreen?.addEventListener("click", async event => {
      event.stopPropagation();
      try {
        const fullscreenElement = document.fullscreenElement || document.webkitFullscreenElement;
        if (fullscreenElement === player) {
          if (document.exitFullscreen) await document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } else if (player.requestFullscreen) {
          await player.requestFullscreen();
        } else if (player.webkitRequestFullscreen) {
          player.webkitRequestFullscreen();
        } else if (video.webkitEnterFullscreen) {
          video.webkitEnterFullscreen();
        }
      } catch (_) {}
      armCustomMp4Controls(player);
    });
    document.addEventListener("fullscreenchange", () => refreshCustomMp4Player(player));
    document.addEventListener("webkitfullscreenchange", () => refreshCustomMp4Player(player));
    video.addEventListener("webkitbeginfullscreen", () => setCustomMp4ControlsVisible(player, false));
    video.addEventListener("webkitendfullscreen", () => setCustomMp4ControlsVisible(player, true));
    video.addEventListener("loadedmetadata", () => refreshCustomMp4Player(player));
    video.addEventListener("timeupdate", () => refreshCustomMp4Player(player));
    video.addEventListener("play", () => { refreshCustomMp4Player(player); armCustomMp4Controls(player); });
    video.addEventListener("pause", () => { refreshCustomMp4Player(player); setCustomMp4ControlsVisible(player, true); });
    video.addEventListener("ended", () => { refreshCustomMp4Player(player); setCustomMp4ControlsVisible(player, true); });
    refreshCustomMp4Player(player);
    setCustomMp4ControlsVisible(player, true);
  });
}

window.handleCreatePost = async () => {
  const title = document.getElementById("post-title").value.trim();
  const type = document.getElementById("post-type").value;
  const announcementVisibility = type === "annonce"
    ? (document.getElementById("post-announcement-visibility")?.value || "tous")
    : "tous";
  
  let matiere = "Annonces";
  if (type !== "annonce") {
    matiere = document.getElementById("post-matiere").value;
    if (!matiere) {
      showToast("Matière requise.");
      return;
    }
  }
  
  syncRichTextDescription();
  const desc = sanitizeRichText(document.getElementById("post-desc").value || "");
  const tags = type === "cours" ? getSelectedTags('input[name="post-tag"]') : [];
  const urlInput = document.getElementById("post-url").value.trim();
  
  if (!title) {
    showToast("Titre requis.");
    return;
  }

  let filesArray = [];
  if ((window._uploadedFiles && window._uploadedFiles.length > 0) || urlInput) {
    const btn = document.querySelector('[onclick="handleCreatePost()"]'); 
    if (btn) { btn.disabled = true; btn.innerText = "Upload des fichiers en cours…"; }
    
    try {
      const ytUrl = urlInput ? (getYouTubeEmbedUrl(urlInput) ? urlInput : null) : null;
      if (ytUrl) {
        filesArray.push({ url: ytUrl, name: "YouTube", type: "video/youtube" });
      }
      for (const file of (window._uploadedFiles || [])) {
        const fileUrl = await uploadToCloudinary(file);
        filesArray.push({
          url: fileUrl,
          name: file.name,
          type: file.type
        });
      }
      if (urlInput && !ytUrl) {
        filesArray.push({ url: urlInput, name: "Lien externe", type: "link" });
      }
    } catch (err) {
      showToast("Erreur lors de l'upload Cloudinary."); 
      if (btn) { btn.disabled = false; btn.innerText = "Partager avec la classe"; } 
      return;
    }
    
    if (btn) { btn.disabled = false; btn.innerText = "Partager avec la classe"; }
  } else if (urlInput) {
    filesArray.push({
      url: urlInput,
      name: "Lien externe",
      type: "link"
    });
  }

  const firstFile = filesArray[0] || {};
  const post = {
    title, matiere, type, description: desc, tags,
    files: filesArray,
    fileData: firstFile.url || "",
    fileName: firstFile.name || "",
    fileType: firstFile.type || "",
    url: firstFile.url || urlInput || "",
    authorId: currentUser.username,
    authorDisplayName: currentUser.displayName || currentUser.username,
    authorAvatar: currentUser.avatar || "",
    authorRole: currentUser.role || "élève",
    announcementVisibility,
    etablissementId: currentUser.etablissementId || "",
    classeId: currentUser.classeId || "",
    likes: [], comments: [], timestamp: Date.now(),
  };

  try {
    await addDoc(collection(db, "posts"), post);
    
    document.getElementById("post-title").value = ""; 
    document.getElementById("post-desc").value = "";
    const postDescEditor = document.getElementById("post-desc-editor");
    if (postDescEditor) postDescEditor.innerHTML = "";
    syncRichTextDescription(); 
    document.getElementById("post-url").value = "";
    const announcementVisibilityEl = document.getElementById("post-announcement-visibility");
    if (announcementVisibilityEl) announcementVisibilityEl.value = "tous";
    document.querySelectorAll('input[name="post-tag"]').forEach(el => el.checked = false);
    clearFile(); 
    syncContrib(); 
    showToast("Partagé avec la classe ✓");
    
    if (currentUser.followers && currentUser.followers.length > 0) {
       currentUser.followers.forEach(uname => {
         const fUser = window.usersMap.get(uname);
         if (fUser) sendEmailNotif('post', fUser);
       });
    }

    if (type === "cours") switchTab('cours'); 
    else if (type === "annonce") switchTab('accueil');
    else switchTab('fichesrev');
    
  } catch(e) { 
    showToast("Erreur d'envoi."); 
  }
};

const dz = document.getElementById("drop-zone");
if (dz) {
  dz.addEventListener("dragover", e => { e.preventDefault(); dz.style.borderColor = "var(--primary)"; });
  dz.addEventListener("dragleave", () => { dz.style.borderColor = ""; });
  dz.addEventListener("drop", e => {
    e.preventDefault(); 
    dz.style.borderColor = ""; 
    const files = e.dataTransfer.files;
    if (files && files.length > 0) { 
      const inp = document.getElementById("post-file");
      inp.files = files; 
      handleFileSelect({ target: inp }); 
    }
  });
}

window.toggleLike = async (postId) => {
  const ref = doc(db, "posts", postId);
  const snap = await getDoc(ref); 
  if (!snap.exists()) return;
  
  let likes = snap.data().likes || [];
  if (likes.includes(currentUser.username)) {
    likes = likes.filter(u => u !== currentUser.username); 
  } else {
    likes.push(currentUser.username);
  }
  
  await updateDoc(ref, { likes });
};

window.toggleQuizLike = async (quizId, isAI) => {
  const colName = isAI ? "ai_quizzes" : "quizzes";
  const ref = doc(db, colName, quizId);
  const snap = await getDoc(ref); 
  if (!snap.exists()) return;
  
  let likes = snap.data().likes || [];
  if (likes.includes(currentUser.username)) {
    likes = likes.filter(u => u !== currentUser.username); 
  } else {
    likes.push(currentUser.username);
  }
  
  await updateDoc(ref, { likes });
};

window.toggleComments = (postId, context = 'main') => {
  const wrp = document.getElementById(`comments-wrap-${context}-${postId}`);
  if (wrp) wrp.classList.toggle('show');
};

window.toggleReplyBox = (postId, cmtId, context = 'main') => {
  const f = document.getElementById(`reply-form-${context}-${postId}-${cmtId}`);
  if (f) f.style.display = f.style.display === 'none' ? 'flex' : 'none';
};

function generateId() { return Date.now().toString() + Math.random().toString(36).substr(2, 5); }

window.addComment = async (e, postId) => {
  e.preventDefault(); 
  const input = e.target.querySelector("input");
  const txt = input.value.trim(); 
  if (!txt) return;
  
  const ref = doc(db, "posts", postId);
  const snap = await getDoc(ref); 
  if (!snap.exists()) return;
  
  const comments = snap.data().comments || [];
  comments.push({ id: generateId(), userId: currentUser.username, displayName: currentUser.displayName || currentUser.username, text: txt, timestamp: Date.now(), isPinned: false, replies: [] });
  
  await updateDoc(ref, { comments }); 
  input.value = "";
};

window.addReply = async (e, postId, cmtId) => {
  e.preventDefault(); 
  const input = e.target.querySelector("input");
  const txt = input.value.trim(); 
  if (!txt) return;
  
  const ref = doc(db, "posts", postId);
  const snap = await getDoc(ref); 
  if (!snap.exists()) return;
  
  const comments = snap.data().comments || [];
  const idx = comments.findIndex(c => c.id === cmtId || String(c.timestamp) === cmtId);
  
  if (idx > -1) {
    if (!comments[idx].replies) comments[idx].replies = [];
    comments[idx].replies.push({ id: generateId(), userId: currentUser.username, displayName: currentUser.displayName || currentUser.username, text: txt, timestamp: Date.now() });
    await updateDoc(ref, { comments }); 
    input.value = "";
  }
};

window.delCmt = async (postId, cmtId, replyId = null) => {
  if (!confirm("Supprimer ce commentaire ?")) return;
  
  const ref = doc(db, "posts", postId);
  const snap = await getDoc(ref); 
  if (!snap.exists()) return;
  
  let comments = snap.data().comments || [];
  
  if (replyId) {
    const cIdx = comments.findIndex(c => c.id === cmtId || String(c.timestamp) === cmtId);
    if (cIdx > -1 && comments[cIdx].replies) {
       comments[cIdx].replies = comments[cIdx].replies.filter(r => r.id !== replyId && String(r.timestamp) !== replyId);
    }
  } else {
    comments = comments.filter(c => c.id !== cmtId && String(c.timestamp) !== cmtId);
  }
  
  await updateDoc(ref, { comments });
};

window.pinCmt = async (postId, cmtId) => {
  const ref = doc(db, "posts", postId);
  const snap = await getDoc(ref); 
  if (!snap.exists()) return;
  
  let comments = snap.data().comments || [];
  const idx = comments.findIndex(c => c.id === cmtId || String(c.timestamp) === cmtId);
  
  if (idx > -1) {
    comments[idx].isPinned = !comments[idx].isPinned;
    await updateDoc(ref, { comments });
  }
};

window.deletePost = async (id) => { if (confirm("Supprimer ce document ?")) await deleteDoc(doc(db, "posts", id)); };
window.deleteQuiz = async (id) => { if (confirm("Supprimer ce quiz ?")) await deleteDoc(doc(db, "quizzes", id)); };
window.deleteAIQuiz = async (id) => { if (confirm("Supprimer ce quiz IA ?")) await deleteDoc(doc(db, "ai_quizzes", id)); loadAIQuizHistory(); };

window.openShareModal = (itemId, itemType, itemTitle) => {
  window._shareItem = { id: itemId, type: itemType, title: itemTitle };
  const q = query(collection(db, "dm_chats"), where("participants", "array-contains", currentUser.username));
  
  getDocs(q).then(snap => {
    let html = "";
    snap.docs.sort((a,b) => (b.data().lastTimestamp || 0) - (a.data().lastTimestamp || 0)).forEach(d => {
      const c = d.data();
      const partnerUname = c.participants.find(u => u !== currentUser.username);
      const pUser = window.usersMap.get(partnerUname) || {displayName: partnerUname, username: partnerUname};
      
      const avHtml = pUser.avatar 
        ? `<img src="${pUser.avatar}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;">` 
        : `<div class="drawer-av" style="width:38px;height:38px;flex-shrink:0;">${(pUser.displayName || pUser.username).substring(0,2).toUpperCase()}</div>`;

      html += `
        <div class="follow-user-row" onclick="shareToChat('${d.id}', '${partnerUname}')" style="display:flex; align-items:center; gap:12px; cursor:pointer;">
           ${avHtml}
           <div style="flex:1;min-width:0;">
               <div style="font-weight:600;font-size:15px;color:var(--ink);">${pUser.displayName || pUser.username}</div>
               <div style="font-size:13px;color:var(--ink-m);">@${partnerUname}</div>
           </div>
        </div>
      `;
    });
    if (!html) html = "<div class='empty-text'>Aucune discussion récente. Va dans Messages pour en créer une.</div>";
    document.getElementById("share-contacts-list").innerHTML = html;
    openModal('m-share');
  });
};

window.shareToChat = async (chatId, partnerUname) => {
  if (!window._shareItem) return;
  
  await addDoc(collection(db, "dm_messages"), {
    chatId: chatId,
    senderId: currentUser.username,
    text: "", 
    fileUrl: "",
    sharedItemId: window._shareItem.id,
    sharedItemType: window._shareItem.type,
    sharedItemTitle: window._shareItem.title,
    timestamp: Date.now()
  });

  await updateDoc(doc(db, "dm_chats", chatId), {
    lastMessage: `Partage : ${window._shareItem.title.substring(0, 20)}...`,
    lastTimestamp: Date.now(),
    lastSenderId: currentUser.username,
    readBy: [currentUser.username]
  });

  closeModal('m-share');
  showToast("Partagé avec succès ✓");
  
  const pUser = window.usersMap.get(partnerUname);
  if (pUser) sendEmailNotif('message', pUser);
};

window.openSharedItem = async (id, type) => {
  if (type === 'quiz') {
    checkAndStartQuiz(id, false);
  } else if (type === 'ai_quiz') {
    checkAndStartQuiz(id, true);
  } else if (type === 'post') {
    const snap = await getDoc(doc(db, "posts", id));
    if (!snap.exists()) {
      showToast("Ce document n'existe plus ou a été supprimé.");
      return;
    }
    const p = { id: snap.id, ...snap.data() };
    const html = window.getPostHTML(p, 'shared');
    document.getElementById("view-post-content").innerHTML = html;
    openModal("m-view-post");
  }
};


window.switchPubTab = (tabId) => {
  window._pubTabActive = tabId;
  document.querySelectorAll('#pub-tiktok-tabs .tk-tab').forEach(b => b.classList.remove('active'));
  document.querySelector(`#pub-tiktok-tabs .tk-tab[data-ptab="${tabId}"]`).classList.add('active');
  
  document.querySelectorAll('.pub-tab-content').forEach(c => c.style.display = 'none');
  document.getElementById(`pub-tab-${tabId}`).style.display = 'block';

  const fContainer = document.getElementById("pub-filter-container");
  if (tabId === 'cours' || tabId === 'quiz') fContainer.style.display = 'block';
  else fContainer.style.display = 'none';

  if (window._currentViewedUser) renderPublicProfile(window._currentViewedUser.username);
  if (tabId === 'likes') renderPubLikes();
};

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
}

window.renderPublicProfile = (uname) => {
  document.querySelectorAll(".page-view").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".nav-tab").forEach(b => b.classList.remove("active"));
  
  const pubPage = document.getElementById("page-pub-profil");
  if (pubPage) {
    pubPage.classList.remove("active");
    void pubPage.offsetWidth; 
    pubPage.classList.add("active");
  }
  
  const loading = document.getElementById("pub-loading-overlay");
  const wrapper = document.getElementById("pub-content-wrapper");
  loading.style.display = "flex";
  wrapper.style.display = "none";
  window.scrollTo({ top: 0, behavior: "smooth" });

  setTimeout(() => {
    const targetUser = window.usersMap.get(uname);
    if (!targetUser) { 
      loading.style.display = "none"; 
      showToast("Membre introuvable"); 
      window.location.hash = "#accueil"; 
      return; 
    }

    loading.style.display = "none";
    wrapper.style.display = "block";

    window._currentViewedUser = targetUser;

    document.getElementById("pub-banner").style.backgroundImage = targetUser.banner ? `url('${targetUser.banner}')` : "";

    const imgEl = document.getElementById("pub-av-img"), initEl = document.getElementById("pub-av-init");
    if (targetUser.avatar) {
      imgEl.src = targetUser.avatar; 
      imgEl.style.display = "block"; 
      initEl.style.display = "none";
    } else {
      imgEl.style.display = "none"; 
      initEl.style.display = "block";
      initEl.innerText = (targetUser.displayName || targetUser.username).split(" ").map(x => x[0]).join("").substring(0, 2).toUpperCase();
    }

    const badge = getBadge(targetUser);
    document.getElementById("pub-name").innerHTML = (targetUser.displayName || targetUser.username) + badge;

    document.getElementById("pub-id").innerText   = targetUser.username;
    
    let bioContent = targetUser.bio || "Aucune biographie.";
    const isAdmin = targetUser.role === "admin" || (targetUser.subRoles && targetUser.subRoles.includes("admin"));
    
    if (isAdmin && bioContent !== "Aucune biographie.") {
        bioContent = escapeHTML(bioContent);
        bioContent = bioContent.replace(/@([a-zA-Z0-9._]+)/g, '<a style="color:var(--primary); font-weight:600; text-decoration:none;" href="#$1">@$1</a>');
        document.getElementById("pub-bio").innerHTML = bioContent;
    } else {
        document.getElementById("pub-bio").innerText = bioContent;
    }

    const roleEl = document.getElementById("pub-role"); 
    roleEl.innerText = targetUser.role || "élève";
    roleEl.className = "rbadge " + (targetUser.role === "professeur" ? "professeur" : targetUser.role === "admin" ? "admin" : targetUser.role === "HS" ? "hs" : "eleve");

    const fakesCount = targetUser.fakeFollowersCount !== undefined ? targetUser.fakeFollowersCount : (targetUser.fakeFollowers || []).length;
    const realsCount = (targetUser.followers || []).length;

    document.getElementById("pub-cnt-followers").innerText = window.formatNumber(realsCount + fakesCount);
    document.getElementById("pub-cnt-following").innerText = window.formatNumber((targetUser.following || []).length);

    const socBox = document.getElementById("pub-socials"); 
    socBox.innerHTML = "";
    if (targetUser.instagram) {
      const cleanInsta = targetUser.instagram.replace("https://instagram.com/", "").replace("https://www.instagram.com/", "").replace("@", "").trim();
      socBox.innerHTML += `<a href="https://instagram.com/${cleanInsta}" target="_blank" class="soc-pill insta"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><rect x="2" y="2" width="20" height="20" rx="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line></svg><span>${cleanInsta}</span></a>`;
    }
    if (targetUser.linkedin) {
      const cleanLd = targetUser.linkedin.startsWith("http") ? targetUser.linkedin : "https://" + targetUser.linkedin;
      socBox.innerHTML += `<a href="${cleanLd}" target="_blank" class="soc-pill linkedin"><svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" fill="none"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path><rect x="2" y="9" width="4" height="12"></rect><circle cx="4" cy="4" r="2"></circle></svg><span>LinkedIn</span></a>`;
    }
    if (targetUser.tiktok) {
      const cleanTk = targetUser.tiktok.replace("https://tiktok.com/", "").replace("https://www.tiktok.com/", "").replace("@", "").trim();
      socBox.innerHTML += `<a href="https://tiktok.com/@${cleanTk}" target="_blank" class="soc-pill tiktok"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.525.02c1.31-.02 2.61-.01 3.91 0 .73 1.5 1.93 2.7 3.44 3.26v4.06c-1.33-.28-2.58-.93-3.56-1.87-.01 2.21-.01 4.41-.02 6.62-.2 2.6-1.6 5.06-3.86 6.36-2.6 1.5-5.91 1.25-8.15-.65-2.07-1.77-2.98-4.66-2.22-7.25.75-2.52 2.87-4.46 5.48-4.93v4.25c-1.2.29-2.23 1.16-2.6 2.37-.38 1.25.04 2.65 1.05 3.44 1.1.84 2.7.93 3.9.23 1.15-.67 1.83-1.89 1.83-3.21.02-4.8.02-9.6.02-14.4 0-.01-.01-.02-.02-.03z"/></svg><span>${cleanTk}</span></a>`;
    }

    const followBtn = document.getElementById("pub-follow-btn");
    if (currentUser && targetUser.username === currentUser.username) followBtn.style.display = "none";
    else {
      followBtn.style.display = "inline-flex";
      if ((currentUser?.following || []).includes(targetUser.username)) { 
        followBtn.innerText = "Abonné ✓"; 
        followBtn.className = "btn-pill btn-following"; 
      } else { 
        followBtn.innerText = "S'abonner"; 
        followBtn.className = "btn-pill"; 
      }
    }

    if (window._pubFeedUnsub) { window._pubFeedUnsub(); window._pubFeedUnsub = null; }
    
    if (window._pubTabActive === 'cours') {
      const qFeed = query(collection(db, "posts"), where("authorId", "==", targetUser.username));
      window._pubFeedUnsub = onSnapshot(qFeed, snapFeed => {
        const rawDocs = window.filterVisibleContent(snapFeed.docs.map(d => ({ id: d.id, ...d.data() })), 'post');
        document.getElementById("pub-cnt-contribs-top").innerText = rawDocs.length;

        const userMats = [...new Set(rawDocs.map(p => p.matiere))].sort();
        let filterBarHtml = `<button class="filter-btn ${window._pubSubjFilter === 'all' ? 'active' : ''}" onclick="setPubSubjFilter('all',this)">Tout (${rawDocs.length})</button>`;
        userMats.forEach(mName => {
          const icon = window.subjectsMap.get(mName) || "📚";
          const cnt = rawDocs.filter(p => p.matiere === mName).length;
          filterBarHtml += `<button class="filter-btn ${window._pubSubjFilter === mName ? 'active' : ''}" onclick="setPubSubjFilter('${esc(mName)}',this)">${icon} ${mName} (${cnt})</button>`;
        });
        document.getElementById("pub-subj-filter-bar").innerHTML = filterBarHtml;

        const filteredDocs = window._pubSubjFilter === 'all' ? rawDocs : rawDocs.filter(p => p.matiere === window._pubSubjFilter);
        renderFeedFromDocs(filteredDocs, document.getElementById("pub-feed"), "Aucun document partagé pour ce filtre.", 'recent', 'pubfeed');
      });
    } else if (window._pubTabActive === 'quiz') {
      const qFeed = query(collection(db, "quizzes"), where("authorId", "==", targetUser.username));
      window._pubFeedUnsub = onSnapshot(qFeed, snapFeed => {
        const rawDocs = window.filterVisibleContent(snapFeed.docs.map(d => ({ id: d.id, ...d.data() })), 'quiz');
        
        const userMats = [...new Set(rawDocs.map(p => p.matiere))].sort();
        let filterBarHtml = `<button class="filter-btn ${window._pubSubjFilter === 'all' ? 'active' : ''}" onclick="setPubSubjFilter('all',this)">Tout (${rawDocs.length})</button>`;
        userMats.forEach(mName => {
          const icon = window.subjectsMap.get(mName) || "📚";
          const cnt = rawDocs.filter(p => p.matiere === mName).length;
          filterBarHtml += `<button class="filter-btn ${window._pubSubjFilter === mName ? 'active' : ''}" onclick="setPubSubjFilter('${esc(mName)}',this)">${icon} ${mName} (${cnt})</button>`;
        });
        document.getElementById("pub-subj-filter-bar").innerHTML = filterBarHtml;

        const filteredDocs = window._pubSubjFilter === 'all' ? rawDocs : rawDocs.filter(p => p.matiere === window._pubSubjFilter);
        renderQuizFeedToContainer(filteredDocs, document.getElementById("pub-quiz-feed"), "Aucun quiz partagé pour ce filtre.");
      });
    } else if (window._pubTabActive === 'quiz-ia') {
      const qFeed = query(collection(db, "ai_quizzes"), where("authorId", "==", targetUser.username));
      window._pubFeedUnsub = onSnapshot(qFeed, snapFeed => {
        const rawDocs = window.filterVisibleContent(snapFeed.docs.map(d => ({ id: d.id, ...d.data() })), 'quiz');
        renderQuizFeedToContainer(rawDocs, document.getElementById("pub-quiz-ia-feed"), "Aucun quiz IA généré pour l'instant.");
      });
    } else if (window._pubTabActive === 'likes') {
      loadPubLikes();
    }
  }, 100);
};

window.setPubSubjFilter = (val, btn) => {
  window._pubSubjFilter = val;
  document.querySelectorAll("#pub-subj-filter-bar .filter-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  if (window._currentViewedUser) renderPublicProfile(window._currentViewedUser.username);
};

window.loadPubLikes = () => {
  if (!window._currentViewedUser) return;
  if (window._pubLikesUnsubPosts) { window._pubLikesUnsubPosts(); }
  if (window._pubLikesUnsubQuizzes) { window._pubLikesUnsubQuizzes(); }
  if (window._pubLikesUnsubAIQuizzes) { window._pubLikesUnsubAIQuizzes(); }

  const uname = window._currentViewedUser.username;
  window._pubLikesData = { posts: [], quizzes: [], ai_quizzes: [] };

  document.getElementById("pub-likes-feed").innerHTML = `<div style="display:flex;justify-content:center;grid-column:1/-1;padding:40px"><div class="spinner"></div></div>`;

  const triggerRender = () => {
    if (window._pubTabActive === 'likes') renderPubLikes();
  };

  const qPosts = query(collection(db, "posts"), where("likes", "array-contains", uname));
  window._pubLikesUnsubPosts = onSnapshot(qPosts, snap => {
    window._pubLikesData.posts = snap.docs.map(d => ({ id: d.id, _feedType: 'post', ...d.data() }));
    triggerRender();
  });

  const qQuizzes = query(collection(db, "quizzes"), where("likes", "array-contains", uname));
  window._pubLikesUnsubQuizzes = onSnapshot(qQuizzes, snap => {
    window._pubLikesData.quizzes = snap.docs.map(d => ({ id: d.id, _feedType: 'quiz', ...d.data() }));
    triggerRender();
  });

  const qAIQuizzes = query(collection(db, "ai_quizzes"), where("likes", "array-contains", uname));
  window._pubLikesUnsubAIQuizzes = onSnapshot(qAIQuizzes, snap => {
    window._pubLikesData.ai_quizzes = snap.docs.map(d => ({ id: d.id, _feedType: 'quiz', ...d.data() }));
    triggerRender();
  });
};

window.renderPubLikes = () => {
  const sortOrder = document.getElementById("pub-likes-sort").value;
  
  const rawDocs = window.filterVisibleContent([
    ...window._pubLikesData.posts,
    ...window._pubLikesData.quizzes,
    ...window._pubLikesData.ai_quizzes
  ]);

  const container = document.getElementById("pub-likes-feed");
  container.innerHTML = "";

  if (rawDocs.length === 0) {
    container.innerHTML = `<div class="empty-text">Aucun document ou quiz aimé pour le moment.</div>`;
    return;
  }

  if (sortOrder === 'oldest') {
    rawDocs.sort((a,b) => (a.timestamp || 0) - (b.timestamp || 0));
  } else {
    rawDocs.sort((a,b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  rawDocs.forEach(item => {
    if (item._feedType === 'post') {
      container.innerHTML += window.getPostHTML(item, 'publikes');
    } else {
      container.innerHTML += window.getQuizHTML(item);
    }
  });
};

window.toggleFollowCurrentProfile = async () => {
  if (!window._currentViewedUser || !currentUser) return;
  const targetUname = window._currentViewedUser.username; 
  if (targetUname === currentUser.username) return;
  
  const targetDoc = window.usersMap.get(targetUname); 
  if (!targetDoc) return;

  let myFollowing = [...(currentUser.following || [])], theirFollowers = [...(targetDoc.followers || [])];
  const isFollowing = myFollowing.includes(targetUname);

  if (isFollowing) {
    myFollowing = myFollowing.filter(x => x !== targetUname); 
    theirFollowers = theirFollowers.filter(x => x !== currentUser.username);
  } else {
    myFollowing.push(targetUname); 
    theirFollowers.push(currentUser.username);
  }

  currentUser.following = myFollowing; 
  saveSessionLocally(currentUser);
  
  const fBtn = document.getElementById("pub-follow-btn");
  if (fBtn) { 
    if (!isFollowing) {
      fBtn.innerText = "Abonné ✓";
      fBtn.className = "btn-pill btn-following"; 
    } else {
      fBtn.innerText = "S'abonner";
      fBtn.className = "btn-pill";
    } 
  }

  await Promise.all([
    updateDoc(doc(db, "users", currentUser.id), { following: myFollowing }), 
    updateDoc(doc(db, "users", targetDoc.id), { followers: theirFollowers })
  ]);
};

window.openFollowersModal = (mode) => {
  if (!window._currentViewedUser) return;
  const isFollowers = mode === 'followers';
  document.getElementById("m-follows-title").innerText = isFollowers ? "Abonnés" : "Abonnements";
  
  const box = document.getElementById("follows-list-box"); 
  box.innerHTML = "";
  
  const realUsernames = isFollowers ? (window._currentViewedUser.followers || []) : (window._currentViewedUser.following || []);
  let fullList = realUsernames.map(u => window.usersMap.get(u)).filter(Boolean);

  if (isFollowers && window._currentViewedUser.fakeFollowers) {
    fullList = [...fullList, ...window._currentViewedUser.fakeFollowers];
  }

  const totalAvailable = fullList.length;
  fullList = fullList.slice(0, 50);

  if (fullList.length === 0) {
    box.innerHTML = `<div class="empty-text" style="padding:40px 0">Personne ici</div>`;
  } else {
    fullList.forEach(u => {
      const nameDisp = u.displayName || u.username;
      const roleDisp = u.role || "élève";
      const avHtml = u.avatar ? `<img src="${u.avatar}" style="display:block;">` : `<span style="display:block">${nameDisp.split(" ").map(x => x[0]).join("").substring(0, 2).toUpperCase()}</span>`;
      const badge = getBadge(u);
      
      box.innerHTML += `
      <div class="follow-user-row" onclick="if(!'${u.isFake || ''}'){ window.location.hash='#${esc(u.username)}'; closeModal('m-follows'); }">
        <div class="drawer-av" style="flex-shrink:0">${avHtml}</div>
        <div style="min-width:0;flex:1">
          <div style="font-weight:600;font-size:15px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nameDisp}${badge}</div>
          <div style="font-size:13px;color:var(--ink-m)">@${u.username} • <span style="text-transform:capitalize">${roleDisp}</span></div>
        </div>
      </div>`;
    });
    if (totalAvailable > 50) {
      box.innerHTML += `<div style="text-align:center; padding: 12px; font-size:13px; color:var(--ink-m); margin-top:8px; border-top: 1px solid var(--hl);">L'affichage est limité aux 50 premiers pour préserver la vitesse.</div>`;
    }
  }
  openModal("m-follows");
};

window.openCurrentDMProfile = () => {
  if (window._activeChatPartnerId) {
    window.location.hash = '#' + window._activeChatPartnerId;
  }
};

function loadDMChats() {
if (!currentUser) return;
if (window._dmChatsUnsub) window._dmChatsUnsub();

const filters = window.getUserVisibilityFilters();
const q = query(collection(db, "dm_chats"), where("participants", "array-contains", currentUser.username));

window._dmChatsUnsub = onSnapshot(q, snap => {
  const box = document.getElementById("dm-contacts-list");
  if (snap.empty) { 
    box.innerHTML = `<div class="empty-text">Aucune discussion</div>`;
    updateUnreadDots(0); 
    return; 
  }
  
  let html = "";
  let chats = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  
  chats = chats.filter(chat => {
    const otherUname = chat.participants.find(u => u !== currentUser.username);
    const otherUser = window.usersMap.get(otherUname);
    if (!otherUser) return false;
    if (otherUser.role === 'HS') return false;
    if (filters.isAdminOrHS) return true;
    const otherIsAdmin = otherUser.role === 'admin' || (otherUser.subRoles && otherUser.subRoles.includes('admin'));
    if (otherIsAdmin) return true;
    return otherUser.etablissementId === currentUser.etablissementId &&
           otherUser.classeId === currentUser.classeId;
  });

  chats.sort((a, b) => (b.lastTimestamp || 0) - (a.lastTimestamp || 0));
  
  let unreadCount = 0;

  chats.forEach(c => {
    const partnerUname = c.participants.find(u => u !== currentUser.username);
    const partnerUser = window.usersMap.get(partnerUname) || { username: partnerUname, displayName: partnerUname };
    const dName = partnerUser.displayName || partnerUser.username;
    const partnerBadge = getBadge(partnerUser);
    const init = dName.split(" ").map(x => x[0]).join("").substring(0, 2).toUpperCase();
    const avHtml = partnerUser.avatar ? `<img src="${partnerUser.avatar}" style="display:block;width:100%;height:100%;object-fit:cover;">` : init;
    
    const isUnreadByMe = c.lastSenderId && c.lastSenderId !== currentUser.username && (!c.readBy || !c.readBy.includes(currentUser.username));
    if (isUnreadByMe) unreadCount++;

    const amILastSender = c.lastSenderId === currentUser.username;
    let statusText = "";
    if (amILastSender) {
       const isReadByPartner = c.readBy && c.readBy.includes(partnerUname);
       statusText = isReadByPartner ? `<span class="msg-status">· Vu</span>` : `<span class="msg-status">· Envoyé</span>`;
    }

    const previewClass = isUnreadByMe ? "msg-unread-preview" : "";
    const isActive = window._activeChatId === c.id;

    html += `
      <div class="dm-contact-row ${isActive ? 'active' : ''}" onclick="openChat('${c.id}', '${partnerUname}')">
         <div class="drawer-av" style="flex-shrink:0">${avHtml}</div>
         <div style="flex:1;min-width:0;">
           <div style="font-weight:600;font-size:15px;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${dName}${partnerBadge}</div>
           <div style="font-size:13px;color:var(--ink-m);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" class="${previewClass}">${c.lastMessage || 'Nouvelle discussion'} ${statusText}</div>
         </div>
      </div>
    `;
  });
  
  if (chats.length === 0 && !snap.empty) {
    box.innerHTML = `<div class="empty-text">Aucune discussion disponible dans votre classe.</div>`;
  } else {
    box.innerHTML = html;
  }
  updateUnreadDots(unreadCount);
});
}

window.renderContactSearch = () => {
  const v = document.getElementById("search-contact").value.trim().toLowerCase();
  const box = document.getElementById("new-chat-list");
  let html = "";
  let count = 0;
  
  for (const [uname, u] of window.usersMap.entries()) {
    if (uname === currentUser.username) continue;
    if (u.allowMessages === false) continue;
    if (!window.canContactUser(u)) continue;
    
    const dName = u.displayName || uname;
    if (!v || dName.toLowerCase().includes(v) || uname.includes(v)) {
      const init = dName.split(" ").map(x => x[0]).join("").substring(0, 2).toUpperCase();
      const avHtml = u.avatar ? `<img src="${u.avatar}" style="display:block;width:100%;height:100%;object-fit:cover;">` : init;
      const uBadge = getBadge(u);
      html += `
        <div class="follow-user-row" onclick="startNewChat('${uname}')">
          <div class="drawer-av" style="flex-shrink:0">${avHtml}</div>
          <div style="min-width:0;flex:1"><div style="font-weight:600;font-size:15px; display:flex; align-items:center;">${dName}${uBadge}</div><div style="font-size:13px;color:var(--ink-m)">@${uname}</div></div>
        </div>
      `;
      count++;
    }
  }
  if (count === 0) html = `<div class="empty-text">Aucun membre trouvé</div>`;
  box.innerHTML = html;
};

window.startNewChat = async (targetUname) => {
if (!currentUser) return;

const targetUser = window.usersMap.get(targetUname);
if (!targetUser) { showToast("Utilisateur introuvable."); return; }

if (!window.canContactUser(targetUser) || targetUser.role === 'HS') {
  showToast("Vous ne pouvez pas ouvrir de conversation avec un compte HS.");
  return;
}
  closeModal('m-new-chat');
  
  const q = query(collection(db, "dm_chats"), where("participants", "array-contains", currentUser.username));
  const snap = await getDocs(q);
  let existingChatId = null;
  
  snap.forEach(d => {
    if (d.data().participants.includes(targetUname)) existingChatId = d.id;
  });
  
  if (existingChatId) {
    openChat(existingChatId, targetUname);
  } else {
    const newRef = doc(collection(db, "dm_chats"));
    await setDoc(newRef, { participants: [currentUser.username, targetUname], lastMessage: "", lastTimestamp: Date.now() });
    openChat(newRef.id, targetUname);
  }
};

window.openChat = async (chatId, partnerUname) => {
  window._activeChatId = chatId;
  window._activeChatPartnerId = partnerUname;

  const chatSnap = await getDoc(doc(db, "dm_chats", chatId));
  if (chatSnap.exists()) {
    const c = chatSnap.data();
    if (c.lastSenderId && c.lastSenderId !== currentUser.username && (!c.readBy || !c.readBy.includes(currentUser.username))) {
      await updateDoc(doc(db, "dm_chats", chatId), { readBy: [...(c.readBy||[]), currentUser.username] });
    }
  }
  
  document.getElementById("dm-form").style.display = "flex";
  document.querySelectorAll(".dm-contact-row").forEach(r => r.classList.remove("active"));
  
  if (window.innerWidth <= 850) {
    document.getElementById("dm-sidebar").classList.add("hide-mobile");
    document.getElementById("dm-chat-area").classList.remove("hide-mobile");
  }

  const pUser = window.usersMap.get(partnerUname) || { username: partnerUname, displayName: partnerUname };
  const pBadge = getBadge(pUser);
  document.getElementById("dm-active-name").innerHTML = (pUser.displayName || pUser.username) + pBadge;
  document.getElementById("dm-active-role").innerText = "@" + pUser.username + (pUser.role ? " • " + pUser.role : "");
  
  const init = (pUser.displayName || pUser.username).split(" ").map(x => x[0]).join("").substring(0, 2).toUpperCase();
  const avImg = document.getElementById("dm-active-av");
  const avInit = document.getElementById("dm-active-init");
  
  if (pUser.avatar) { 
    avImg.src = pUser.avatar; 
    avImg.style.display = "block"; 
    avInit.style.display = "none"; 
  } else { 
    avImg.style.display = "none"; 
    avInit.style.display = "block"; 
    avInit.innerText = init; 
  }

  if (window._dmMsgsUnsub) window._dmMsgsUnsub();
  
  const q = query(collection(db, "dm_messages"), where("chatId", "==", chatId));
  window._dmMsgsUnsub = onSnapshot(q, snap => {
    const docs = snap.docs.map(d => d.data());
    docs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)); 

    const box = document.getElementById("dm-msgs-box");
    box.innerHTML = "";
    
    docs.forEach(m => {
      const isMe = m.senderId === currentUser.username;
      const dStr = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      let attachHtml = "";
      if (m.fileUrl) {
         if (m.fileUrl.match(/\.(jpeg|jpg|gif|png|webp)$/i) || m.fileUrl.includes("res.cloudinary.com/")) {
           attachHtml = `<div style="margin-bottom:6px;"><a href="${m.fileUrl}" target="_blank"><img src="${m.fileUrl}" style="max-width:100%;border-radius:8px;max-height:200px;object-fit:cover;"></a></div>`;
         } else {
           attachHtml = `<div style="margin-bottom:6px;"><a href="${m.fileUrl}" target="_blank" style="color:inherit;text-decoration:underline;">📄 Pièce jointe</a></div>`;
         }
      }
      
      let shareHtml = "";
      if (m.sharedItemId) {
        const icon = (m.sharedItemType === 'post') ? '📄' : '🎯';
        const typeLabel = (m.sharedItemType === 'post') ? 'Document' : (m.sharedItemType === 'ai_quiz' ? 'Quiz IA' : 'Quiz');
        shareHtml = `
          <div style="margin-top: ${m.text || attachHtml ? '8px' : '0'}; padding:12px; background:var(--card-bg); border:1px solid var(--hl); border-radius:12px; color:var(--ink);">
            <div style="font-weight:600; font-size:14px; margin-bottom:8px; display:flex; align-items:center; gap:6px;">
              <span style="font-size:18px;">${icon}</span> ${typeLabel} partagé
            </div>
            <div style="font-size:13px; margin-bottom:12px; line-height:1.4;">${m.sharedItemTitle}</div>
            <button class="btn-pill" style="width:100%; justify-content:center; padding:8px 12px; font-size:13px;" onclick="openSharedItem('${m.sharedItemId}', '${m.sharedItemType}')">Ouvrir</button>
          </div>
        `;
      }
      
      box.innerHTML += `
        <div class="dm-msg-wrapper ${isMe ? 'me' : 'them'}">
          <div class="dm-msg-bubble">
            ${attachHtml}
            ${m.text ? `<div>${m.text}</div>` : ''}
            ${shareHtml}
          </div>
          <div class="dm-msg-time">${dStr}</div>
        </div>
      `;
    });
    box.scrollTop = box.scrollHeight;
  });
};

window.backToDMSidebar = () => {
  document.getElementById("dm-sidebar").classList.remove("hide-mobile");
  document.getElementById("dm-chat-area").classList.add("hide-mobile");
};

window.handleDMFile = (e) => {
  const file = e.target.files[0]; 
  if (!file) return;
  
  if (file.size > 25 * 1024 * 1024) { 
    e.target.value = ""; 
    openModal("m-filesize"); 
    return; 
  }
  
  window._dmFileToUpload = file;
  document.getElementById("dm-file-preview").style.display = "block";
  document.getElementById("dm-file-preview").innerText = "📎 " + file.name + " prêt à envoyer";
};

window.handleSendDM = async (e) => {
  e.preventDefault();
  if (!window._activeChatId) return;
  
  const input = document.getElementById("dm-text-input");
  const txt = input.value.trim();
  
  if (!txt && !window._dmFileToUpload) return;
  
  const btn = e.target.querySelector("button");
  btn.disabled = true;

  let fileUrl = "";
  if (window._dmFileToUpload) {
    try { 
      fileUrl = await uploadToCloudinary(window._dmFileToUpload); 
    } catch(er) { 
      showToast("Erreur upload pièce jointe"); 
      btn.disabled = false; 
      return; 
    }
  }

  await addDoc(collection(db, "dm_messages"), {
    chatId: window._activeChatId,
    senderId: currentUser.username,
    text: txt,
    fileUrl: fileUrl,
    timestamp: Date.now()
  });

  const shortMsg = txt ? (txt.length > 25 ? txt.substring(0, 25) + "..." : txt) : "Pièce jointe 📎";
  await updateDoc(doc(db, "dm_chats", window._activeChatId), {
    lastMessage: shortMsg,
    lastTimestamp: Date.now(),
    lastSenderId: currentUser.username,
    readBy: [currentUser.username]
  });

  const pUser = window.usersMap.get(window._activeChatPartnerId);
  if (pUser) sendEmailNotif('message', pUser);

  input.value = "";
  window._dmFileToUpload = null;
  document.getElementById("dm-file-preview").style.display = "none";
  document.getElementById("dm-file-input").value = "";
  btn.disabled = false;
};

async function callGroqAPI(systemPrompt, userPrompt) {
  const conversationHistory = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ];

  const payload = {
    model: GROQ_MODEL,
    messages: conversationHistory,
    temperature: 0.6,
    max_tokens: 3000,
    response_format: { type: "json_object" }
  };

  console.log("📤 Envoi à Groq via Worker :", payload);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ Réponse Worker :", response.status, errorText);
      throw new Error(`Erreur HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    console.log("✅ Réponse Groq reçue :", data);

    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      throw new Error("Réponse Groq invalide : pas de choix");
    }

    const text = data.choices[0].message.content;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("La réponse de l'IA ne contient pas de JSON valide.");
    }
  } catch (e) {
    console.error("❌ Erreur callGroqAPI :", e);
    showToast("Erreur avec l'IA : " + e.message);
    throw e;
  }
}

let quizQuestionCount = 0;
window.addQuizQuestionField = () => {
  if (quizQuestionCount >= 50) { 
    showToast("Maximum 50 questions."); 
    return; 
  }
  quizQuestionCount++;
  const container = document.getElementById("quiz-questions-container");
  
  const html = `
    <div class="quiz-question-box" id="qbox-${quizQuestionCount}">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0; font-size:16px;">Question ${quizQuestionCount}</h3>
        <button class="btn-ghost btn-sm del" onclick="document.getElementById('qbox-${quizQuestionCount}').remove()">Supprimer</button>
      </div>
      <input type="text" class="input-q-text" placeholder="Pose ta question..." style="width:100%; padding:10px; border-radius:8px; border:1px solid var(--hl); margin-bottom:12px;" required>
      <div style="display:flex; flex-direction:column; gap:8px;">
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="radio" name="correct-${quizQuestionCount}" value="0" checked title="Bonne réponse">
          <input type="text" class="input-opt" placeholder="Réponse 1 (Bonne réponse par défaut)" style="flex:1; padding:8px; border-radius:8px; border:1px solid var(--hl);" required>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="radio" name="correct-${quizQuestionCount}" value="1">
          <input type="text" class="input-opt" placeholder="Réponse 2" style="flex:1; padding:8px; border-radius:8px; border:1px solid var(--hl);" required>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="radio" name="correct-${quizQuestionCount}" value="2">
          <input type="text" class="input-opt" placeholder="Réponse 3 (Optionnel)" style="flex:1; padding:8px; border-radius:8px; border:1px solid var(--hl);">
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <input type="radio" name="correct-${quizQuestionCount}" value="3">
          <input type="text" class="input-opt" placeholder="Réponse 4 (Optionnel)" style="flex:1; padding:8px; border-radius:8px; border:1px solid var(--hl);">
        </div>
      </div>
      <input type="text" class="input-just" placeholder="Explication (affichée lors de la correction) - Facultatif" style="width:100%; padding:8px; border-radius:8px; border:1px solid var(--hl); margin-top:12px;">
    </div>
  `;
  container.insertAdjacentHTML('beforeend', html);
};

window.handleCreateManualQuiz = async () => {
  const title = document.getElementById("quiz-create-title").value.trim();
  const matiere = document.getElementById("quiz-create-matiere").value;
  const desc = document.getElementById("quiz-create-desc").value.trim();
  const tags = document.getElementById("quiz-create-tag-bac")?.checked ? ["bac"] : [];
  
  if (!title || !matiere) { 
    showToast("Titre et matière requis."); 
    return; 
  }
  
  const qBoxes = document.querySelectorAll("#quiz-questions-container .quiz-question-box");
  if (qBoxes.length === 0) { 
    showToast("Ajoute au moins une question."); 
    return; 
  }

  const questions = [];
  let valid = true;

  qBoxes.forEach((box, index) => {
    const qTextInput = box.querySelector(".input-q-text");
    if (!qTextInput) return;
    
    const qText = qTextInput.value.trim();
    const optsInputs = box.querySelectorAll(".input-opt");
    const radios = box.querySelectorAll(`input[type="radio"]`);
    const just = box.querySelector(".input-just").value.trim();

    if (!qText) valid = false;

    const options = [];
    let correctIndex = 0;

    optsInputs.forEach((inp, idx) => {
      const val = inp.value.trim();
      if (val) {
        options.push(val);
        if (radios[idx].checked) correctIndex = options.length - 1;
      }
    });

    if (options.length < 2) valid = false;

    questions.push({
      question: qText,
      options: options,
      correctIndex: correctIndex,
      justification: just
    });
  });

  if (!valid || questions.length === 0) { 
    showToast("Vérifie que chaque question a un texte et au moins 2 réponses."); 
    return; 
  }

  const quiz = {
    title, matiere, description: desc, tags,
    questions, isAI: false,
    likes: [], 
    authorId: currentUser.username, 
    authorDisplayName: currentUser.displayName || currentUser.username,
    authorAvatar: currentUser.avatar || "", 
    authorRole: currentUser.role || "élève",
    etablissementId: currentUser.etablissementId || "",
    classeId: currentUser.classeId || "",
    timestamp: Date.now()
  };

  try {
    await addDoc(collection(db, "quizzes"), quiz);
    document.getElementById("quiz-create-title").value = "";
    document.getElementById("quiz-create-desc").value = "";
    document.getElementById("quiz-create-tag-bac").checked = false;
    document.getElementById("quiz-questions-container").innerHTML = "";
    quizQuestionCount = 0;
    
    syncContrib();
    showToast("Quiz publié avec succès !");
    switchTab('quiz');
  } catch(e) { 
    showToast("Erreur lors de la publication."); 
  }
};

function loadQuizFeed() {
if (window._quizUnsub) { window._quizUnsub(); window._quizUnsub = null; }
if (window._aiQuizUnsub) { window._aiQuizUnsub(); window._aiQuizUnsub = null; }

const container = document.getElementById("quiz-feed"); 
if (!container) return;

container.innerHTML = `<div style="display:flex;justify-content:center;grid-column:1/-1;padding:40px"><div class="spinner"></div></div>`;

const filters = window.getUserVisibilityFilters();

const renderCombined = () => {
let combined = [...(window._liveQuizzesData || []), ...(window._liveAIQuizzesData || [])];
combined = window.filterVisibleContent(combined, 'quiz');
if (window._quizFilter.type === 'manuel') combined = combined.filter(q => !q.isAI);
if (window._quizFilter.type === 'ia') combined = combined.filter(q => q.isAI);
if (window._quizFilter.tags.length) combined = combined.filter(q => (Array.isArray(q.tags) ? q.tags : []).some(tag => window._quizFilter.tags.includes(tag)));
renderQuizFeedToContainer(combined, container, "Aucun quiz disponible", window._quizFilter.order);
};

const qQuizzes = window._quizFilter.subject === "all"
  ? query(collection(db, "quizzes"))
  : query(collection(db, "quizzes"), where("matiere", "==", window._quizFilter.subject));
  
window._quizUnsub = onSnapshot(qQuizzes, snap => {
  window._liveQuizzesData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderCombined();
});

const qAI = window._quizFilter.subject === "all"
  ? query(collection(db, "ai_quizzes"))
  : query(collection(db, "ai_quizzes"), where("matiere", "==", window._quizFilter.subject));
  
window._aiQuizUnsub = onSnapshot(qAI, snap => {
  window._liveAIQuizzesData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  renderCombined();
});
}
function renderQuizFeedToContainer(quizzesArray, container, emptyMsg, sortOrder = 'recent') {
  container.innerHTML = "";
  if (quizzesArray.length === 0) {
    container.innerHTML = `<div class="empty-text">${emptyMsg || "Aucun quiz pour l'instant"}</div>`; 
    return;
  }

  if (sortOrder === 'likes') {
    quizzesArray.sort((a,b) => (b.likes || []).length - (a.likes || []).length);
  } else if (sortOrder === 'oldest') {
    quizzesArray.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  } else {
    quizzesArray.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }

  quizzesArray.forEach(q => {
    container.innerHTML += window.getQuizHTML(q);
  });
}

function loadAIQuizHistory() {
  if (!currentUser) return;
  const container = document.getElementById("settings-ai-quiz-history");
  if (!container) return;
  
  const qFeed = query(collection(db, "ai_quizzes"), where("authorId", "==", currentUser.username));
  
  onSnapshot(qFeed, snap => {
    if (snap.empty) {
      container.innerHTML = `<div class="empty-text">Aucun quiz IA généré.</div>`;
      return;
    }
    
    let html = "";
    snap.docs.forEach(d => {
      const q = d.data();
      const dateStr = q.timestamp ? new Date(q.timestamp).toLocaleDateString("fr-FR") : "";
      html += `
        <div style="background:var(--file-bg); padding:12px; border-radius:12px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:600; color:var(--ink);">${q.title}</div>
            <div class="caption">${q.matiere} • ${(q.questions || []).length} questions • ${dateStr}</div>
          </div>
          <div style="display:flex; gap:8px;">
            <button class="btn-pill-van btn-sm" onclick="checkAndStartQuiz('${d.id}', true)">Refaire</button>
            <button class="btn-danger btn-sm" onclick="deleteAIQuiz('${d.id}')">✕</button>
          </div>
        </div>`;
    });
    container.innerHTML = html;
  });
}

window.generateAIQuiz = async () => {
  let matiere = document.getElementById("quiz-ia-matiere").value;
  if (matiere === 'autre') {
    matiere = document.getElementById("quiz-ia-matiere-custom").value.trim();
  }
  
  const topic = document.getElementById("quiz-ia-topic").value.trim();
  const nbQuestions = Math.min(20, Math.max(1, parseInt(document.getElementById("quiz-ia-count").value) || 5));
  const desc = document.getElementById("quiz-ia-desc").value.trim();
  const tags = document.getElementById("quiz-ia-tag-bac")?.checked ? ["bac"] : [];

  if (!topic || !matiere) { 
    showToast("Saisis un sujet principal et une matière."); 
    return; 
  }

  document.getElementById("quiz-ia-actions").style.display = "none";
  document.getElementById("quiz-ia-loading").style.display = "block";

  const systemPrompt = `Tu es un professeur (principalement d'élèves en terminale si aucune précision n'a été faites) expert dans la matière enseignée.
Ta mission est de créer un quiz éducatif de très haute qualité pour tester les connaissances (niveau moyen) des élèves.
Les questions doivent être variées, sans ambiguïté et adaptées au sujet donné. Les mauvaises réponses (distracteurs) doivent être plausibles.

RÈGLE ABSOLUE : Tu dois répondre UNIQUEMENT par un objet JSON valide, sans AUCUN texte avant ou après, et sans markdown.
Le JSON doit OBLIGATOIREMENT avoir cette structure exacte :
{
"questions": [
  {
    "question": "Pose la question de façon claire et précise ?",
    "options": ["Choix A", "Choix B", "Choix C", "Choix D"],
    "correctIndex": 0,
    "justification": "Explication pédagogique détaillée expliquant pourquoi cette réponse est la bonne et pourquoi les autres sont fausses."
  }
]
}`;

  const userPrompt = `Crée un quiz de ${nbQuestions} questions sur le sujet : "${topic}" en matière "${matiere}". Informations complémentaires : "${desc}".
Assure-toi que les questions couvrent bien le sujet et que l'attribut "correctIndex" (un entier entre 0 et 3) pointe bien vers la bonne réponse dans le tableau "options".
RENVOIE UNIQUEMENT LE JSON.`;

  try {
    const quizData = await callGroqAPI(systemPrompt, userPrompt);
    
    if (!quizData || !quizData.questions || quizData.questions.length === 0) {
      throw new Error("L'IA a renvoyé un contenu vide ou mal formaté.");
    }

    const newQuiz = {
      title: `[IA] : ${topic}`,
      matiere: matiere,
      description: desc,
      tags,
      questions: quizData.questions,
      isAI: true,
      likes: [], 
      authorId: currentUser.username,
      authorDisplayName: currentUser.displayName || currentUser.username,
      authorAvatar: currentUser.avatar || "",
      authorRole: currentUser.role || "élève",
      etablissementId: currentUser.etablissementId || "",
      classeId: currentUser.classeId || "",
      timestamp: Date.now()
    };

    const docRef = await addDoc(collection(db, "ai_quizzes"), newQuiz);
    
    closeModal("m-ia-quiz");
    document.getElementById("quiz-ia-topic").value = "";
    document.getElementById("quiz-ia-desc").value = "";
    document.getElementById("quiz-ia-tag-bac").checked = false;
    document.getElementById("quiz-ia-matiere-custom").value = "";
    document.getElementById("quiz-ia-matiere-custom").style.display = "none";
    document.getElementById("quiz-ia-matiere").value = Array.from(window.subjectsMap.keys())[0];
    
    showToast("Quiz généré avec succès !");
    syncContrib();
    checkAndStartQuiz(docRef.id, true);

  } catch(e) {
    console.error(e);
    showToast("Erreur lors de la génération. Réessaye.");
  } finally {
    document.getElementById("quiz-ia-actions").style.display = "flex";
    document.getElementById("quiz-ia-loading").style.display = "none";
  }
};

window.checkAndStartQuiz = async (quizId, isAI) => {
  const collectionName = isAI ? "ai_quizzes" : "quizzes";
  const ref = doc(db, collectionName, quizId);
  const snap = await getDoc(ref);
  
  if (!snap.exists()) { 
    showToast("Ce quiz n'existe plus."); 
    return; 
  }
  
  const qData = { id: snap.id, ...snap.data() };

  if (!isAI) {
    const attQ = query(collection(db, "quiz_attempts"), where("quizId", "==", quizId), where("userId", "==", currentUser.username));
    const attSnap = await getDocs(attQ);
    
    if (attSnap.size >= 5) {
      if (confirm("Tu as atteint la limite de 5 essais pour ce quiz.\nVeux-tu le recommencer via l'IA ? L'IA reformulera les questions et mélangera les réponses pour t'entraîner (ton score ne sera pas sauvegardé).")) {
         window._currentQuizData = qData;
         reformulateQuizWithAI();
      }
      return;
    }
  }

  window._currentQuizData = qData;
  startQuiz();
};

window.reformulateQuizWithAI = async () => {
  openModal('m-take-quiz');
  document.getElementById("take-quiz-title").innerText = window._currentQuizData.title + " (Reformulé)";
  document.getElementById("take-quiz-content").style.display = "none";
  document.getElementById("take-quiz-loading").style.display = "block";
  document.getElementById("btn-next-question").style.display = "none";

  const systemPrompt = `Tu es un professeur. Je vais te donner un quiz en JSON. Tu dois reformuler TOUTES les questions et TOUTES les options pour qu'elles soient différentes dans la forme, mais identiques sur le fond. Change l'ordre des options et mets à jour 'correctIndex' en conséquence.
  RÈGLE ABSOLUE : Réponds UNIQUEMENT par un objet JSON valide, sans texte avant/après, sans markdown. Structure identique :
  { "questions": [ { "question": "...", "options": ["..."], "correctIndex": 0, "justification": "..." } ] }`;

  const userPrompt = JSON.stringify(window._currentQuizData.questions);

  try {
    const newData = await callGroqAPI(systemPrompt, userPrompt);
    if (!newData || !newData.questions) throw new Error("Format Invalide");
    
    window._currentQuizData.questions = newData.questions;
    window._currentQuizData.isAI = true; 
    
    document.getElementById("take-quiz-loading").style.display = "none";
    document.getElementById("take-quiz-content").style.display = "block";
    document.getElementById("btn-next-question").style.display = "block";
    
    startQuiz(true); 
  } catch(e) {
    console.error(e);
    showToast("Erreur lors de la reformulation IA.");
    closeModal('m-take-quiz');
  }
};

window.shuffleQuizData = (quizData) => {
  quizData.questions.sort(() => Math.random() - 0.5);
  quizData.questions.forEach(q => {
    const optionsWithIndex = q.options.map((option, index) => ({ option, index }));
    optionsWithIndex.sort(() => Math.random() - 0.5);
    q.options = optionsWithIndex.map(item => item.option);
    q.correctIndex = optionsWithIndex.findIndex(item => item.index === q.correctIndex);
  });
};

window.startQuiz = (alreadyOpen = false) => {
  window.shuffleQuizData(window._currentQuizData);
  window._currentQuestionIndex = 0;
  window._quizUserAnswers = [];
  window._hasViewedAnswers = false;
  window._quizStartTime = Date.now();
  
  if (!alreadyOpen) openModal("m-take-quiz");
  
  document.getElementById("take-quiz-title").innerText = window._currentQuizData.title;
  document.getElementById("take-quiz-content").style.display = "block";
  document.getElementById("take-quiz-loading").style.display = "none";
  document.getElementById("btn-next-question").style.display = "block";
  
  renderCurrentQuestion();
};

window.renderCurrentQuestion = () => {
  const qData = window._currentQuizData.questions[window._currentQuestionIndex];
  document.getElementById("take-quiz-progress").innerText = `${window._currentQuestionIndex + 1} / ${window._currentQuizData.questions.length}`;
  document.getElementById("take-quiz-question").innerText = qData.question;
  
  const optsContainer = document.getElementById("take-quiz-options");
  optsContainer.innerHTML = "";
  
  qData.options.forEach((opt, idx) => {
    optsContainer.innerHTML += `<button class="quiz-option" style="color: var(--ink);" onclick="selectQuizOption(${idx}, this)">${opt}</button>`;
  });
  
  document.getElementById("btn-next-question").disabled = true;
  document.getElementById("btn-next-question").innerText = (window._currentQuestionIndex === window._currentQuizData.questions.length - 1) ? "Terminer" : "Suivant";
};

window.selectQuizOption = (idx, btnElement) => {
  document.querySelectorAll(".quiz-option").forEach(b => b.classList.remove("selected"));
  btnElement.classList.add("selected");
  window._quizUserAnswers[window._currentQuestionIndex] = idx;
  document.getElementById("btn-next-question").disabled = false;
};

window.nextQuizQuestion = () => {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  if (window._currentQuestionIndex < window._currentQuizData.questions.length - 1) {
    window._currentQuestionIndex++;
    renderCurrentQuestion();
  } else {
    submitQuiz();
  }
};

window.readQuestionAloud = () => {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    if (!window._currentQuizData) return;
    const qData = window._currentQuizData.questions[window._currentQuestionIndex];
    const textToRead = `${qData.question}. Les réponses possibles sont : ${qData.options.join(", ou ")}.`;
    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = "fr-FR";
    utterance.rate = 1.0;
    window.speechSynthesis.speak(utterance);
    showToast("🔊 Lecture de la question (Google)...");
  } else {
    showToast("⚠️ La synthèse vocale n'est pas supportée par ce navigateur.");
  }
};

window.submitQuiz = async () => {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  closeModal('m-take-quiz');
  
  let score = 0;
  window._currentQuizData.questions.forEach((q, idx) => {
    if (window._quizUserAnswers[idx] === q.correctIndex) score++;
  });
  
  const timeTaken = Math.floor((Date.now() - window._quizStartTime) / 1000);
  
  document.getElementById("quiz-final-score").innerText = `${score} / ${window._currentQuizData.questions.length}`;
  
  const ratio = score / window._currentQuizData.questions.length;
  let msg = "Bien joué !";
  if (ratio === 1) msg = "Parfait ! Un sans faute 🎯";
  else if (ratio < 0.5) msg = "Tu peux faire mieux ! Révise encore un peu 📚";
  
  document.getElementById("quiz-result-msg").innerText = `${msg} (répondu en ${timeTaken}s)`;
  openModal('m-quiz-result');

  const colName = window._currentQuizData.isAI ? "ai_quizzes" : "quizzes";
  const currentCount = window._currentQuizData.attemptsCount || 0;
  try {
    await updateDoc(doc(db, colName, window._currentQuizData.id), { attemptsCount: currentCount + 1 });
  } catch (err) {
    console.error("Erreur lors de la mise à jour du compteur :", err);
  }

  if (!window._currentQuizData.isAI) {
    await addDoc(collection(db, "quiz_attempts"), {
      quizId: window._currentQuizData.id,
      userId: currentUser.username,
      userDisplayName: currentUser.displayName || currentUser.username,
      score: score,
      maxScore: window._currentQuizData.questions.length,
      timeTaken: timeTaken,
      timestamp: Date.now()
    });
  }
};

window.showQuizAnswers = () => {
  window._hasViewedAnswers = true;
  closeModal('m-quiz-result');
  
  const container = document.getElementById("quiz-answers-container");
  container.innerHTML = "";
  
  window._currentQuizData.questions.forEach((q, idx) => {
    const userAns = window._quizUserAnswers[idx];
    const isCorrect = userAns === q.correctIndex;
    
    let optsHtml = "";
    q.options.forEach((opt, optIdx) => {
      let cssClass = "quiz-option";
      if (optIdx === q.correctIndex) cssClass += " correct";
      else if (optIdx === userAns && !isCorrect) cssClass += " wrong";
      
      optsHtml += `<div class="${cssClass}" style="cursor:default; color:var(--ink);">${opt}</div>`;
    });
    
    container.innerHTML += `
      <div style="background:var(--card-bg); border:1px solid var(--hl); border-radius:12px; padding:16px;">
        <h4 style="margin-bottom:12px; display:flex; align-items:center; gap:8px;">
          ${isCorrect ? '✅' : '❌'} Question ${idx + 1}
        </h4>
        <div style="font-weight:500; margin-bottom:12px;">${q.question}</div>
        <div style="display:flex; flex-direction:column; gap:6px;">${optsHtml}</div>
        ${q.justification ? `<div style="margin-top:12px; padding:10px; background:var(--parchment); border-radius:8px; font-size:14px; color:var(--ink-m);">💡 <strong>Explication :</strong> ${q.justification}</div>` : ''}
      </div>
    `;
  });
  
  openModal('m-quiz-answers');
};

window.restartQuiz = async () => {
  closeModal('m-quiz-result');
  if (window._hasViewedAnswers && !window._currentQuizData.isAI) {
    reformulateQuizWithAI();
  } else {
    startQuiz();
  }
};

window.closeTakeQuizModal = async () => {
  if ("speechSynthesis" in window) window.speechSynthesis.cancel();
};

window.abortQuiz = () => {
  if (confirm("Veux-tu vraiment quitter le quiz en cours ?")) {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    closeModal('m-take-quiz');
    window._currentQuizData = null;
  }
};

window.handleAddMatiere = async () => {
  const name = document.getElementById("mat-name").value.trim();
  const icon = document.getElementById("mat-icon").value.trim();
  
  if (!name || !icon) {
    showToast("Remplis le nom et l'icône.");
    return;
  }
  
  await addDoc(collection(db, "subjects"), { name, icon }); 
  closeModal("m-add-mat"); 
  document.getElementById("mat-name").value = ""; 
  document.getElementById("mat-icon").value = ""; 
  showToast("Matière ajoutée ✓");
};

window.editMatiere = (id, name, icon) => {
  document.getElementById("m-edit-mat-title").innerText = "Modifier la matière"; 
  document.getElementById("edit-mat-id").value = id; 
  document.getElementById("adm-m-name").value = name; 
  document.getElementById("adm-m-icon").value = icon; 
  openModal("m-edit-mat");
};

window.openMatiereModal = (isEdit, id = "", name = "", icon = "") => { 
  if (isEdit) editMatiere(id, name, icon); 
  else openModal("m-add-mat"); 
};

window.saveMatiereConfig = async () => {
  const id = document.getElementById("edit-mat-id").value;
  const name = document.getElementById("adm-m-name").value.trim();
  const icon = document.getElementById("adm-m-icon").value.trim();
  
  if (!name || !icon) return;
  
  if (id) {
    await updateDoc(doc(db, "subjects", id), { name, icon });
  } else {
    await addDoc(collection(db, "subjects"), { name, icon });
  }
  
  closeModal("m-edit-mat"); 
  showToast("Matière mise à jour ✓");
};

window.delMatiere = async (id) => {
  if (confirm("Supprimer cette matière ? Les ressources associée resteront en base.")) {
    await deleteDoc(doc(db, "subjects", id));
  }
};

function syncAdminDashboardStats() {
  if (!currentUser || (currentUser.role !== 'admin' && !(currentUser.subRoles && currentUser.subRoles.includes('admin')))) return;
  
  const elMem = document.getElementById("stat-admin-members");
  if (elMem) elMem.innerText = window.usersMap.size;

  onSnapshot(collection(db, "posts"), snap => {
    const elPosts = document.getElementById("stat-admin-posts");
    if (elPosts) elPosts.innerText = snap.size;
    
    let totalComments = 0;
    snap.forEach(d => {
      const c = d.data().comments || [];
      totalComments += c.length;
      c.forEach(rep => { if (rep.replies) totalComments += rep.replies.length; });
    });
    const elComm = document.getElementById("stat-admin-comments");
    if (elComm) elComm.innerText = totalComments;
  });

  onSnapshot(collection(db, "quizzes"), snap1 => {
    onSnapshot(collection(db, "ai_quizzes"), snap2 => {
      const elQ = document.getElementById("stat-admin-quizzes");
      if (elQ) elQ.innerText = snap1.size + snap2.size;
    });
  });

  onSnapshot(collection(db, "reports"), snap => {
    const tb = document.getElementById("admin-mod-tb");
    const dot = document.getElementById("admin-mod-dot");
    let pendingCount = 0;
    
    if (snap.empty) {
      if (tb) tb.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--ink-m);">Aucun signalement en attente.</td></tr>`;
      if (dot) dot.style.display = "none";
      return;
    }

    let rowsHtml = "";
    snap.docs.forEach(d => {
      const r = { id: d.id, ...d.data() };
      if (r.status === "pending") {
        pendingCount++;
        const dateStr = r.timestamp ? new Date(r.timestamp).toLocaleDateString("fr-FR", {day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"}) : "—";
        rowsHtml += `
          <tr>
            <td><strong>[${esc(r.postId)}]</strong><br>${esc(r.postTitle || 'Document')} <span class="caption">(@${esc(r.postAuthor || '')})</span></td>
            <td><strong>@${esc(r.reporterId)}</strong></td>
            <td style="color:var(--danger); font-weight:500;">${esc(r.reason)}</td>
            <td class="caption">${dateStr}</td>
            <td>
              <div class="td-acts">
                <button class="btn-danger btn-sm" onclick="resolveReport('${d.id}', '${r.postId}', 'delete')">Supprimer post</button>
                <button class="btn-ghost btn-sm" onclick="resolveReport('${d.id}', '${r.postId}', 'ignore')">Ignorer</button>
              </div>
            </td>
          </tr>
        `;
      }
    });
    if (tb) tb.innerHTML = rowsHtml || `<tr><td colspan="5" style="text-align:center; padding:30px; color:var(--ink-m);">Aucun signalement en attente.</td></tr>`;
    if (dot) dot.style.display = pendingCount > 0 ? "inline-block" : "none";
  });
}

window.resolveReport = async (reportId, postId, action) => {
  try {
    await updateDoc(doc(db, "reports", reportId), { status: action === 'delete' ? 'deleted' : 'ignored' });
    if (action === 'delete' && postId) {
      try { await deleteDoc(doc(db, "posts", postId)); } catch(e){}
      showToast("Publication supprimée et signalement résolu ✓");
    } else {
      showToast("Signalement ignoré ✓");
    }
  } catch(e) {
    showToast("Erreur lors de l'opération.");
  }
};

function syncAdminUsers() {
  onSnapshot(collection(db, "users"), snap => {
    window._allAdminUsers = [];
    snap.forEach(d => {
      window._allAdminUsers.push({ docId: d.id, ...d.data() });
    });
    const etabSelect = document.getElementById("adm-filter-etab");
    const classeSelect = document.getElementById("adm-filter-classe");
    if (etabSelect) {
      const current = etabSelect.value || "all";
      const etabs = Array.from(new Set(window._allAdminUsers.map(u => u.etablissementId).filter(Boolean)))
        .map(id => ({ id, nom: window.etabsMap.get(id)?.nom || id }))
        .sort((a, b) => a.nom.localeCompare(b.nom));
      etabSelect.innerHTML = `<option value="all">Tous les établissements</option>` + etabs.map(e => `<option value="${esc(e.id)}">${esc(e.nom)}</option>`).join("");
      etabSelect.value = etabs.some(e => e.id === current) ? current : "all";
    }
    if (classeSelect) {
      const current = classeSelect.value || "all";
      const classes = Array.from(new Set(window._allAdminUsers.map(u => u.classeId).filter(Boolean)))
        .map(id => ({ id, nom: window.classesMap.get(id)?.nom || window.classesMap.get(id)?.name || id }))
        .sort((a, b) => a.nom.localeCompare(b.nom));
      classeSelect.innerHTML = `<option value="all">Toutes les classes</option>` + classes.map(c => `<option value="${esc(c.id)}">${esc(c.nom)}</option>`).join("");
      classeSelect.value = classes.some(c => c.id === current) ? current : "all";
    }
    renderAdminUsersTable();
    const elMem = document.getElementById("stat-admin-members");
    if (elMem) elMem.innerText = window._allAdminUsers.length;
  });
}

window.renderAdminUsersTable = () => {
  const tb = document.getElementById("admin-users-tb");
  if (!tb) return;
  
  const searchVal = (document.getElementById("adm-filter-search")?.value || "").toLowerCase().trim();
  const roleVal = document.getElementById("adm-filter-role")?.value || "all";
  const etabVal = document.getElementById("adm-filter-etab")?.value || "all";
  const classeVal = document.getElementById("adm-filter-classe")?.value || "all";
  
  const filtered = window._allAdminUsers.filter(u => {
    const matchRole = roleVal === "all" || u.role === roleVal;
    const matchEtab = etabVal === "all" || u.etablissementId === etabVal;
    const matchClasse = classeVal === "all" || u.classeId === classeVal;
    const dName = (u.displayName || "").toLowerCase();
    const uName = (u.username || "").toLowerCase();
    const matchSearch = !searchVal || dName.includes(searchVal) || uName.includes(searchVal) || u.docId.toLowerCase().includes(searchVal);
    return matchRole && matchEtab && matchClasse && matchSearch;
  });

  if (filtered.length === 0) {
    tb.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--ink-m);">Aucun membre ne correspond aux critères.</td></tr>`;
    return;
  }

  tb.innerHTML = filtered.map(u => `
    <tr>
      <td><strong>${esc(u.username)}</strong></td>
      <td>${esc(u.displayName || "—")}</td>
      <td><span class="rpill">${esc(u.role || "élève")}</span></td>
      <td class="caption">${esc((u.subRoles || []).join(", ") || "—")}</td>
      <td>
        <div class="td-acts">
          <button class="btn-ghost btn-sm" onclick='openUserModal(true,"${u.docId}","${esc(u.username)}","${esc(u.role)}",${JSON.stringify(u.subRoles || [])})'>Modifier</button>
          <button class="btn-danger btn-sm" onclick="delUser('${u.docId}','${esc(u.username)}')">Suppr.</button>
        </div>
      </td>
    </tr>
  `).join("");
};

window.switchAdminTab = (tabName) => {
  document.querySelectorAll('[data-adm-tab]').forEach(b => b.classList.remove('active'));
  const activeBtn = document.querySelector(`[data-adm-tab="${tabName}"]`);
  if (activeBtn) activeBtn.classList.add('active');
  
  document.querySelectorAll('.adm-tab-content').forEach(c => c.style.display = 'none');
  const activeContent = document.getElementById(`adm-view-${tabName}`);
  if (activeContent) activeContent.style.display = 'block';
};

window._tempFakeFollowers = [];
window._tempFakeFollowersCount = 0;

const FAKE_FIRSTS = ["lucas", "camille", "chloe", "thomas", "lea", "hugo", "manon", "nathan", "emma", "mathis", "jade", "antoine", "julie", "alexis", "marie", "enzo", "sarah"];
const FAKE_LASTS = ["martin", "bernard", "dubois", "petit", "durand", "leroy", "moreau", "simon", "laurent", "lefevre", "michel", "garcia", "david", "bertrand", "roux"];

window.generateAndSetFakeFollowers = () => {
  const count = parseInt(document.getElementById("adm-u-fake-count").value, 10) || 0;
  if (count <= 0) {
    window.clearFakeFollowers();
    return;
  }

  const list = [];
  const displayCount = Math.min(count, 50);
  
  for (let i = 0; i < displayCount; i++) {
    const f = FAKE_FIRSTS[Math.floor(Math.random() * FAKE_FIRSTS.length)];
    const l = FAKE_LASTS[Math.floor(Math.random() * FAKE_LASTS.length)];
    const dname = `${f.charAt(0).toUpperCase() + f.slice(1)} ${l.charAt(0).toUpperCase() + l.slice(1)}`;
    list.push({
      username: `${f}.${l}${Math.random() > 0.7 ? Math.floor(Math.random() * 90) + 10 : ''}`,
      displayName: dname,
      role: "élève",
      avatar: "",
      isFake: true
    });
  }

  window._tempFakeFollowers = list;
  window._tempFakeFollowersCount = count;
  document.getElementById("adm-fake-preview").innerText = `${window.formatNumber(count)} abonnés simulés configurés.`;
  showToast(`${window.formatNumber(count)} faux abonnés générés ✓`);
};

window.clearFakeFollowers = () => {
  window._tempFakeFollowers = [];
  window._tempFakeFollowersCount = 0;
  document.getElementById("adm-u-fake-count").value = "";
  document.getElementById("adm-fake-preview").innerText = "Aucun faux abonné.";
  showToast("Faux abonnés retirés (pense à enregistrer) ✓");
};

window.openUserModal = (isEdit, docId = "", username = "", role = "élève", subRoles = []) => {
  document.getElementById("m-user-title").innerText = isEdit ? "Modifier le compte" : "Nouveau compte";
  document.getElementById("edit-user-id").value = docId; 
  document.getElementById("adm-u-id").value = username; 
  document.getElementById("adm-u-id").disabled = isEdit; 
  document.getElementById("adm-pwd-wrap").style.display = isEdit ? "none" : "flex"; 
  
  document.getElementById("adm-u-role").value = role; 
  document.getElementById("adm-u-admin").checked = subRoles.includes("admin"); 
  document.getElementById("adm-u-vol").checked = subRoles.includes("volontaire"); 
  
  let userObj = isEdit ? window.usersMap.get(username) : null;
  document.getElementById("adm-u-verified").checked = userObj ? !!userObj.isVerified : false;
  
  const fakes = userObj ? (userObj.fakeFollowers || []) : [];
  const fakeCount = userObj && userObj.fakeFollowersCount !== undefined ? userObj.fakeFollowersCount : fakes.length;
  window._tempFakeFollowers = [...fakes];
  window._tempFakeFollowersCount = fakeCount;
  
  document.getElementById("adm-u-fake-count").value = fakeCount || "";
  document.getElementById("adm-fake-preview").innerText = fakeCount ? `${window.formatNumber(fakeCount)} faux abonnés actifs.` : "Aucun faux abonné.";

  openModal("m-user");
};

window.saveUserConfig = async () => {
  const docId = document.getElementById("edit-user-id").value;
  const username = document.getElementById("adm-u-id").value.trim().toLowerCase();
  const role = document.getElementById("adm-u-role").value;
  const isVerified = document.getElementById("adm-u-verified").checked;
  const etablissementId = document.getElementById("adm-u-etab").value || "";
  const classeId = document.getElementById("adm-u-classe").value || "";
  if (!username) return;

  const subs = [];
  if (document.getElementById("adm-u-admin").checked) subs.push("admin"); 
  if (document.getElementById("adm-u-vol").checked) subs.push("volontaire");

  const updates = { 
    role, 
    subRoles: subs, 
    etablissementId: etablissementId,
    classeId: classeId,
    isVerified, 
    fakeFollowers: window._tempFakeFollowers,
    fakeFollowersCount: window._tempFakeFollowersCount || 0
  };

  if (docId) { 
    await updateDoc(doc(db, "users", docId), updates); 
    showToast("Compte mis à jour ✓"); 
  } else {
    const pwd = document.getElementById("adm-u-pwd").value.trim() || "stmg2026";
    const exist = await getDocs(query(collection(db, "users"), where("username", "==", username))); 
    
    if (!exist.empty) {
      showToast("Identifiant déjà pris.");
      return;
    }
    
    const autoName = displayNameFromId(username);
    await addDoc(collection(db, "users"), {
      username, displayName: autoName, password: pwd, avatar: "", bio: "", banner: "",
      instagram: "", linkedin: "", tiktok: "", followers: [], following: [], isTempPassword: true,
      allowMessages: true, emailNotifs: false, email: "", ...updates
    }); 
    
    showToast(`Compte de ${autoName} créé ✓`);
  }
  closeModal("m-user");
};

window.delUser = async (docId, uname) => {
  if (uname === "...") {
    showToast("Compte protégé.");
    return;
  }
  if (confirm(`Supprimer l'accès de ${uname} ?`)) {
    await deleteDoc(doc(db, "users", docId));
  }
};

function syncAdminMats() {
  onSnapshot(collection(db, "subjects"), snap => {
    const tb = document.getElementById("admin-mat-tb"); 
    tb.innerHTML = "";
    
    snap.forEach(d => {
      const m = d.data();
      tb.innerHTML += `
      <tr>
        <td style="font-size:22px">${m.icon}</td>
        <td><strong>${m.name}</strong></td>
        <td>
          <div class="td-acts">
            <button class="btn-ghost btn-sm" onclick="editMatiere('${d.id}','${esc(m.name)}','${m.icon}')">Modifier</button>
            <button class="btn-danger btn-sm" onclick="delMatiere('${d.id}')">Suppr.</button>
          </div>
        </td>
      </tr>`;
    });
  });
}

window.openEtablissementModal = (isEdit, id = '', nom = '', ville = '') => {
document.getElementById('m-etablissement-title').innerText = isEdit ? 'Modifier Établissement' : 'Nouvel Établissement';
document.getElementById('edit-etab-id').value = id;
document.getElementById('etab-name').value = nom;
document.getElementById('etab-ville').value = ville;
openModal('m-etablissement');
};

window.saveEtablissement = async () => {
const id = document.getElementById('edit-etab-id').value;
const nom = document.getElementById('etab-name').value.trim();
const ville = document.getElementById('etab-ville').value.trim();

if (!nom) { showToast('Le nom est requis.'); return; }

const data = { nom, ville: ville || '' };
if (id) {
  await updateDoc(doc(db, 'etablissements', id), data);
  showToast('Établissement mis à jour ✓');
} else {
  await addDoc(collection(db, 'etablissements'), data);
  showToast('Établissement ajouté ✓');
}
closeModal('m-etablissement');
syncAdminEtablissements();  
populateEtabSelects(); 
};

window.delEtablissement = async (id, nom) => {
if (!confirm(`Supprimer l'établissement "${nom}" ? Cela ne supprimera pas les utilisateurs qui y sont rattachés.`)) return;
await deleteDoc(doc(db, 'etablissements', id));
showToast('Établissement supprimé.');
syncAdminEtablissements();
populateEtabSelects();
};


window.openClasseModal = (isEdit, id = '', nom = '', etablissementId = '') => {
document.getElementById('m-classe-title').innerText = isEdit ? 'Modifier Classe' : 'Nouvelle Classe';
document.getElementById('edit-classe-id').value = id;
document.getElementById('classe-name').value = nom;
populateEtabSelects('classe-etab', etablissementId);
openModal('m-classe');
};

window.saveClasse = async () => {
const id = document.getElementById('edit-classe-id').value;
const nom = document.getElementById('classe-name').value.trim();
const etablissementId = document.getElementById('classe-etab').value;

if (!nom) { showToast('Le nom est requis.'); return; }
if (!etablissementId) { showToast('Veuillez sélectionner un établissement.'); return; }

const data = { nom, etablissementId };
if (id) {
  await updateDoc(doc(db, 'classes', id), data);
  showToast('Classe mise à jour ✓');
} else {
  await addDoc(collection(db, 'classes'), data);
  showToast('Classe ajoutée ✓');
}
closeModal('m-classe');
syncAdminClasses();
populateClasseSelects();
};

window.delClasse = async (id, nom) => {
if (!confirm(`Supprimer la classe "${nom}" ? Cela ne supprimera pas les utilisateurs qui y sont rattachés.`)) return;
await deleteDoc(doc(db, 'classes', id));
showToast('Classe supprimée.');
syncAdminClasses();
populateClasseSelects();
};


function syncAdminEtablissements() {
onSnapshot(collection(db, 'etablissements'), (snap) => {
  const tb = document.getElementById('admin-etab-tb');
  tb.innerHTML = '';
  snap.forEach(d => {
    const e = d.data();
    tb.innerHTML += `
    <tr>
      <td><strong>${e.nom}</strong></td>
      <td>${e.ville || '—'}</td>
      <td>
        <div class="td-acts">
          <button class="btn-ghost btn-sm" onclick="openEtablissementModal(true, '${d.id}', '${esc(e.nom)}', '${esc(e.ville || '')}')">Modifier</button>
          <button class="btn-danger btn-sm" onclick="delEtablissement('${d.id}', '${esc(e.nom)}')">Suppr.</button>
        </div>
      </td>
    </tr>`;
  });
  if (snap.empty) tb.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--ink-m);">Aucun établissement.</td></tr>';
});
}

function syncAdminClasses() {
onSnapshot(collection(db, 'classes'), async (snap) => {
  const tb = document.getElementById('admin-classe-tb');
  tb.innerHTML = '';
  
  const etabsMap = new Map();
  const etabsSnap = await getDocs(collection(db, 'etablissements'));
  etabsSnap.forEach(d => etabsMap.set(d.id, d.data().nom));

  snap.forEach(d => {
    const c = d.data();
    const etabNom = etabsMap.get(c.etablissementId) || 'Inconnu';
    tb.innerHTML += `
    <tr>
      <td><strong>${c.nom}</strong></td>
      <td>${etabNom}</td>
      <td>
        <div class="td-acts">
          <button class="btn-ghost btn-sm" onclick="openClasseModal(true, '${d.id}', '${esc(c.nom)}', '${c.etablissementId || ''}')">Modifier</button>
          <button class="btn-danger btn-sm" onclick="delClasse('${d.id}', '${esc(c.nom)}')">Suppr.</button>
        </div>
      </td>
    </tr>`;
  });
  if (snap.empty) tb.innerHTML = '<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--ink-m);">Aucune classe.</td></tr>';
});
}


async function populateEtabSelects(selectId = 'classe-etab', selectedId = '') {
const snap = await getDocs(collection(db, 'etablissements'));
const select = document.getElementById(selectId);
if (!select) return;
select.innerHTML = '<option value="">Sélectionner un établissement</option>';
snap.forEach(d => {
  const e = d.data();
  const opt = document.createElement('option');
  opt.value = d.id;
  opt.textContent = e.nom;
  if (d.id === selectedId) opt.selected = true;
  select.appendChild(opt);
});
}

async function populateClasseSelects(selectId = 'adm-u-classe', etabId = '', selectedClasseId = '') {
const select = document.getElementById(selectId);
if (!select) return;
select.innerHTML = '<option value="">Aucune</option>';

let q = collection(db, 'classes');
if (etabId) {
  q = query(collection(db, 'classes'), where('etablissementId', '==', etabId));
}
const snap = await getDocs(q);
snap.forEach(d => {
  const c = d.data();
  const opt = document.createElement('option');
  opt.value = d.id;
  opt.textContent = c.nom;
  if (d.id === selectedClasseId) opt.selected = true;
  select.appendChild(opt);
});
}

const originalOpenUserModal = window.openUserModal;
window.openUserModal = (isEdit, docId = '', username = '', role = 'élève', subRoles = []) => {
  originalOpenUserModal(isEdit, docId, username, role, subRoles);

  setTimeout(async () => {
    await populateEtabSelects('adm-u-etab');

    let etabId = '';
    let classeId = '';
    if (isEdit && username) {
      const userData = window.usersMap.get(username);
      if (userData) {
        etabId = userData.etablissementId || '';
        classeId = userData.classeId || '';
      }
    }

    const etabSelect = document.getElementById('adm-u-etab');
    if (etabSelect) {
      const newEtabSelect = etabSelect.cloneNode(true);
      etabSelect.parentNode.replaceChild(newEtabSelect, etabSelect);

      newEtabSelect.value = etabId;

      newEtabSelect.addEventListener('change', function() {
        const selectedEtab = this.value;
        populateClasseSelects('adm-u-classe', selectedEtab);
        const classeSelect = document.getElementById('adm-u-classe');
        if (classeSelect) classeSelect.value = '';
      });

      await populateClasseSelects('adm-u-classe', etabId, classeId);
    }
  }, 100);
};
window.switchTab = (target) => { 
    window.location.hash = `#${target}`; 
};

window.toggleDrawer = () => {
  document.getElementById("mob-drawer").classList.toggle("open");
  document.getElementById("hamburger-btn").classList.toggle("open");
};

window.closeDrawer = () => {
  document.getElementById("mob-drawer").classList.remove("open");
  document.getElementById("hamburger-btn").classList.remove("open");
};

window.toggleDropdown = () => document.getElementById("profil-dropdown").classList.toggle("show");
window.closeDropdown = () => document.getElementById("profil-dropdown").classList.remove("show");

document.addEventListener("click", e => {
  const dd = document.getElementById("profil-dropdown");
  const av = document.getElementById("nav-avatar");
  if (dd && !dd.contains(e.target) && av && !av.contains(e.target)) {
    dd.classList.remove("show");
  }
});

window.openModal = id => {
  document.getElementById(id).classList.add("active");
  if (id === 'm-new-chat') renderContactSearch();
};

window.closeModal = id => document.getElementById(id).classList.remove("active");
window.closeOnOut = (e, id) => { if (e.target.id === id) closeModal(id); };

function esc(s) { 
  return (s || "").replace(/'/g, "\\'").replace(/"/g, "&quot;"); 
} 

window.esc = esc;
