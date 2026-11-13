import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import { getAuth, signInAnonymously, signInWithPopup, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-auth.js";
import {
  getFirestore, collection, getDocs, getDoc, addDoc, updateDoc, deleteDoc,
  doc, query, where, onSnapshot, orderBy, setDoc, limit, serverTimestamp, arrayUnion
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
const GROQ_MODEL   = "qwen/qwen3.8-27b"; // Modèle actif, JSON et vision pris en charge par Groq.



const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 30000;
let loginFailedAttempts = 0;
let loginLockedUntil = 0;



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
window._exUnsub      = null;
window._liveQuizzesData = [];
window._liveAIQuizzesData = [];
window._liveSharedExercicesData = [];

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
window._activityState = null;
window._activityTimer = null;
window._activityFlushTimer = null;
window._statisticsCharts = {};
window._statisticsCache = { users: [], sessions: [], events: [], daily: [], hourly: [], concurrent: [], activity: [], activityLifetime: [] };

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
function activityStorageKey(userId) { return `dnb_activity_${String(userId || "")}`; }
function studyStatsStorageKey(userId) { return `dnb_study_stats_${String(userId || "")}`; }
function getLocalStudyStats(userId) {
  const today = typeof getTodayStr === "function" ? getTodayStr() : new Date().toISOString().slice(0, 10);
  try {
    const raw = localStorage.getItem(studyStatsStorageKey(userId));
    if (!raw) return { totalStudyMs: 0, dailyDate: today, dailyStudyMs: 0 };
    const parsed = JSON.parse(raw);
    return {
      totalStudyMs: Math.max(0, Number(parsed.totalStudyMs) || 0),
      dailyDate: today,
      dailyStudyMs: parsed.dailyDate === today ? Math.max(0, Number(parsed.dailyStudyMs) || 0) : 0
    };
  } catch (_) {
    return { totalStudyMs: 0, dailyDate: today, dailyStudyMs: 0 };
  }
}
function saveLocalStudyStats(userId, stats) {
  if (!userId || !stats) return;
  try {
    localStorage.setItem(studyStatsStorageKey(userId), JSON.stringify(stats));
  } catch (_) {}
}
window.getTotalStudyMs = () => {
  if (!currentUser?.id) return 0;
  const localStats = getLocalStudyStats(currentUser.id);
  return Math.max(Number(currentUser.totalStudyMs) || 0, localStats.totalStudyMs);
};
window.getDailyStudyMs = () => {
  if (!currentUser?.id) return 0;
  const today = typeof getTodayStr === "function" ? getTodayStr() : new Date().toISOString().slice(0, 10);
  const localStats = getLocalStudyStats(currentUser.id);
  const remoteDaily = currentUser.dailyStudyDate === today ? (Number(currentUser.dailyStudyMs) || 0) : 0;
  return Math.max(remoteDaily, localStats.dailyStudyMs);
};
function createActivityState(user) { const now=Date.now(); return { userId:String(user?.id||""), username:String(user?.username||user?.id||""), role:String(user?.role||""), sessionId:`${String(user?.id||"")}_${now}`, durationMs:0, pageViews:0, quizStarts:0, quizCompletes:0, aiQuizGenerations:0, searches:0, likes:0, comments:0, shares:0, postsViewed:0, postsCreated:0, lastPage:"", lastActivity:now, lastTick:now }; }
function loadActivityState(user) { const fresh=createActivityState(user); try { const raw=localStorage.getItem(activityStorageKey(user?.id)); if(!raw)return fresh; const old=JSON.parse(raw); return { ...fresh, ...old, sessionId:fresh.sessionId, lastTick:Date.now() }; } catch(_) { return fresh; } }
function saveActivityState() { const st=window._activityState; if(!st?.userId)return; try{localStorage.setItem(activityStorageKey(st.userId),JSON.stringify(st));}catch(_){} }
function tickActivity() {
  const st = window._activityState;
  if (!st || !currentUser?.id || currentUser.id !== st.userId) return;
  const now = Date.now();
  const delta = Math.max(0, now - Number(st.lastTick || now));
  if (document.visibilityState === "visible") {
    const safeDelta = Math.min(delta, 120000);
    st.durationMs += safeDelta;
    const prevTotal = window.getTotalStudyMs();
    const localStats = getLocalStudyStats(currentUser.id);
    const nextTotal = Math.max(prevTotal, localStats.totalStudyMs) + safeDelta;
    const nextDaily = Math.max(window.getDailyStudyMs(), localStats.dailyStudyMs) + safeDelta;
    const today = typeof getTodayStr === "function" ? getTodayStr() : new Date().toISOString().slice(0, 10);
    saveLocalStudyStats(currentUser.id, { totalStudyMs: nextTotal, dailyDate: today, dailyStudyMs: nextDaily });
    currentUser.totalStudyMs = nextTotal;
    currentUser.dailyStudyDate = today;
    currentUser.dailyStudyMs = nextDaily;
    if (typeof checkNewlyUnlockedThemesAndBadges === "function") checkNewlyUnlockedThemesAndBadges(prevTotal, nextTotal);
    if (typeof updateDailyGoalUI === "function") updateDailyGoalUI();
    if (document.getElementById("page-setting")?.classList.contains("active") && typeof updateSettingsStudyCountersUI === "function") {
      updateSettingsStudyCountersUI();
    }
  }
  st.lastTick = now;
  st.lastActivity = now;
  saveActivityState();
}
async function flushActivity(reason="periodic") {
  const st=window._activityState;
  if(!st?.userId)return;
  tickActivity();
  const payload={...st,flushReason:String(reason),timestamp:Date.now()};
  delete payload.lastTick;
  try {
    await setDoc(doc(db,"analytics_activity",`${st.userId}_${st.sessionId}`),payload,{merge:true});
    if (currentUser?.id === st.userId) {
      const today = typeof getTodayStr === "function" ? getTodayStr() : new Date().toISOString().slice(0, 10);
      await updateDoc(doc(db, "users", currentUser.id), {
        totalStudyMs: window.getTotalStudyMs(),
        dailyStudyDate: today,
        dailyStudyMs: window.getDailyStudyMs()
      });
    }
    localStorage.removeItem(activityStorageKey(st.userId));
  } catch(error) {
    saveActivityState();
    console.debug("Activité non synchronisée :",error?.code||error?.message||error);
  }
}
function initLocalActivityTracking(user) { if(!user?.id)return; if(window._activityState?.userId===String(user.id) && window._activityState.sessionId) return; if(window._activityTimer)clearInterval(window._activityTimer); if(window._activityFlushTimer)clearInterval(window._activityFlushTimer); window._activityState=loadActivityState(user); window._activityTimer=setInterval(tickActivity,5000); window._activityFlushTimer=setInterval(()=>void flushActivity("interval"),45000); tickActivity(); }
function trackActivityPage(page) { const st=window._activityState;if(!st)return;st.lastPage=String(page||"");st.pageViews++;st.lastActivity=Date.now();saveActivityState(); }
function trackActivityEvent(type) { const st=window._activityState;if(!st)return; const k=String(type||""); if(k==="quiz_start")st.quizStarts++; else if(k==="quiz_complete")st.quizCompletes++; else if(k==="ai_quiz_generated")st.aiQuizGenerations++; else if(k==="search")st.searches++; else if(k==="like")st.likes++; else if(k==="comment")st.comments++; else if(k==="share")st.shares++; else if(k==="post_view")st.postsViewed++; else if(k==="post_create")st.postsCreated++; st.lastActivity=Date.now();saveActivityState(); }
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden") void flushActivity("hidden"); else if(window._activityState) window._activityState.lastTick=Date.now(); });
window.addEventListener("pagehide",()=>void flushActivity("pagehide"));
window.addEventListener("beforeunload",()=>tickActivity());

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
  initLocalActivityTracking(user);
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
  await flushActivity("logout");
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
  const tier = typeof getFlameTier === "function" ? getFlameTier(streak) : { id: "amber", label: "Flamme Ambrée" };
  const isMe = user.id === currentUser?.id || user.username === currentUser?.username;
  const avatar = user.avatar
    ? `<img class="streak-ranking-avatar-image" src="${user.avatar}" alt="" loading="lazy">`
    : `<span class="streak-ranking-avatar-initials">${initials}</span>`;
  const badge = typeof getBadge === "function" ? getBadge(user) : "";
  const shields = Math.min(3, Math.max(0, Number(user.streakShields) || 0));

  return `
    <div class="streak-ranking-row${isMe ? " is-me" : ""}">
      <div class="streak-ranking-place">#${rank}</div>
      <div class="streak-ranking-avatar">${avatar}</div>
      <div class="streak-ranking-user">
        <div class="streak-ranking-name">${name}${badge}</div>
        <div class="streak-ranking-username">@${user.username || "—"} · ${tier.label}${shields > 0 ? ` · 🛡️${shields}` : ""}${isMe ? " · Toi" : ""}</div>
      </div>
      <div class="streak-ranking-score">
        <span class="streak-mini-flame tier-${tier.id}" aria-hidden="true"></span>
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
  if (!userObj) return '';
  let out = '';
  if (userObj.isVerified) {
    out += `<img src="https://cdn.prod.website-files.com/6214eaa668d0de27c3ea80cf/652fd0e960df145545f25f12_Pastille%20bleu%20certification%20instagram.png" class="verified-icon" title="Compte certifié">`;
  }
  if (userObj.equippedBadgeIcon) {
    out += `<span title="${esc(userObj.equippedBadgeLabel || 'Badge d’assiduité')}" style="margin-left:5px;font-size:14px;vertical-align:middle;">${esc(userObj.equippedBadgeIcon)}</span>`;
  }
  return out;
};

window.updateUnreadDots = (count) => {
  document.querySelectorAll('.nav-unread-dot').forEach(d => {
    d.style.display = count > 0 ? 'inline-block' : 'none';
  });
};

const UNLOCKABLE_THEMES = [
  { id: "light", name: "Clair Classique", desc: "Épuré et lumineux", minMinutes: 0, swatches: ["#f5f5f7", "#ffffff", "#9b8fe4"], swatchBg: "linear-gradient(135deg,#f5f5f7,#ffffff)", lightText: false },
  { id: "dark", name: "Sombre Standard", desc: "Confort visuel quotidien", minMinutes: 0, swatches: ["#111113", "#1c1c1e", "#9b8fe4"], swatchBg: "linear-gradient(135deg,#111113,#242429)", lightText: true },
  { id: "paper", name: "Clair Papier", desc: "Teinte cahier chaud anti-fatigue", minMinutes: 0, swatches: ["#f6f1e6", "#fffdf8", "#3b5bdb"], swatchBg: "linear-gradient(135deg,#f6f1e6,#efe3c8)", lightText: false },
  { id: "oled", name: "Sombre OLED", desc: "Noir pur économe sur mobile", minMinutes: 0, swatches: ["#000000", "#0a0a0d", "#7c8aff"], swatchBg: "linear-gradient(135deg,#000000,#111119)", lightText: true },
  { id: "aurora", name: "Aurore Snap+", desc: "Dégradé néon rose & lavande façon Snap+", minMinutes: 0, swatches: ["#24143e", "#ff4f9a", "#fde047"], swatchBg: "linear-gradient(135deg,#3b155f 0%,#ff4f9a 60%,#a855f7 100%)", lightText: true },
  { id: "galaxy", name: "Galaxy Nébuleuse", desc: "Ciel étoilé & nébuleuse cosmique", minMinutes: 0, swatches: ["#070924", "#a855f7", "#38bdf8"], swatchBg: "radial-gradient(circle at 22% 28%,#fff 1px,transparent 2px),radial-gradient(circle at 75% 60%,#bae6fd 1.2px,transparent 2px),linear-gradient(135deg,#050616 0%,#31105f 55%,#0c3866 100%)", lightText: true },
  { id: "cyber", name: "Néon Cyber+", desc: "Cyan électrique & reflets magenta", minMinutes: 0, swatches: ["#050914", "#00e5ff", "#ff2e93"], swatchBg: "linear-gradient(135deg,#040a18 0%,#0b2848 52%,#5c0c3c 100%)", lightText: true },
  { id: "sunset", name: "Sunset Doré+", desc: "Ambiance chaleureuse mangue & rose", minMinutes: 0, swatches: ["#1c0b18", "#ff7b54", "#ffd166"], swatchBg: "linear-gradient(135deg,#2d1024 0%,#b83358 52%,#ff7b54 100%)", lightText: true },
  { id: "custom", name: "Studio Perso+", desc: "Crée tes couleurs, ton FX & ton nom", minMinutes: 0, swatches: ["#0f172a", "#1e293b", "#6366f1"], swatchBg: "linear-gradient(135deg,#0f172a 0%,#312e81 60%,#6366f1 100%)", lightText: true }
];

const THEME_LOGO_PALETTES = {
  light: { bg1: "#9b8fe4", bg2: "#6f5ed8", accent: "#f3e5ab", ink: "#ffffff", themeColor: "#f5f5f7" },
  dark: { bg1: "#2d2846", bg2: "#9b8fe4", accent: "#f3e5ab", ink: "#ffffff", themeColor: "#111113" },
  paper: { bg1: "#3b5bdb", bg2: "#2b4bc8", accent: "#f5d061", ink: "#fffdf8", themeColor: "#f6f1e6" },
  oled: { bg1: "#090a14", bg2: "#7c8aff", accent: "#f3e5ab", ink: "#f8fafc", themeColor: "#000000" },
  aurora: { bg1: "#3b155f", bg2: "#ff4f9a", accent: "#fde047", ink: "#fdf8ff", themeColor: "#180d2c" },
  galaxy: { bg1: "#0c1440", bg2: "#a855f7", accent: "#38bdf8", ink: "#f3f4ff", themeColor: "#050614" },
  cyber: { bg1: "#071a33", bg2: "#00e5ff", accent: "#ff2e93", ink: "#ecfeff", themeColor: "#050914" },
  sunset: { bg1: "#3b152a", bg2: "#ff7b54", accent: "#ffd166", ink: "#fff6f0", themeColor: "#1c0b18" }
};

let _logoUidCounter = 0;
function getActiveThemePalette(themeId) {
  if (themeId === "custom") {
    const cfg = getCustomThemeConfig();
    return {
      bg1: cfg.bg || "#0f172a",
      bg2: cfg.primary || "#6366f1",
      accent: mixHexColors(cfg.primary || "#6366f1", "#ffffff", 0.35),
      ink: cfg.ink || "#f8fafc",
      themeColor: cfg.bg || "#0f172a"
    };
  }
  return THEME_LOGO_PALETTES[themeId] || THEME_LOGO_PALETTES.light;
}

function buildDnbLogoSvg(palette) {
  const uid = `dnbg_${++_logoUidCounter}`;
  return `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <defs>
      <linearGradient id="${uid}_bg" x1="12" y1="8" x2="108" y2="112" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stop-color="${palette.bg1}"/>
        <stop offset="100%" stop-color="${palette.bg2}"/>
      </linearGradient>
    </defs>
    <rect x="6" y="6" width="108" height="108" rx="28" fill="url(#${uid}_bg)"/>
    <rect x="10" y="10" width="100" height="100" rx="24" stroke="rgba(255,255,255,0.22)" stroke-width="2"/>
    <path d="M29 36C29 32.6863 31.6863 30 35 30H53C57.4183 30 61 33.5817 61 38V86C56.8 83.2 51.8 81.8 46.5 81.8H35C31.6863 81.8 29 79.1137 29 75.8V36Z" fill="${palette.ink}" fill-opacity="0.96"/>
    <path d="M91 36C91 32.6863 88.3137 30 85 30H67C62.5817 30 59 33.5817 59 38V86C63.2 83.2 68.2 81.8 73.5 81.8H85C88.3137 81.8 91 79.1137 91 75.8V36Z" fill="${palette.ink}" fill-opacity="0.82"/>
    <path d="M51 58L58 65L74 47" stroke="${palette.bg2}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M84 22L86.4 27.6L92 30L86.4 32.4L84 38L81.6 32.4L76 30L81.6 27.6L84 22Z" fill="${palette.accent}"/>
  </svg>`;
}

function renderDnbLogoPngDataUrl(palette, size) {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const s = size / 120;
    ctx.scale(s, s);

    const grad = ctx.createLinearGradient(12, 8, 108, 112);
    grad.addColorStop(0, palette.bg1);
    grad.addColorStop(1, palette.bg2);

    ctx.beginPath();
    ctx.roundRect(6, 6, 108, 108, 28);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(255,255,255,0.24)";
    ctx.beginPath();
    ctx.roundRect(10, 10, 100, 100, 24);
    ctx.stroke();

    ctx.fillStyle = palette.ink;
    ctx.globalAlpha = 0.96;
    ctx.beginPath();
    ctx.roundRect(29, 30, 31, 52, [6, 8, 2, 6]);
    ctx.fill();

    ctx.globalAlpha = 0.82;
    ctx.beginPath();
    ctx.roundRect(60, 30, 31, 52, [8, 6, 6, 2]);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.bg2;
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(49, 58);
    ctx.lineTo(57, 66);
    ctx.lineTo(75, 47);
    ctx.stroke();

    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(84, 30, 6.5, 0, Math.PI * 2);
    ctx.fill();

    return canvas.toDataURL("image/png");
  } catch (_) {
    return null;
  }
}

const ORIGINAL_DNB_LOGO_URL = "https://upload.wikimedia.org/wikipedia/commons/4/48/DnB_website.png";
const ORIGINAL_DNB_CHROME_URL = "https://i.ibb.co/tPpXJLTz/Dn-BChrome.png";

const WEBAPP_ICON_PRESETS = [
  { id: "original", name: "Logo DnB Original", desc: "Icône officielle DnB Reviz", type: "url", url: ORIGINAL_DNB_LOGO_URL },
  { id: "chrome", name: "Icône Mobile PWA", desc: "Icône ronde écran d'accueil", type: "url", url: ORIGINAL_DNB_CHROME_URL },
  { id: "theme", name: "Adapté au thème actif", desc: "Couleurs du thème actuel", type: "theme" },
  { id: "aurora", name: "Aurore Snap+", desc: "Néon rose & lavande", type: "palette", paletteKey: "aurora" },
  { id: "galaxy", name: "Galaxy Nébuleuse", desc: "Cosmique violet & cyan", type: "palette", paletteKey: "galaxy" },
  { id: "cyber", name: "Néon Cyber+", desc: "Cyan électrique & magenta", type: "palette", paletteKey: "cyber" },
  { id: "sunset", name: "Sunset Doré", desc: "Mangue & or chaleureux", type: "palette", paletteKey: "sunset" }
];

function getWebAppIconMode() {
  return localStorage.getItem("dnb_webapp_icon_mode") || "original";
}

function getCustomWebAppIconDataUrl() {
  return localStorage.getItem("dnb_webapp_custom_icon") || "";
}

function resolveWebAppIconUrl(mode, themeId, size = 192) {
  const m = mode || getWebAppIconMode();
  if (m === "custom") {
    const customUrl = getCustomWebAppIconDataUrl();
    if (customUrl) return customUrl;
  }
  const preset = WEBAPP_ICON_PRESETS.find(p => p.id === m) || WEBAPP_ICON_PRESETS[0];
  if (preset.type === "url") return preset.url;
  if (preset.type === "theme") {
    return renderDnbLogoPngDataUrl(getActiveThemePalette(themeId), size) || ORIGINAL_DNB_LOGO_URL;
  }
  if (preset.type === "palette") {
    const pal = THEME_LOGO_PALETTES[preset.paletteKey] || getActiveThemePalette(themeId);
    return renderDnbLogoPngDataUrl(pal, size) || ORIGINAL_DNB_LOGO_URL;
  }
  return ORIGINAL_DNB_LOGO_URL;
}

let _dynamicManifestBlobUrl = null;
function renderDynamicAppLogos(themeId) {
  const activeTheme = themeId || document.documentElement.getAttribute("data-theme") || "light";
  const palette = getActiveThemePalette(activeTheme);
  const iconMode = getWebAppIconMode();

  const icon64 = resolveWebAppIconUrl(iconMode, activeTheme, 64);
  const icon180 = resolveWebAppIconUrl(iconMode, activeTheme, 180);
  const icon192 = resolveWebAppIconUrl(iconMode, activeTheme, 192);
  const icon512 = resolveWebAppIconUrl(iconMode, activeTheme, 512);

  try {
    const favicon = document.getElementById("dynamic-favicon") || document.querySelector('link[rel="icon"]');
    if (favicon && icon64) favicon.href = icon64;

    const appleIcon = document.getElementById("dynamic-apple-icon") || document.querySelector('link[rel="apple-touch-icon"]');
    if (appleIcon && icon180) appleIcon.href = icon180;

    const previewImg = document.getElementById("webapp-icon-live-preview");
    if (previewImg && icon180) previewImg.src = icon180;

    const activeNameEl = document.getElementById("webapp-icon-active-name");
    const activeDescEl = document.getElementById("webapp-icon-active-desc");
    if (activeNameEl && activeDescEl) {
      if (iconMode === "custom" && getCustomWebAppIconDataUrl()) {
        activeNameEl.textContent = "Image personnalisée";
        activeDescEl.textContent = "Ta propre icône importée pour l'écran d'accueil mobile.";
      } else {
        const preset = WEBAPP_ICON_PRESETS.find(p => p.id === iconMode) || WEBAPP_ICON_PRESETS[0];
        activeNameEl.textContent = preset.name;
        activeDescEl.textContent = preset.desc;
      }
    }

    const themeMeta = document.getElementById("dynamic-theme-color");
    if (themeMeta) themeMeta.setAttribute("content", palette.themeColor || palette.bg1);

    const appleStatus = document.getElementById("dynamic-apple-status");
    if (appleStatus) {
      const isLightBg = activeTheme === "light" || activeTheme === "paper";
      appleStatus.setAttribute("content", isLightBg ? "default" : "black-translucent");
    }

    const manifestEl = document.getElementById("dynamic-manifest") || document.querySelector('link[rel="manifest"]');
    if (manifestEl && (icon192 || icon512)) {
      const origin = window.location.origin;
      const manifestData = {
        name: "DnB Reviz",
        short_name: "DnB Reviz",
        start_url: `${origin}/`,
        scope: `${origin}/`,
        display: "standalone",
        background_color: palette.themeColor || palette.bg1,
        theme_color: palette.themeColor || palette.bg2,
        icons: [
          ...(icon192 ? [{ src: icon192, sizes: "192x192", type: "image/png", purpose: "any maskable" }] : []),
          ...(icon512 ? [{ src: icon512, sizes: "512x512", type: "image/png", purpose: "any maskable" }] : [])
        ]
      };
      const blob = new Blob([JSON.stringify(manifestData)], { type: "application/manifest+json" });
      if (_dynamicManifestBlobUrl) URL.revokeObjectURL(_dynamicManifestBlobUrl);
      _dynamicManifestBlobUrl = URL.createObjectURL(blob);
      manifestEl.href = _dynamicManifestBlobUrl;
    }
  } catch (_) {}
}

window.selectWebAppIconMode = (mode) => {
  if (mode === "custom" && !getCustomWebAppIconDataUrl()) {
    document.getElementById("webapp-icon-file")?.click();
    return;
  }
  localStorage.setItem("dnb_webapp_icon_mode", mode);
  const activeTheme = document.documentElement.getAttribute("data-theme") || "light";
  renderDynamicAppLogos(activeTheme);
  if (typeof window.renderWebAppIconSettings === "function") window.renderWebAppIconSettings();
  showToast("📱 Logo de l'application web mis à jour ✓");
};

window.handleCustomWebAppIconUpload = (event) => {
  const file = event?.target?.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    showToast("Sélectionne une image (PNG, JPG, WebP) !");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 256;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        const minSide = Math.min(img.naturalWidth || size, img.naturalHeight || size);
        const sx = ((img.naturalWidth || size) - minSide) / 2;
        const sy = ((img.naturalHeight || size) - minSide) / 2;
        ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
        const pngData = canvas.toDataURL("image/png");
        localStorage.setItem("dnb_webapp_custom_icon", pngData);
        localStorage.setItem("dnb_webapp_icon_mode", "custom");
        const activeTheme = document.documentElement.getAttribute("data-theme") || "light";
        renderDynamicAppLogos(activeTheme);
        if (typeof window.renderWebAppIconSettings === "function") window.renderWebAppIconSettings();
        showToast("📱 Image perso appliquée comme icône d'application ✓");
      } catch (_) {
        showToast("Erreur lors du traitement de l'image.");
      }
    };
    img.src = String(reader.result || "");
  };
  reader.readAsDataURL(file);
  event.target.value = "";
};

window.renderWebAppIconSettings = () => {
  const grid = document.getElementById("settings-webapp-icon-grid");
  if (!grid) return;
  const activeTheme = document.documentElement.getAttribute("data-theme") || "light";
  const currentMode = getWebAppIconMode();
  const customUrl = getCustomWebAppIconDataUrl();

  const items = [
    ...WEBAPP_ICON_PRESETS.map(p => ({
      id: p.id,
      name: p.name,
      desc: p.desc,
      thumb: resolveWebAppIconUrl(p.id, activeTheme, 96)
    })),
    ...(customUrl ? [{ id: "custom", name: "Image perso", desc: "Ta photo importée", thumb: customUrl }] : [])
  ];

  grid.innerHTML = items.map(item => `
    <button type="button" class="webapp-icon-card${currentMode === item.id ? " active" : ""}" onclick="selectWebAppIconMode('${item.id}')">
      <img class="webapp-icon-thumb" src="${esc(item.thumb)}" alt="${esc(item.name)}">
      <div class="webapp-icon-card-meta">
        <div class="webapp-icon-card-title">${esc(item.name)}</div>
        <div class="webapp-icon-card-sub">${esc(item.desc)}</div>
      </div>
    </button>
  `).join("");

  renderDynamicAppLogos(activeTheme);
};

const UNLOCKABLE_BADGES = [
  { id: "studious_15", icon: "📖", label: "Assidu", desc: "15 min de révision", check: (studyMin) => studyMin >= 15 },
  { id: "endurant_30", icon: "⚡", label: "Endurant", desc: "30 min de révision", check: (studyMin) => studyMin >= 30 },
  { id: "noctambule_60", icon: "🌌", label: "Explorateur Galaxy", desc: "1 heure de révision", check: (studyMin) => studyMin >= 60 },
  { id: "tableau_180", icon: "💎", label: "Membre Studio+", desc: "3 heures de révision", check: (studyMin) => studyMin >= 180 },
  { id: "flame_7", icon: "🔵", label: "Flamme Bleue", desc: "7 jours de série", check: (_m, streak) => streak >= 7 },
  { id: "flame_14", icon: "🟣", label: "Flamme Plasma", desc: "14 jours de série", check: (_m, streak) => streak >= 14 },
  { id: "flame_30", icon: "👑", label: "Légende Dorée", desc: "30 jours de série", check: (_m, streak) => streak >= 30 }
];

function formatStudyDurationHuman(ms) {
  const totalMin = Math.max(0, Math.floor((Number(ms) || 0) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min`;
  return `${m} min`;
}

function getCustomThemeStorageKey() {
  return `dnb_custom_theme_${currentUser?.username || "guest"}`;
}

function getCustomThemeConfig() {
  try {
    const raw = localStorage.getItem(getCustomThemeStorageKey());
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        name: parsed.name || "Studio Perso+",
        primary: parsed.primary || "#6366f1",
        bg: parsed.bg || "#0f172a",
        card: parsed.card || "#1e293b",
        ink: parsed.ink || "#f8fafc",
        fx: ["neon", "galaxy", "none"].includes(parsed.fx) ? parsed.fx : "neon"
      };
    }
  } catch (_) {}
  return {
    name: "Studio Perso+",
    primary: "#6366f1",
    bg: "#0f172a",
    card: "#1e293b",
    ink: "#f8fafc",
    fx: "neon"
  };
}

function hexToRgba(hex, alpha) {
  const clean = String(hex || "").replace("#", "");
  if (clean.length !== 6) return `rgba(99,102,241,${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function mixHexColors(hex1, hex2, weight = 0.22) {
  const parse = (h, fallback) => {
    const c = String(h || "").replace("#", "");
    if (c.length !== 6) return fallback;
    return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
  };
  const [r1, g1, b1] = parse(hex1, [99, 102, 241]);
  const [r2, g2, b2] = parse(hex2, [30, 41, 59]);
  const w = Math.max(0, Math.min(1, Number(weight) || 0));
  const r = Math.round(r1 * w + r2 * (1 - w));
  const g = Math.round(g1 * w + g2 * (1 - w));
  const b = Math.round(b1 * w + b2 * (1 - w));
  return `#${[r, g, b].map(x => x.toString(16).padStart(2, "0")).join("")}`;
}

function applyCustomThemeVariables(cfg) {
  const root = document.documentElement;
  const primary = cfg.primary || "#6366f1";
  const card = cfg.card || "#1e293b";
  root.style.setProperty("--custom-primary", primary);
  root.style.setProperty("--custom-primary-f", primary);
  root.style.setProperty("--custom-primary-l", mixHexColors(primary, card, 0.24));
  root.style.setProperty("--custom-banner-bg", mixHexColors(primary, card, 0.48));
  root.style.setProperty("--custom-glow", hexToRgba(primary, 0.28));
  root.style.setProperty("--custom-bg", cfg.bg || "#0f172a");
  root.style.setProperty("--custom-card", card);
  root.style.setProperty("--custom-surface", card);
  root.style.setProperty("--custom-ink", cfg.ink || "#f8fafc");
  root.style.setProperty("--custom-ink-m", hexToRgba(cfg.ink || "#f8fafc", 0.72));
  root.style.setProperty("--custom-nav", hexToRgba(cfg.bg || "#0f172a", 0.88));
  root.style.setProperty("--custom-hl", hexToRgba(cfg.ink || "#f8fafc", 0.16));
  root.style.setProperty("--custom-hl2", hexToRgba(cfg.ink || "#f8fafc", 0.08));
  root.setAttribute("data-custom-fx", cfg.fx || "neon");
}

function isThemeUnlocked(themeId) {
  return UNLOCKABLE_THEMES.some(t => t.id === themeId);
}

window.checkNewlyUnlockedThemesAndBadges = (prevMs, nextMs) => {
  const prevMin = Math.floor((Number(prevMs) || 0) / 60000);
  const nextMin = Math.floor((Number(nextMs) || 0) / 60000);
  if (typeof window.refreshCookieClickerLinks === "function") {
    window.refreshCookieClickerLinks();
  }
  if (nextMin <= prevMin) return;
  let unlockedAnything = false;
  UNLOCKABLE_BADGES.forEach(b => {
    if (b.desc.includes("min") || b.desc.includes("heure")) {
      const wasUnlocked = b.check(prevMin, 0);
      const isNowUnlocked = b.check(nextMin, 0);
      if (!wasUnlocked && isNowUnlocked) {
        unlockedAnything = true;
        showToast(`🏅 Badge débloqué : ${b.icon} ${b.label} !`);
      }
    }
  });
  if (unlockedAnything && document.getElementById("page-setting")?.classList.contains("active")) {
    renderThemesAndRewardsSettings();
  }
};

function loadTheme() {
  const saved = localStorage.getItem("dnb_theme") || currentUser?.selectedTheme || "light";
  const themeId = UNLOCKABLE_THEMES.some(t => t.id === saved) ? saved : "light";
  if (themeId === "custom") {
    applyCustomThemeVariables(getCustomThemeConfig());
  } else {
    document.documentElement.removeAttribute("data-custom-fx");
  }
  document.documentElement.setAttribute("data-theme", themeId);
  renderDynamicAppLogos(themeId);
  const t = document.getElementById("tog-dark");
  if (t) t.checked = themeId === "dark";
  const ccSel = document.getElementById("cc-theme-quick-select");
  if (ccSel) ccSel.value = themeId;
}
loadTheme();

window.applyTheme = (dark) => {
  const themeId = dark ? "dark" : "light";
  window.applyThemeById(themeId);
};

window.applyThemeById = async (themeId) => {
  if (!isThemeUnlocked(themeId)) return;
  if (themeId === "custom") {
    applyCustomThemeVariables(getCustomThemeConfig());
  } else {
    document.documentElement.removeAttribute("data-custom-fx");
  }
  document.documentElement.setAttribute("data-theme", themeId);
  localStorage.setItem("dnb_theme", themeId);
  renderDynamicAppLogos(themeId);
  const tog = document.getElementById("tog-dark");
  if (tog) tog.checked = themeId === "dark";
  const ccSel = document.getElementById("cc-theme-quick-select");
  if (ccSel) ccSel.value = themeId;
  if (typeof window.refreshCookieClickerThemeSync === "function") {
    window.refreshCookieClickerThemeSync();
  }
  if (currentUser?.id) {
    currentUser.selectedTheme = themeId;
    saveSessionLocally(currentUser);
    try { await updateDoc(doc(db, "users", currentUser.id), { selectedTheme: themeId }); } catch (_) {}
  }
  if (typeof renderThemesAndRewardsSettings === "function") renderThemesAndRewardsSettings();
};

window.previewTheme = (themeId) => {
  const prevTheme = document.documentElement.getAttribute("data-theme") || "light";
  if (themeId === "custom") applyCustomThemeVariables(getCustomThemeConfig());
  else document.documentElement.removeAttribute("data-custom-fx");
  document.documentElement.setAttribute("data-theme", themeId);
  renderDynamicAppLogos(themeId);
  showToast("👀 Aperçu du thème pendant 5 secondes…");
  clearTimeout(window._themePreviewTimeout);
  window._themePreviewTimeout = setTimeout(() => {
    const saved = localStorage.getItem("dnb_theme") || prevTheme || "light";
    if (saved === "custom") applyCustomThemeVariables(getCustomThemeConfig());
    else document.documentElement.removeAttribute("data-custom-fx");
    document.documentElement.setAttribute("data-theme", saved);
    renderDynamicAppLogos(saved);
  }, 5000);
};

window.saveCustomThemeConfig = () => {
  const cfg = {
    name: document.getElementById("custom-theme-name")?.value.trim() || "Studio Perso+",
    primary: document.getElementById("custom-color-primary")?.value || "#6366f1",
    bg: document.getElementById("custom-color-bg")?.value || "#0f172a",
    card: document.getElementById("custom-color-card")?.value || "#1e293b",
    ink: document.getElementById("custom-color-ink")?.value || "#f8fafc",
    fx: document.getElementById("custom-theme-fx")?.value || "neon"
  };
  localStorage.setItem(getCustomThemeStorageKey(), JSON.stringify(cfg));
  applyCustomThemeVariables(cfg);
  window.applyThemeById("custom");
  showToast(`🎨 Thème « ${cfg.name} » activé ✓`);
};

window.resetCustomThemeDefaults = () => {
  localStorage.removeItem(getCustomThemeStorageKey());
  const cfg = getCustomThemeConfig();
  if (document.getElementById("custom-theme-name")) document.getElementById("custom-theme-name").value = cfg.name;
  if (document.getElementById("custom-color-primary")) document.getElementById("custom-color-primary").value = cfg.primary;
  if (document.getElementById("custom-color-bg")) document.getElementById("custom-color-bg").value = cfg.bg;
  if (document.getElementById("custom-color-card")) document.getElementById("custom-color-card").value = cfg.card;
  if (document.getElementById("custom-color-ink")) document.getElementById("custom-color-ink").value = cfg.ink;
  if (document.getElementById("custom-theme-fx")) document.getElementById("custom-theme-fx").value = cfg.fx || "neon";
  applyCustomThemeVariables(cfg);
  if ((document.documentElement.getAttribute("data-theme") || "light") === "custom") {
    renderDynamicAppLogos("custom");
  }
  showToast("Couleurs réinitialisées ✓");
};

window.equipStudyBadge = async (badgeId) => {
  const studyMin = Math.floor((window.getTotalStudyMs ? window.getTotalStudyMs() : 0) / 60000);
  const streak = Math.max(Number(currentUser?.maxStreak) || 0, Number(currentUser?.streak) || 0);
  if (!badgeId) {
    if (currentUser?.id) {
      currentUser.equippedBadgeIcon = "";
      currentUser.equippedBadgeLabel = "";
      saveSessionLocally(currentUser);
      try { await updateDoc(doc(db, "users", currentUser.id), { equippedBadgeIcon: "", equippedBadgeLabel: "" }); } catch (_) {}
    }
    renderThemesAndRewardsSettings();
    showToast("Badge retiré ✓");
    return;
  }
  const b = UNLOCKABLE_BADGES.find(item => item.id === badgeId);
  if (!b || !b.check(studyMin, streak)) {
    showToast("🔒 Badge pas encore débloqué !");
    return;
  }
  if (currentUser?.id) {
    currentUser.equippedBadgeIcon = b.icon;
    currentUser.equippedBadgeLabel = b.label;
    saveSessionLocally(currentUser);
    try { await updateDoc(doc(db, "users", currentUser.id), { equippedBadgeIcon: b.icon, equippedBadgeLabel: b.label }); } catch (_) {}
    const myBadge = getBadge(currentUser);
    const dn = document.getElementById("drop-name");
    const drn = document.getElementById("drawer-name");
    if (dn) dn.innerHTML = (currentUser.displayName || currentUser.username) + myBadge;
    if (drn) drn.innerHTML = (currentUser.displayName || currentUser.username) + myBadge;
  }
  renderThemesAndRewardsSettings();
  showToast(`🏅 Badge ${b.icon} ${b.label} affiché sur ton profil ✓`);
};

window.updateSettingsStudyCountersUI = () => {
  const totalMs = window.getTotalStudyMs ? window.getTotalStudyMs() : 0;
  const studyMin = Math.floor(totalMs / 60000);
  const timeEl = document.getElementById("settings-total-study-time");
  if (timeEl) timeEl.textContent = formatStudyDurationHuman(totalMs);

  const nextBadge = UNLOCKABLE_BADGES.find(b => (b.desc.includes("min") || b.desc.includes("heure")) && !b.check(studyMin, 0));
  const nextEl = document.getElementById("settings-next-unlock");
  const fillEl = document.getElementById("settings-study-progress");
  if (nextEl && fillEl) {
    if (nextBadge) {
      nextEl.textContent = `Tous les thèmes & icônes libres ✓ · Prochain badge : ${nextBadge.icon} ${nextBadge.label}`;
      fillEl.style.width = `${Math.min(100, Math.round((studyMin / 180) * 100))}%`;
    } else {
      nextEl.textContent = "Tous les thèmes, logos et badges débloqués ✓";
      fillEl.style.width = "100%";
    }
  }
};

window.renderThemesAndRewardsSettings = () => {
  const totalMs = window.getTotalStudyMs ? window.getTotalStudyMs() : 0;
  const studyMin = Math.floor(totalMs / 60000);
  const maxStreak = Math.max(Number(currentUser?.maxStreak) || 0, Number(currentUser?.streak) || 0);
  const activeTheme = document.documentElement.getAttribute("data-theme") || "light";

  window.updateSettingsStudyCountersUI();

  const grid = document.getElementById("settings-themes-grid");
  if (grid) {
    const customCfg = getCustomThemeConfig();
    grid.innerHTML = UNLOCKABLE_THEMES.map(t => {
      const isActive = activeTheme === t.id;
      const displayTitle = t.id === "custom" && customCfg.name ? customCfg.name : t.name;
      const dots = (t.id === "custom" ? [customCfg.bg, customCfg.card, customCfg.primary] : t.swatches)
        .map(c => `<span style="background:${c}"></span>`).join("");
      const reqText = "Disponible immédiatement (aucun temps requis)";
      const barBg = t.id === "custom"
        ? `linear-gradient(135deg, ${customCfg.bg}, ${customCfg.primary})`
        : (t.swatchBg || t.swatches[0]);
      const barColor = t.lightText ? "#ffffff" : "#1d1d1f";
      return `
        <div class="theme-unlock-card${isActive ? " active" : ""}">
          <div class="theme-swatch-bar" style="background:${barBg};color:${barColor};">
            <span>${esc(displayTitle)}</span>
            <div class="theme-swatch-dots">${dots}</div>
          </div>
          <div class="theme-unlock-meta">
            <div class="theme-unlock-title">${esc(t.desc)}</div>
            <div class="theme-unlock-req">${reqText}</div>
          </div>
          <div class="theme-unlock-actions">
            <button type="button" class="${isActive ? "btn-pill" : "btn-ghost"} btn-sm" onclick="applyThemeById('${t.id}')">${isActive ? "Actif ✓" : "Activer"}</button>
          </div>
        </div>
      `;
    }).join("");
  }

  const customPanel = document.getElementById("settings-custom-theme-panel");
  if (customPanel) {
    customPanel.classList.remove("hidden");
    const cfg = getCustomThemeConfig();
    const nameInput = document.getElementById("custom-theme-name");
    if (nameInput && !nameInput.value) nameInput.value = cfg.name || "Studio Perso+";
    const p = document.getElementById("custom-color-primary");
    const b = document.getElementById("custom-color-bg");
    const c = document.getElementById("custom-color-card");
    const k = document.getElementById("custom-color-ink");
    const fx = document.getElementById("custom-theme-fx");
    if (p) p.value = cfg.primary;
    if (b) b.value = cfg.bg;
    if (c) c.value = cfg.card;
    if (k) k.value = cfg.ink;
    if (fx) fx.value = cfg.fx || "neon";
  }

  const badgesGrid = document.getElementById("settings-badges-grid");
  if (badgesGrid) {
    badgesGrid.innerHTML = UNLOCKABLE_BADGES.map(b => {
      const unlocked = b.check(studyMin, maxStreak);
      const isEquipped = currentUser?.equippedBadgeIcon === b.icon;
      return `
        <button type="button" class="badge-unlock-card${isEquipped ? " active" : ""}${unlocked ? "" : " locked"}" onclick="${unlocked ? (isEquipped ? "equipStudyBadge('')" : `equipStudyBadge('${b.id}')`) : `showToast('🔒 Condition : ${esc(b.desc)}')`}">
          <div style="display:flex;justify-content:space-between;align-items:center;width:100%;">
            <span style="font-size:22px;">${b.icon}</span>
            <span class="caption" style="font-weight:700;">${isEquipped ? "Affiché ✓" : unlocked ? "Débloqué" : "Verrouillé"}</span>
          </div>
          <strong style="font-size:13px;color:var(--ink);">${esc(b.label)}</strong>
          <span class="caption" style="font-size:11px;">${esc(b.desc)}</span>
        </button>
      `;
    }).join("");
  }

  if (typeof window.renderWebAppIconSettings === "function") {
    window.renderWebAppIconSettings();
  }
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
  
  if (window._currentViewedUser && document.getElementById("page-pub-profil")?.classList.contains("active")) {
    renderPublicProfile(window._currentViewedUser.username, { silent: true });
    if (window._pubTabActive === 'likes') renderPubLikes();
  }
  
  if (currentUser) {
    const myBadge = getBadge(currentUser);
    document.getElementById("drop-name").innerHTML = (currentUser.displayName || currentUser.username) + myBadge;
    document.getElementById("drawer-name").innerHTML = (currentUser.displayName || currentUser.username) + myBadge;
  }
  if (typeof window.refreshCookieClickerLinks === "function" && !document.getElementById("cc-easter-modal")?.classList.contains("hidden")) {
    window.refreshCookieClickerLinks();
  }
});

window.addEventListener("hashchange", handleHashChange);

window.addEventListener("DOMContentLoaded", () => {
  setTimeout(handleHashChange, 50);
  loadTheme();
  const trig = document.getElementById("dnb-cookie-easter-trigger");
  if (!localStorage.getItem('dnb_cookie_consent')) {
    document.getElementById('cookie-banner').style.display = 'flex';
    if (trig) trig.classList.add('shifted');
  }
});

window.handleCookies = (accept) => {
  localStorage.setItem('dnb_cookie_consent', accept ? 'true' : 'false');
  document.getElementById('cookie-banner').style.display = 'none';
  const trig = document.getElementById("dnb-cookie-easter-trigger");
  if (trig) trig.classList.remove('shifted');
  if (accept) {
     console.log("Google Analytics activé");
  }
};


const CUSTOM_STATS_LS_KEY = "dnb_stats_custom_entries_v1";

function formatStatsDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}
function formatShortFrDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(`${String(dateStr).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return String(dateStr);
  return d.toLocaleDateString("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric" });
}
function startOfLocalDay(date = new Date()) { const d = new Date(date); d.setHours(0,0,0,0); return d; }
function statsDateKey(ts) { return new Date(ts).toLocaleDateString("fr-CA"); }
function destroyStatsCharts() { Object.values(window._statisticsCharts || {}).forEach(chart => { try { chart.destroy(); } catch (_) {} }); window._statisticsCharts = {}; }
function chartDefaults() {
  const ink = getComputedStyle(document.body).color;
  const muted = getComputedStyle(document.documentElement).getPropertyValue('--ink-m').trim() || ink;
  return { responsive:true, maintainAspectRatio:false,
    interaction:{mode:'index',intersect:false},
    plugins:{ legend:{display:true,labels:{color:ink,usePointStyle:true,boxWidth:8,padding:16}}, tooltip:{backgroundColor:'rgba(15,23,42,.94)',padding:10,cornerRadius:10,titleColor:'#fff',bodyColor:'#fff',displayColors:true} },
    scales:{ x:{ticks:{color:muted,maxRotation:0},grid:{display:false}}, y:{beginAtZero:true,ticks:{precision:0,color:muted},grid:{color:'rgba(127,127,127,.12)'}} }
  };
}
const STATS_CHART_COLORS = ['#4f46e5','#0284c7','#10b981','#f59e0b','#ec4899','#7c3aed','#14b8a6'];
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
  const effectiveDays = rangeDays >= 365 ? 90 : rangeDays;
  const today=startOfLocalDay(), keys=[], map=new Map();
  for(let i=effectiveDays-1;i>=0;i--){const d=new Date(today);d.setDate(d.getDate()-i);const k=statsDateKey(d.getTime());keys.push(k);map.set(k,{sessions:0,views:0});}
  events.forEach(e=>{const k=statsDateKey(e.timestamp);if(!map.has(k))return;if(e.type==="login")map.get(k).sessions++;if(e.type==="page_view")map.get(k).views++;});
  return {labels:keys.map(k=>new Date(`${k}T00:00:00`).toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"})),sessions:keys.map(k=>map.get(k).sessions),views:keys.map(k=>map.get(k).views)};
}
function buildConcurrentByHour(sessions) {
  const arr=Array(24).fill(0);
  for(let hour=0;hour<24;hour++){arr[hour]=sessions.reduce((count,s)=>{const start=Number(s.startedAt||0),end=Number(s.endedAt||s.lastSeenAt||start);if(!start)return count;const d=new Date(start);d.setHours(hour,30,0,0);const t=d.getTime();return(start<=t&&end>=t)?count+1:count;},0);}
  return arr;
}
window.switchStatsSubtab = (tab, btn) => {
  document.querySelectorAll(".stats-subtab").forEach(el => el.classList.toggle("active", el === btn || el.dataset.tab === tab));
  document.querySelectorAll("#page-statistiques [data-stats-section]").forEach(sec => {
    const name = sec.getAttribute("data-stats-section");
    const visible = tab === "all" || name === "overview" || name === tab;
    sec.classList.toggle("hidden", !visible);
  });
};

function readLocalCustomStats() {
  try {
    const raw = localStorage.getItem(CUSTOM_STATS_LS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}
function writeLocalCustomStats(list) {
  try { localStorage.setItem(CUSTOM_STATS_LS_KEY, JSON.stringify(list || [])); } catch (_) {}
}

async function loadCustomStatEntries() {
  const local = readLocalCustomStats();
  const byId = new Map();
  local.forEach(item => { if (item && item.id) byId.set(item.id, item); });
  try {
    const snap = await getDocs(collection(db, "analytics_custom_entries"));
    snap.forEach(d => {
      const data = d.data() || {};
      byId.set(d.id, {
        id: d.id,
        label: String(data.label || "Indicateur"),
        category: String(data.category || "Autre"),
        value: Number(data.value || 0),
        unit: String(data.unit || ""),
        date: String(data.date || new Date(data.createdAt || Date.now()).toISOString().slice(0, 10)),
        note: String(data.note || ""),
        includeInPdf: data.includeInPdf !== false,
        createdBy: String(data.createdBy || ""),
        createdAt: Number(data.createdAt || Date.now()),
        source: "firebase"
      });
    });
  } catch (_) {}
  const merged = Array.from(byId.values()).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")) || (b.createdAt || 0) - (a.createdAt || 0));
  writeLocalCustomStats(merged);
  return merged;
}

window.openStatsAddDataModal = () => {
  if (!isAdminUser(currentUser)) return showToast("Accès non autorisé.");
  const dateEl = document.getElementById("stat-custom-date");
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);
  const labelEl = document.getElementById("stat-custom-label");
  if (labelEl) labelEl.value = "";
  const valEl = document.getElementById("stat-custom-value");
  if (valEl) valEl.value = "";
  const unitEl = document.getElementById("stat-custom-unit");
  if (unitEl) unitEl.value = "";
  const noteEl = document.getElementById("stat-custom-note");
  if (noteEl) noteEl.value = "";
  const incEl = document.getElementById("stat-custom-include-pdf");
  if (incEl) incEl.checked = true;
  openModal("m-stats-add-data");
};

window.saveCustomStatEntry = async () => {
  if (!isAdminUser(currentUser)) return showToast("Accès non autorisé.");
  const label = String(document.getElementById("stat-custom-label")?.value || "").trim();
  const category = String(document.getElementById("stat-custom-category")?.value || "Autre").trim();
  const rawVal = document.getElementById("stat-custom-value")?.value;
  const value = Number(rawVal);
  const unit = String(document.getElementById("stat-custom-unit")?.value || "").trim();
  const date = String(document.getElementById("stat-custom-date")?.value || new Date().toISOString().slice(0, 10)).slice(0, 10);
  const note = String(document.getElementById("stat-custom-note")?.value || "").trim();
  const includeInPdf = Boolean(document.getElementById("stat-custom-include-pdf")?.checked);

  if (!label) return showToast("Indique un libellé pour cette donnée.");
  if (rawVal === "" || Number.isNaN(value)) return showToast("Saisis une valeur numérique valide.");

  const entry = {
    label,
    category,
    value,
    unit,
    date,
    note,
    includeInPdf,
    createdBy: currentUser?.username || "admin",
    createdAt: Date.now()
  };

  let docId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  let source = "local";
  try {
    const ref = await addDoc(collection(db, "analytics_custom_entries"), entry);
    docId = ref.id;
    source = "firebase";
  } catch (_) {}

  const saved = { id: docId, ...entry, source };
  const current = (window._statisticsCache?.customEntries || readLocalCustomStats()).filter(x => x.id !== docId);
  current.unshift(saved);
  writeLocalCustomStats(current);
  if (window._statisticsCache) window._statisticsCache.customEntries = current;
  closeModal("m-stats-add-data");
  renderCustomStatsSection();
  updateContentStatsKpiAndChart();
  showToast("Donnée statistique enregistrée.");
};

window.toggleCustomStatPdf = async (id) => {
  const list = window._statisticsCache?.customEntries || readLocalCustomStats();
  const target = list.find(e => e.id === id);
  if (!target) return;
  target.includeInPdf = !target.includeInPdf;
  writeLocalCustomStats(list);
  if (target.source === "firebase" || !String(id).startsWith("local_")) {
    try { await updateDoc(doc(db, "analytics_custom_entries", id), { includeInPdf: target.includeInPdf }); } catch (_) {}
  }
  renderCustomStatsSection();
};

window.deleteCustomStatEntry = async (id) => {
  if (!isAdminUser(currentUser)) return;
  const current = (window._statisticsCache?.customEntries || readLocalCustomStats()).filter(e => e.id !== id);
  writeLocalCustomStats(current);
  if (window._statisticsCache) window._statisticsCache.customEntries = current;
  if (!String(id).startsWith("local_")) {
    try { await deleteDoc(doc(db, "analytics_custom_entries", id)); } catch (_) {}
  }
  renderCustomStatsSection();
  updateContentStatsKpiAndChart();
  showToast("Donnée supprimée.");
};

function renderCustomStatsChart(entries) {
  const canvas = document.getElementById("stats-custom-chart");
  if (!canvas || !window.Chart) return;
  if (window._statisticsCharts?.custom) {
    try { window._statisticsCharts.custom.destroy(); } catch (_) {}
  }
  const visible = entries.slice(0, 12).reverse();
  const labels = visible.length ? visible.map(e => e.label.length > 18 ? e.label.slice(0, 17) + "…" : e.label) : ["Aucune donnée"];
  const values = visible.length ? visible.map(e => Number(e.value) || 0) : [0];
  const opts = chartDefaults();
  opts.plugins.legend.display = false;
  window._statisticsCharts.custom = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Valeur",
        data: values,
        backgroundColor: visible.length ? statsPalette(values.length) : ["rgba(148,163,184,0.35)"],
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 36
      }]
    },
    options: opts
  });
}

window.renderCustomStatsSection = () => {
  const entries = window._statisticsCache?.customEntries || readLocalCustomStats();
  const catFilter = document.getElementById("stats-custom-cat-filter")?.value || "all";
  const filtered = catFilter === "all" ? entries : entries.filter(e => e.category === catFilter);

  const summaryWrap = document.getElementById("stats-custom-summary");
  if (summaryWrap) {
    const byCat = new Map();
    entries.forEach(e => {
      const k = e.category || "Autre";
      if (!byCat.has(k)) byCat.set(k, { count: 0, total: 0 });
      const cur = byCat.get(k);
      cur.count += 1;
      cur.total += Number(e.value || 0);
    });
    const pdfCount = entries.filter(e => e.includeInPdf !== false).length;
    summaryWrap.innerHTML = [
      `<div class="stats-custom-chip"><span>Total ajouts</span><strong>${entries.length}</strong></div>`,
      `<div class="stats-custom-chip"><span>Inclus PDF</span><strong>${pdfCount}</strong></div>`,
      ...Array.from(byCat.entries()).map(([cat, info]) => `<div class="stats-custom-chip"><span>${esc(cat)}</span><strong>${info.count} · ${Number.isInteger(info.total) ? info.total : info.total.toFixed(1)}</strong></div>`)
    ].join("");
  }

  const tbody = document.getElementById("stats-custom-tbody");
  if (tbody) {
    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="stats-empty">Aucune donnée personnalisée dans cette catégorie. Clique sur « ＋ Ajouter des données ».</td></tr>';
    } else {
      tbody.innerHTML = filtered.map(e => `
        <tr>
          <td>${esc(formatShortFrDate(e.date))}</td>
          <td><strong>${esc(e.label)}</strong></td>
          <td><span class="stats-cat-badge">${esc(e.category || "Autre")}</span></td>
          <td><strong>${esc(String(e.value))}${e.unit ? ` <small>${esc(e.unit)}</small>` : ""}</strong></td>
          <td style="max-width:220px; white-space:normal;">${esc(e.note || "—")}</td>
          <td>
            <button type="button" class="stats-pdf-pill ${e.includeInPdf !== false ? "on" : ""}" onclick="toggleCustomStatPdf('${esc(e.id)}')">
              ${e.includeInPdf !== false ? "✓ Inclus" : "Masqué"}
            </button>
          </td>
          <td>
            <button type="button" class="btn-ghost btn-sm" onclick="deleteCustomStatEntry('${esc(e.id)}')" title="Supprimer">🗑</button>
          </td>
        </tr>
      `).join("");
    }
  }
  renderCustomStatsChart(filtered);
};

function updateContentStatsKpiAndChart() {
  const cache = window._statisticsCache || {};
  const counts = cache.contentCounts || { posts: 0, fiches: 0, quizzes: 0, aiQuizzes: 0 };
  const customCount = (cache.customEntries || []).length;
  const totalContents = (counts.posts || 0) + (counts.fiches || 0) + (counts.quizzes || 0) + (counts.aiQuizzes || 0) + customCount;
  const kpiEl = document.getElementById("stats-kpi-contents");
  if (kpiEl) kpiEl.textContent = totalContents;

  const canvas = document.getElementById("stats-content-chart");
  if (!canvas || !window.Chart) return;
  if (window._statisticsCharts?.contents) {
    try { window._statisticsCharts.contents.destroy(); } catch (_) {}
  }
  const opts = chartDefaults();
  opts.plugins.legend.display = false;
  window._statisticsCharts.contents = new Chart(canvas, {
    type: "bar",
    data: {
      labels: ["Cours", "Fiches / Révisions", "Quiz", "Quiz IA", "Données perso"],
      datasets: [{
        label: "Éléments",
        data: [counts.posts || 0, counts.fiches || 0, counts.quizzes || 0, counts.aiQuizzes || 0, customCount],
        backgroundColor: ["#4f46e5", "#14b8a6", "#0284c7", "#7c3aed", "#f59e0b"],
        borderRadius: 8,
        borderSkipped: false,
        maxBarThickness: 34
      }]
    },
    options: opts
  });
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
function formatActivityDuration(ms){const min=Math.max(0,Math.round(Number(ms||0)/60000));const h=Math.floor(min/60),m=min%60;return h?`${h}h ${String(m).padStart(2,"0")}min`:`${m} min`;}
function aggregateActivity(docs,users,since=0){const map=new Map();const ensure=(id,f={})=>{const k=String(id||f.id||"");if(!k)return null;if(!map.has(k))map.set(k,{id:k,username:f.username||k,role:f.role||"",durationMs:0,sessions:0,pageViews:0,quizStarts:0,quizCompletes:0,aiQuizGenerations:0,searches:0,likes:0,comments:0,shares:0,postsViewed:0,postsCreated:0,lastActivity:0});return map.get(k);};users.forEach(u=>ensure(u.id,u));docs.forEach(a=>{const r=ensure(a.userId,a);if(!r)return;const ts=Number(a.timestamp||0);r.lastActivity=Math.max(r.lastActivity,ts);if(ts<since)return;r.sessions++;r.durationMs+=Number(a.durationMs||0);r.pageViews+=Number(a.pageViews||0);r.quizStarts+=Number(a.quizStarts||0);r.quizCompletes+=Number(a.quizCompletes||0);r.aiQuizGenerations+=Number(a.aiQuizGenerations||0);r.searches+=Number(a.searches||0);r.likes+=Number(a.likes||0);r.comments+=Number(a.comments||0);r.shares+=Number(a.shares||0);r.postsViewed+=Number(a.postsViewed||0);r.postsCreated+=Number(a.postsCreated||0);});return [...map.values()];}
function renderLifetimeActivityRanking(){const tb=document.getElementById("stats-lifetime-ranking-tbody");if(!tb)return;const rows=[...(window._statisticsCache.activityLifetime||[])].filter(r=>r.role!=="professeur"&&r.role!=="admin").sort((a,b)=>b.durationMs-a.durationMs);tb.innerHTML=rows.length?rows.slice(0,200).map((r,i)=>`<tr><td><strong>#${i+1}</strong></td><td><strong>@${esc(r.username||r.id)}</strong></td><td>${formatActivityDuration(r.durationMs)}</td><td>${r.sessions}</td><td>${r.pageViews}</td><td>${r.quizCompletes}</td><td>${r.aiQuizGenerations}</td><td>${formatStatsDate(r.lastActivity)}</td></tr>`).join(""):'<tr><td colspan="8" class="stats-empty">Aucune donnée.</td></tr>';}
function renderActivityRanking(){const tb=document.getElementById("stats-activity-ranking-tbody");if(!tb)return;const q=(document.getElementById("stats-activity-search")?.value||"").toLowerCase().trim();const rows=[...(window._statisticsCache.activity||[])].filter(r=>r.role!=="professeur"&&r.role!=="admin"&&(!q||String(r.username||"").toLowerCase().includes(q))).sort((a,b)=>b.durationMs-a.durationMs);tb.innerHTML=rows.length?rows.slice(0,200).map((r,i)=>`<tr><td><strong>#${i+1}</strong></td><td><strong>@${esc(r.username||r.id)}</strong></td><td>${formatActivityDuration(r.durationMs)}</td><td>${r.sessions}</td><td>${r.pageViews}</td><td>${r.quizStarts}</td><td>${r.quizCompletes}</td><td>${r.aiQuizGenerations}</td><td>${r.searches}</td><td>${formatStatsDate(r.lastActivity)}</td></tr>`).join(""):'<tr><td colspan="10" class="stats-empty">Aucune donnée.</td></tr>';}

window.loadStatisticsDashboard=async()=>{
  if(!isAdminUser(currentUser)){showToast("Accès non autorisé.");window.location.hash="#accueil";return;}
  const status=document.getElementById("stats-status");
  const rangeDays=Math.max(1,Number(document.getElementById("stats-range")?.value||7));
  const roleFilter=document.getElementById("stats-role-filter")?.value||"all";
  const since=rangeDays>=3650?0:(Date.now()-rangeDays*86400000);
  const periodPill=document.getElementById("stats-hero-period-pill");
  if(periodPill){
    const periodLabel=rangeDays>=3650?"Tout l'historique":`${rangeDays} jour${rangeDays>1?"s":""}`;
    periodPill.textContent=`${periodLabel} · ${roleFilter==="all"?"Tous les rôles":roleFilter}`;
  }
  if(status)status.textContent="Chargement des statistiques…";
  try{
    const sessionQ=since>0?query(collection(db,"analytics_sessions"),where("startedAt",">=",since)):collection(db,"analytics_sessions");
    const eventQ=since>0?query(collection(db,"analytics_events"),where("timestamp",">=",since)):collection(db,"analytics_events");
    const [usersRes,sessionsRes,eventsRes,activityRes,postsRes,quizzesRes,aiQuizzesRes,customEntries]=await Promise.all([
      getDocs(collection(db,"users")).catch(()=>null),
      getDocs(sessionQ).catch(()=>null),
      getDocs(eventQ).catch(()=>null),
      getDocs(collection(db,"analytics_activity")).catch(()=>null),
      getDocs(collection(db,"posts")).catch(()=>null),
      getDocs(collection(db,"quizzes")).catch(()=>null),
      getDocs(collection(db,"ai_quizzes")).catch(()=>null),
      loadCustomStatEntries()
    ]);
    if(!usersRes&&!sessionsRes&&!eventsRes) throw new Error("Firestore stats unavailable");
    const allUsers=[],allSessions=[],allEvents=[],allActivityDocs=[];
    usersRes?.forEach(d=>allUsers.push({id:d.id,...d.data()}));
    sessionsRes?.forEach(d=>allSessions.push({id:d.id,...d.data()}));
    eventsRes?.forEach(d=>allEvents.push({id:d.id,...d.data()}));
    activityRes?.forEach(d=>allActivityDocs.push({id:d.id,...d.data()}));

    const userRoleMap=new Map();
    allUsers.forEach(u=>userRoleMap.set(u.id,u.role||"élève"));
    const matchesRole=(r,uid)=>{
      if(roleFilter==="all")return true;
      const resolved=String(r||userRoleMap.get(uid)||"").toLowerCase();
      return resolved===roleFilter.toLowerCase();
    };
    const users=roleFilter==="all"?allUsers:allUsers.filter(u=>matchesRole(u.role,u.id));
    const sessions=roleFilter==="all"?allSessions:allSessions.filter(s=>matchesRole(s.role,s.userId));
    const events=roleFilter==="all"?allEvents:allEvents.filter(e=>matchesRole(e.role,e.userId));
    const activityDocs=roleFilter==="all"?allActivityDocs:allActivityDocs.filter(a=>matchesRole(a.role,a.userId));

    let postsCount=0,fichesCount=0,quizzesCount=quizzesRes?quizzesRes.size:0,aiQuizzesCount=aiQuizzesRes?aiQuizzesRes.size:0;
    postsRes?.forEach(d=>{const p=d.data()||{};if(String(p.type||"").toLowerCase().includes("fiche"))fichesCount++;else postsCount++;});
    const contentCounts={posts:postsCount,fiches:fichesCount,quizzes:quizzesCount,aiQuizzes:aiQuizzesCount};

    const perUser=new Map();users.forEach(u=>perUser.set(u.id,{id:u.id,username:u.username||u.id,role:u.role||"—",sessions:0,lastLogin:0,lastPage:"—",timezone:"—",countryHint:""}));
    sessions.forEach(s=>{const u=perUser.get(s.userId)||{id:s.userId,username:s.username||s.userId,role:s.role||"—",sessions:0,lastLogin:0,lastPage:"—",timezone:s.timezone||"—",countryHint:s.countryHint||""};u.sessions++;u.lastLogin=Math.max(u.lastLogin||0,Number(s.startedAt||0));u.timezone=s.timezone||u.timezone;u.countryHint=s.countryHint||u.countryHint;perUser.set(s.userId,u);});
    events.filter(e=>e.type==="login").forEach(e=>{const u=perUser.get(e.userId)||{id:e.userId,username:e.username||e.userId,role:e.role||"—",sessions:0,lastLogin:0,lastPage:"—",timezone:e.timezone||"—",countryHint:e.countryHint||""};u.lastLogin=Math.max(u.lastLogin||0,Number(e.timestamp||0));u.timezone=e.timezone||u.timezone;u.countryHint=e.countryHint||u.countryHint;perUser.set(e.userId,u);});
    events.filter(e=>e.type==="page_view").forEach(e=>{const u=perUser.get(e.userId);if(u&&Number(e.timestamp||0)>=Number(u.lastLogin||0))u.lastPage=e.page||u.lastPage;});
    const userRows=Array.from(perUser.values()).sort((a,b)=>(b.lastLogin||0)-(a.lastLogin||0));
    const activity=aggregateActivity(activityDocs,users,since),activityLifetime=aggregateActivity(activityDocs,users,0);
    const totalStudyMs=activityLifetime.reduce((sum,r)=>sum+Number(r.durationMs||0),0);
    const hourly=buildHourlyConnectionData(events),concurrent=buildConcurrentByHour(sessions),daily=buildDailyData(events,rangeDays);
    const liveCutoff=Date.now()-3*60*1000,live=sessions.filter(s=>Number(s.lastSeenAt||0)>=liveCutoff&&!s.endedAt).length,views=events.filter(e=>e.type==="page_view").length,peak=Math.max(0,...concurrent);
    window._statisticsCache={users:userRows,sessions,events,hourly,concurrent,daily,activity,activityLifetime,contentCounts,customEntries,totalStudyMs,roleFilter};

    document.getElementById("stats-kpi-users").textContent=users.length;
    document.getElementById("stats-kpi-sessions").textContent=sessions.length;
    document.getElementById("stats-kpi-logins").textContent=events.filter(e=>e.type==="login").length;
    document.getElementById("stats-kpi-peak").textContent=peak;
    document.getElementById("stats-kpi-live").textContent=live;
    document.getElementById("stats-kpi-views").textContent=views;
    const studyEl=document.getElementById("stats-kpi-study-time");
    if(studyEl) studyEl.textContent=formatActivityDuration(totalStudyMs);

    renderStatisticsUsers();renderStatisticsTimezones(userRows);renderStatisticsPages(events);renderLifetimeActivityRanking();renderActivityRanking();destroyStatsCharts();
    if(window.Chart){
      const opts=chartDefaults();
      const hCtx=document.getElementById("stats-hourly-chart")?.getContext("2d");
      let hBg="rgba(79,70,229,.78)";
      if(hCtx){const g=hCtx.createLinearGradient(0,0,0,260);g.addColorStop(0,"rgba(79,70,229,.92)");g.addColorStop(1,"rgba(124,58,237,.35)");hBg=g;}
      window._statisticsCharts.hourly=new Chart(document.getElementById("stats-hourly-chart"),{type:"bar",data:{labels:Array.from({length:24},(_,i)=>`${String(i).padStart(2,"0")}h`),datasets:[{label:"Connexions",data:hourly,backgroundColor:hBg,borderRadius:8,borderSkipped:false,maxBarThickness:22}]},options:opts});
      window._statisticsCharts.concurrent=new Chart(document.getElementById("stats-concurrent-chart"),{type:"line",data:{labels:Array.from({length:24},(_,i)=>`${String(i).padStart(2,"0")}h`),datasets:[{label:"Connectés estimés",data:concurrent,borderColor:"#7c3aed",backgroundColor:"rgba(124,58,237,.14)",pointRadius:2.5,pointHoverRadius:5,tension:.36,fill:true}]},options:opts});
      window._statisticsCharts.daily=new Chart(document.getElementById("stats-daily-chart"),{type:"line",data:{labels:daily.labels,datasets:[{label:"Sessions",data:daily.sessions,borderColor:"#4f46e5",backgroundColor:"rgba(79,70,229,.10)",pointRadius:2,tension:.32,fill:true},{label:"Pages vues",data:daily.views,borderColor:"#10b981",backgroundColor:"rgba(16,185,129,.08)",pointRadius:2,tension:.32,fill:true}]},options:opts});
      const roleCounts=new Map(),deviceCounts=new Map(); userRows.forEach(u=>{const role=u.role||"Inconnu";roleCounts.set(role,(roleCounts.get(role)||0)+1);}); sessions.forEach(ss=>{const device=ss.device||"Inconnu";deviceCounts.set(device,(deviceCounts.get(device)||0)+1);});
      window._statisticsCharts.roles=makeDoughnutChart("stats-role-chart",Array.from(roleCounts.keys()),Array.from(roleCounts.values()),"stats-role-legend","stats-role-total");
      window._statisticsCharts.devices=makeDoughnutChart("stats-device-chart",Array.from(deviceCounts.keys()),Array.from(deviceCounts.values()),"stats-device-legend",null);
    }
    updateContentStatsKpiAndChart();
    renderCustomStatsSection();
    if(status)status.textContent=`Données internes : ${rangeDays>=3650?"Tout l'historique":`${rangeDays} jour${rangeDays>1?"s":""}`}. Dernière actualisation ${formatStatsDate(Date.now())}.`;
  }catch(error){console.error("Erreur statistiques :",error);if(status)status.textContent="Impossible de charger les statistiques. Vérifie les règles Firestore pour analytics_events et analytics_sessions.";showToast("Statistiques indisponibles.");}
};
function statisticsExportPayload(){return{generatedAt:new Date().toISOString(),rangeDays:Number(document.getElementById("stats-range")?.value||7),roleFilter:document.getElementById("stats-role-filter")?.value||"all",summary:{users:document.getElementById("stats-kpi-users")?.textContent||"0",sessions:document.getElementById("stats-kpi-sessions")?.textContent||"0",logins:document.getElementById("stats-kpi-logins")?.textContent||"0",peakConcurrent:document.getElementById("stats-kpi-peak")?.textContent||"0",liveNow:document.getElementById("stats-kpi-live")?.textContent||"0",pageViews:document.getElementById("stats-kpi-views")?.textContent||"0",totalStudyTime:document.getElementById("stats-kpi-study-time")?.textContent||"0 min",totalContents:document.getElementById("stats-kpi-contents")?.textContent||"0"},contentCounts:window._statisticsCache.contentCounts||{},customEntries:window._statisticsCache.customEntries||[],hourlyConnections:window._statisticsCache.hourly||[],concurrentByHour:window._statisticsCache.concurrent||[],daily:window._statisticsCache.daily||{},users:window._statisticsCache.users||[],sessions:window._statisticsCache.sessions||[],events:window._statisticsCache.events||[],activity:window._statisticsCache.activity||[],activityLifetime:window._statisticsCache.activityLifetime||[]};}
window.exportStatisticsJSON=()=>{if(!isAdminUser(currentUser))return showToast("Accès non autorisé.");const blob=new Blob([JSON.stringify(statisticsExportPayload(),null,2)],{type:"application/json;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`dnb-statistiques-${new Date().toISOString().slice(0,10)}.json`;a.click();URL.revokeObjectURL(a.href);};

window.openStatsPdfModal = () => {
  if (!isAdminUser(currentUser)) return showToast("Accès non autorisé.");
  openModal("m-stats-pdf-export");
};

window.exportStatisticsPDF = () => window.openStatsPdfModal();

function captureChartAsWhitePng(canvasId) {
  const src = document.getElementById(canvasId);
  if (!src || !src.width || !src.height) return null;
  try {
    const off = document.createElement("canvas");
    off.width = src.width;
    off.height = src.height;
    const ctx = off.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, off.width, off.height);
    ctx.drawImage(src, 0, 0);
    return {
      dataUrl: off.toDataURL("image/png", 1.0),
      ratio: off.height / off.width
    };
  } catch (_) {
    return null;
  }
}

window.generateStylizedStatisticsPDF = () => {
  if (!isAdminUser(currentUser)) return showToast("Accès non autorisé.");
  if (!window.jspdf?.jsPDF) return showToast("Le module PDF n'est pas disponible.");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = 210, pageH = 297, margin = 14, contentW = pageW - margin * 2;
  const p = statisticsExportPayload();

  const reportTitle = String(document.getElementById("pdf-report-title")?.value || "DnB Reviz — Rapport Statistiques").trim();
  const reportSub = String(document.getElementById("pdf-report-subtitle")?.value || "Bilan administrateur consolidé").trim();
  const reportNote = String(document.getElementById("pdf-report-note")?.value || "").trim();

  const incKpis = Boolean(document.getElementById("pdf-inc-kpis")?.checked);
  const incCharts = Boolean(document.getElementById("pdf-inc-charts")?.checked);
  const incCustom = Boolean(document.getElementById("pdf-inc-custom")?.checked);
  const incRanking = Boolean(document.getElementById("pdf-inc-ranking")?.checked);
  const incPages = Boolean(document.getElementById("pdf-inc-pages")?.checked);
  const incUsers = Boolean(document.getElementById("pdf-inc-users")?.checked);

  let y = 0;

  const ensureSpace = (neededMm) => {
    if (y + neededMm > pageH - 18) {
      doc.addPage();
      y = 16;
    }
  };

  const drawSectionHeading = (tag, title) => {
    ensureSpace(16);
    doc.setFillColor(238, 242, 255);
    doc.roundedRect(margin, y, contentW, 10, 2, 2, "F");
    doc.setFillColor(79, 70, 229);
    doc.rect(margin, y, 2.2, 10, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(79, 70, 229);
    doc.text(tag.toUpperCase(), margin + 5, y + 3.8);
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin + 5, y + 8.3);
    y += 13;
  };

  const drawStyledPdfTable = (headers, colWidths, rows) => {
    const rowH = 6.8;
    const drawHeader = () => {
      ensureSpace(rowH + 6);
      doc.setFillColor(79, 70, 229);
      doc.roundedRect(margin, y, contentW, rowH, 1.5, 1.5, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255, 255, 255);
      let x = margin + 2.5;
      headers.forEach((h, i) => {
        doc.text(String(h), x, y + 4.7);
        x += colWidths[i];
      });
      y += rowH;
    };

    drawHeader();
    rows.forEach((row, idx) => {
      if (y + rowH > pageH - 18) {
        doc.addPage();
        y = 16;
        drawHeader();
      }
      if (idx % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y, contentW, rowH, "F");
      } else {
        doc.setFillColor(255, 255, 255);
        doc.rect(margin, y, contentW, rowH, "F");
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y + rowH, margin + contentW, y + rowH);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      let x = margin + 2.5;
      row.forEach((cell, i) => {
        const maxW = Math.max(10, colWidths[i] - 3);
        let txt = String(cell ?? "—");
        while (txt.length > 3 && doc.getTextWidth(txt) > maxW) txt = txt.slice(0, -4) + "…";
        doc.text(txt, x, y + 4.6);
        x += colWidths[i];
      });
      y += rowH;
    });
    y += 5;
  };

  // En-tête stylisé
  doc.setFillColor(79, 70, 229);
  doc.rect(0, 0, pageW, 38, "F");
  doc.setFillColor(168, 85, 247);
  doc.rect(0, 35, pageW, 3, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(255, 255, 255);
  doc.text(reportTitle, margin, 15, { maxWidth: contentW });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(224, 231, 255);
  doc.text(reportSub, margin, 22.5, { maxWidth: contentW });

  const periodTxt = p.rangeDays >= 3650 ? "Tout l'historique" : `${p.rangeDays} jour(s)`;
  const roleTxt = p.roleFilter === "all" ? "Tous rôles" : p.roleFilter;
  const metaLine = `Généré le ${new Date().toLocaleString("fr-FR")}  ·  Période : ${periodTxt}  ·  Filtre : ${roleTxt}  ·  Par @${currentUser?.username || "admin"}`;
  doc.setFontSize(8);
  doc.setTextColor(238, 242, 255);
  doc.text(metaLine, margin, 30.5, { maxWidth: contentW });

  y = 45;

  // Synthèse Admin optionnelle
  if (reportNote) {
    const lines = doc.splitTextToSize(reportNote, contentW - 10);
    const boxH = Math.max(14, lines.length * 4.5 + 8);
    ensureSpace(boxH + 4);
    doc.setFillColor(245, 243, 255);
    doc.setDrawColor(196, 181, 253);
    doc.roundedRect(margin, y, contentW, boxH, 2.5, 2.5, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(109, 40, 217);
    doc.text("NOTE DE SYNTHÈSE ADMINISTRATEUR", margin + 4, y + 5.5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(30, 41, 59);
    doc.text(lines, margin + 4, y + 10.5);
    y += boxH + 6;
  }

  // Cartes KPI
  if (incKpis) {
    drawSectionHeading("Vue globale", "Indicateurs clés de performance (KPI)");
    const kpis = [
      { label: "Utilisateurs", val: p.summary.users, sub: "comptes suivis", accent: [79, 70, 229] },
      { label: "Sessions", val: p.summary.sessions, sub: "sur la période", accent: [2, 132, 199] },
      { label: "Connexions", val: p.summary.logins, sub: "entrées enregistrées", accent: [124, 58, 237] },
      { label: "Pic simultané", val: p.summary.peakConcurrent, sub: "connectés max", accent: [217, 119, 6] },
      { label: "En ligne", val: p.summary.liveNow, sub: "activité récente", accent: [16, 185, 129] },
      { label: "Pages vues", val: p.summary.pageViews, sub: "vues internes", accent: [236, 72, 153] },
      { label: "Temps révisé", val: p.summary.totalStudyTime, sub: "cumulé", accent: [20, 184, 166] },
      { label: "Contenus & ajouts", val: p.summary.totalContents, sub: "base & perso", accent: [245, 158, 11] }
    ];
    const gap = 3.5;
    const cardW = (contentW - gap * 3) / 4;
    const cardH = 21;
    kpis.forEach((k, idx) => {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      if (col === 0) ensureSpace(cardH + 4);
      const x = margin + col * (cardW + gap);
      const cy = y + row * (cardH + gap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, cy, cardW, cardH, 2.2, 2.2, "FD");
      doc.setFillColor(...k.accent);
      doc.roundedRect(x, cy, cardW, 1.8, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(k.label.toUpperCase(), x + 3, cy + 6.5);
      doc.setFontSize(13);
      doc.setTextColor(15, 23, 42);
      doc.text(String(k.val), x + 3, cy + 13.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139);
      doc.text(k.sub, x + 3, cy + 18.2);
    });
    y += 2 * (cardH + gap) + 4;
  }

  // Graphiques haute définition
  if (incCharts) {
    const chartDefs = [
      { id: "stats-hourly-chart", title: "Connexions par heure (24 h)" },
      { id: "stats-daily-chart", title: "Évolution sessions & pages vues" },
      { id: "stats-content-chart", title: "Répartition des contenus" },
      { id: "stats-custom-chart", title: "Indicateurs personnalisés" }
    ];
    const captured = chartDefs
      .map(c => ({ ...c, img: captureChartAsWhitePng(c.id) }))
      .filter(c => c.img);

    if (captured.length) {
      drawSectionHeading("Visualisations", "Graphiques d'activité DnB Reviz");
      const boxGap = 5;
      const boxW = (contentW - boxGap) / 2;
      for (let i = 0; i < captured.length; i += 2) {
        const pair = captured.slice(i, i + 2);
        const boxH = 54;
        ensureSpace(boxH + 6);
        pair.forEach((item, j) => {
          const x = margin + j * (boxW + boxGap);
          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(226, 232, 240);
          doc.roundedRect(x, y, boxW, boxH, 2.5, 2.5, "FD");
          doc.setFont("helvetica", "bold");
          doc.setFontSize(8.5);
          doc.setTextColor(30, 41, 59);
          doc.text(item.title, x + 3.5, y + 6);
          const imgW = boxW - 6;
          const imgH = Math.min(43, imgW * item.img.ratio);
          doc.addImage(item.img.dataUrl, "PNG", x + 3, y + 8.5, imgW, imgH);
        });
        y += boxH + 5;
      }
    }
  }

  // Données personnalisées
  if (incCustom) {
    const customPdfRows = (p.customEntries || []).filter(e => e.includeInPdf !== false);
    if (customPdfRows.length) {
      drawSectionHeading("Ajouts manuels", `Données personnalisées (${customPdfRows.length})`);
      drawStyledPdfTable(
        ["Date", "Indicateur", "Catégorie", "Valeur", "Note"],
        [24, 52, 34, 26, 46],
        customPdfRows.map(e => [
          formatShortFrDate(e.date),
          e.label,
          e.category || "Autre",
          `${e.value}${e.unit ? " " + e.unit : ""}`,
          e.note || "—"
        ])
      );
    }
  }

  // Classement Top Élèves
  if (incRanking) {
    const rankingRows = [...(p.activityLifetime || [])]
      .filter(r => r.role !== "professeur" && r.role !== "admin")
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 20);
    if (rankingRows.length) {
      drawSectionHeading("Assiduité", "Top Élèves — Temps actif cumulé");
      drawStyledPdfTable(
        ["#", "Élève", "Temps total", "Sessions", "Pages", "Quiz", "Quiz IA"],
        [12, 52, 32, 22, 22, 22, 20],
        rankingRows.map((r, i) => [
          `#${i + 1}`,
          `@${r.username || r.id}`,
          formatActivityDuration(r.durationMs),
          r.sessions || 0,
          r.pageViews || 0,
          r.quizCompletes || 0,
          r.aiQuizGenerations || 0
        ])
      );
    }
  }

  // Pages les plus consultées
  if (incPages) {
    const hiddenPages = new Set(["admin", "statistiques"]);
    const counts = new Map();
    (p.events || [])
      .filter(e => e.type === "page_view" && !hiddenPages.has(String(e.page || "").toLowerCase()))
      .forEach(e => { const pg = e.page || "inconnu"; counts.set(pg, (counts.get(pg) || 0) + 1); });
    const topPages = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
    if (topPages.length) {
      drawSectionHeading("Navigation", "Pages les plus consultées");
      drawStyledPdfTable(
        ["Page", "Vues", "Part du trafic"],
        [100, 36, 46],
        (() => {
          const total = topPages.reduce((s, [, n]) => s + n, 0) || 1;
          return topPages.map(([pg, n]) => [pg, n, `${Math.round((n / total) * 100)} %`]);
        })()
      );
    }
  }

  // Détail utilisateurs & sessions
  if (incUsers && (p.users || []).length) {
    drawSectionHeading("Comptes suivis", `Détail utilisateurs & sessions (top ${Math.min(35, p.users.length)})`);
    drawStyledPdfTable(
      ["Utilisateur", "Rôle", "Dernière connexion", "Sess.", "Dernière page", "Zone"],
      [42, 24, 36, 14, 34, 32],
      p.users.slice(0, 35).map(u => [
        `@${u.username || u.id}`,
        u.role || "—",
        formatStatsDate(u.lastLogin),
        u.sessions || 0,
        u.lastPage || "—",
        [u.timezone, u.countryHint].filter(Boolean).join(" · ") || "—"
      ])
    );
  }

  // Pied de page sur chaque page
  const totalPages = doc.getNumberOfPages();
  for (let pg = 1; pg <= totalPages; pg++) {
    doc.setPage(pg);
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, pageH - 13, pageW - margin, pageH - 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("DnB Reviz · Rapport Statistiques Administrateur", margin, pageH - 8);
    doc.text(`Page ${pg} / ${totalPages}`, pageW - margin, pageH - 8, { align: "right" });
  }

  doc.save(`dnb-reviz-statistiques-${new Date().toISOString().slice(0, 10)}.pdf`);
  closeModal("m-stats-pdf-export");
  showToast("Rapport PDF stylisé téléchargé !");
};

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
    'messages', 'depot', 'publier', 'pub-profil', 'profil', 'setting', 'admin', 'statistiques', 'exercices'
  ]);

  if (target === 'matieres') {
    showInternalView('accueil');
    return;
  }

  if (target === 'depot') {
    showInternalView('publier');
    if (typeof window.switchPublishMode === 'function') window.switchPublishMode('post');
    return;
  }

  if (target === 'creerquiz') {
    showInternalView('publier');
    if (typeof window.switchPublishMode === 'function') window.switchPublishMode('quiz');
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
  if (target === 'depot') target = 'publier';
  if (target === 'creerquiz') target = 'publier';
  if (target !== 'pub-profil') {
    window._currentViewedUser = null;
    window._pubFeedKey = null;
    if (window._pubFeedUnsub) { try { window._pubFeedUnsub(); } catch (_) {} window._pubFeedUnsub = null; }
    if (window._pubLikesUnsubPosts) { try { window._pubLikesUnsubPosts(); } catch (_) {} window._pubLikesUnsubPosts = null; }
    if (window._pubLikesUnsubQuizzes) { try { window._pubLikesUnsubQuizzes(); } catch (_) {} window._pubLikesUnsubQuizzes = null; }
    if (window._pubLikesUnsubAIQuizzes) { try { window._pubLikesUnsubAIQuizzes(); } catch (_) {} window._pubLikesUnsubAIQuizzes = null; }
  }
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
  trackActivityPage(target);

  if (target === 'messages') loadDMChats();
  if (target === 'quiz') loadQuizFeed();
  if (target === 'exercices') loadExercicesFeed();
  if (target === 'setting') {
    loadAIQuizHistory();
    loadAnimationsSetting();
    if (typeof renderThemesAndRewardsSettings === "function") renderThemesAndRewardsSettings();
  }
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
  if (target === 'publier') {
    setTimeout(() => {
      initCharCounters();
      if (typeof handlePostTypeChange === 'function') handlePostTypeChange();
      if (typeof updatePublishLivePreview === 'function') updatePublishLivePreview();
    }, 60);
  }
  if (target === 'statistiques') loadStatisticsDashboard();
}

signInAnonymously(auth).then(async () => {
  const s = localStorage.getItem("dnb_reviz_session");
  if (s) {
    const cached = JSON.parse(s);
    hydrateSession(cached, { skipStreakCheck: true });
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

window.getFlameTier = function getFlameTier(streak) {
  const n = Math.max(0, Number(streak) || 0);
  if (n >= 30) {
    return {
      id: "gold",
      label: "Flamme Dorée",
      palette: ["#78350f", "#d97706", "#facc15", "#fef9c3", "#ffffff"],
      particles: 7
    };
  }
  if (n >= 14) {
    return {
      id: "plasma",
      label: "Flamme Plasma",
      palette: ["#4c1d95", "#9333ea", "#d946ef", "#f5d0fe", "#ffffff"],
      particles: 5
    };
  }
  if (n >= 7) {
    return {
      id: "blue",
      label: "Flamme Bleue",
      palette: ["#1e3a8a", "#0284c7", "#38bdf8", "#bae6fd", "#ffffff"],
      particles: 4
    };
  }
  return {
    id: "amber",
    label: "Flamme Ambrée",
    palette: ["#b91c1c", "#ea580c", "#ff8c00", "#fde047", "#fffbeb"],
    particles: 3
  };
};

function renderRealisticFlameSVG(tierId, isPending, isShieldProtected) {
  const wrap = document.getElementById("home-flame-svg-wrap");
  const particlesEl = document.getElementById("home-flame-particles");
  if (!wrap) return;
  const tier = window.getFlameTier(tierId === "gold" ? 30 : tierId === "plasma" ? 14 : tierId === "blue" ? 7 : 0);
  const [cDeep, cOuter, cMid, cCore, cTip] = isShieldProtected
    ? ["#0c4a6e", "#0284c7", "#38bdf8", "#bae6fd", "#f0f9ff"]
    : tier.palette;
  const uid = `flame_${tier.id}`;

  wrap.innerHTML = `
    <svg viewBox="0 0 80 96" aria-hidden="true" style="opacity:${isPending ? "0.86" : "1"}">
      <defs>
        <linearGradient id="${uid}_outer" x1="50%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stop-color="${cDeep}" />
          <stop offset="48%" stop-color="${cOuter}" />
          <stop offset="100%" stop-color="${cMid}" />
        </linearGradient>
        <linearGradient id="${uid}_mid" x1="50%" y1="100%" x2="50%" y2="0%">
          <stop offset="0%" stop-color="${cOuter}" />
          <stop offset="55%" stop-color="${cMid}" />
          <stop offset="100%" stop-color="${cCore}" />
        </linearGradient>
        <radialGradient id="${uid}_core" cx="50%" cy="68%" r="52%">
          <stop offset="0%" stop-color="${cTip}" />
          <stop offset="58%" stop-color="${cCore}" />
          <stop offset="100%" stop-color="${cMid}" stop-opacity="0" />
        </radialGradient>
      </defs>
      <!-- Outer organic silhouette -->
      <path class="flame-outer-tongue"
        d="M40 6 C42 18, 57 26, 62 41 C67 55, 62 77, 48 86 C42 90, 34 90, 27 85 C15 77, 12 58, 19 42 C22 34, 28 29, 28 20 C32 25, 34 29, 36 31 C35 21, 37 12, 40 6 Z"
        fill="url(#${uid}_outer)" />
      <!-- Middle rising tongue -->
      <path class="flame-mid-tongue"
        d="M41 22 C45 33, 55 41, 56 54 C57 68, 49 82, 39 84 C29 84, 23 71, 24 57 C25 46, 33 38, 35 29 C37 32, 38 35, 39 37 C39 31, 40 26, 41 22 Z"
        fill="url(#${uid}_mid)" />
      <!-- Hot luminescent core -->
      <path class="flame-core-tongue"
        d="M40 46 C44 54, 49 60, 48 70 C47 78, 43 82, 39 82 C34 82, 30 77, 31 68 C32 59, 37 53, 40 46 Z"
        fill="url(#${uid}_core)" />
      ${isShieldProtected ? `<ellipse cx="40" cy="86" rx="22" ry="4" fill="none" stroke="#bae6fd" stroke-width="2" stroke-opacity="0.75"/>` : ""}
    </svg>
  `;

  if (particlesEl) {
    const count = tier.particles;
    particlesEl.innerHTML = Array.from({ length: count }, (_, i) => {
      const sx = ((i - (count - 1) / 2) * 8).toFixed(1);
      const ex = (Number(sx) * 1.6 + (i % 2 === 0 ? 5 : -5)).toFixed(1);
      const delay = (i * 0.35).toFixed(2);
      return `<span class="flame-spark" style="--sx:${sx}px;--ex:${ex}px;animation-delay:${delay}s;"></span>`;
    }).join("");
  }
}

window.triggerStreakCelebration = function triggerStreakCelebration() {
  const card = document.getElementById("home-streak-card");
  const burst = document.getElementById("home-streak-celebration");
  if (!card || !burst) return;
  card.classList.remove("streak-celebrating");
  void card.offsetWidth;
  card.classList.add("streak-celebrating");

  const colors = ["#facc15", "#ff7a00", "#38bdf8", "#c026d3", "#34c759"];
  burst.innerHTML = Array.from({ length: 18 }, (_, i) => {
    const tx = Math.round((Math.random() - 0.5) * 240);
    const ty = Math.round(-25 - Math.random() * 80);
    const rot = Math.round((Math.random() - 0.5) * 360);
    const left = 48 + Math.round((Math.random() - 0.5) * 28);
    const color = colors[i % colors.length];
    return `<span class="celebration-confetti" style="left:${left}px;top:45px;background:${color};--tx:${tx}px;--ty:${ty}px;--rot:${rot}deg;animation-delay:${(i * 0.02).toFixed(2)}s;"></span>`;
  }).join("");

  setTimeout(() => {
    card.classList.remove("streak-celebrating");
    burst.innerHTML = "";
  }, 1500);
};

window.getDailyGoalMinutes = () => {
  const saved = Number(localStorage.getItem(`dnb_daily_goal_${currentUser?.username || "guest"}`));
  const fromUser = Number(currentUser?.dailyGoalMinutes);
  return [10, 15, 30, 45, 60].includes(saved) ? saved : ([10, 15, 30, 45, 60].includes(fromUser) ? fromUser : 15);
};

window.setDailyGoalMinutes = async (mins) => {
  const valid = [10, 15, 30, 45, 60].includes(Number(mins)) ? Number(mins) : 15;
  localStorage.setItem(`dnb_daily_goal_${currentUser?.username || "guest"}`, String(valid));
  if (currentUser?.id) {
    currentUser.dailyGoalMinutes = valid;
    saveSessionLocally(currentUser);
    try { await updateDoc(doc(db, "users", currentUser.id), { dailyGoalMinutes: valid }); } catch (_) {}
  }
  document.querySelectorAll("#daily-goal-options .daily-goal-opt").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.mins) === valid);
  });
  updateDailyGoalUI();
  showToast(`🎯 Objectif quotidien fixé à ${valid} min/jour ✓`);
};

window.openDailyGoalModal = () => {
  const currentGoal = window.getDailyGoalMinutes();
  document.querySelectorAll("#daily-goal-options .daily-goal-opt").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.mins) === currentGoal);
  });
  const shields = Math.min(3, Math.max(0, Number(currentUser?.streakShields) || 0));
  const sc = document.getElementById("modal-shield-count");
  if (sc) sc.textContent = `${shields} / 3`;
  openModal("m-daily-goal");
};

window.updateDailyGoalUI = () => {
  if (!currentUser) return;
  const goalMin = window.getDailyGoalMinutes();
  const dailyMs = window.getDailyStudyMs ? window.getDailyStudyMs() : 0;
  const doneMin = Math.floor(dailyMs / 60000);
  const pct = Math.min(100, Math.round((doneMin / goalMin) * 100));
  const textEl = document.getElementById("home-daily-goal-text");
  const fillEl = document.getElementById("home-daily-goal-fill");
  const shieldEl = document.getElementById("home-streak-shield-inline");
  const shields = Math.min(3, Math.max(0, Number(currentUser.streakShields) || 0));
  if (shieldEl) shieldEl.textContent = `🛡️ ${shields}/3`;
  if (textEl) {
    textEl.textContent = doneMin >= goalMin
      ? `Objectif du jour atteint (${doneMin} / ${goalMin} min) ✓`
      : `Objectif du jour : ${doneMin} / ${goalMin} min`;
  }
  if (fillEl) fillEl.style.width = `${pct}%`;
};

window.awardStreakShieldIfEligible = async (source, milestoneValue) => {
  if (!currentUser?.id || isProfessorUser(currentUser)) return false;
  const currentShields = Math.min(3, Math.max(0, Number(currentUser.streakShields) || 0));
  if (currentShields >= 3) return false;

  const key = `${source}:${milestoneValue}`;
  const earnedList = Array.isArray(currentUser.shieldMilestones) ? [...currentUser.shieldMilestones] : [];
  if (earnedList.includes(key)) return false;

  const nextShields = Math.min(3, currentShields + 1);
  earnedList.push(key);
  currentUser.streakShields = nextShields;
  currentUser.shieldMilestones = earnedList.slice(-30);
  saveSessionLocally(currentUser);
  updateDailyGoalUI();
  try {
    await updateDoc(doc(db, "users", currentUser.id), {
      streakShields: nextShields,
      shieldMilestones: currentUser.shieldMilestones
    });
  } catch (_) {}
  showToast(`🛡️ +1 Bouclier de gel de flamme gagné ! (${nextShields}/3)`);
  return true;
};

function getDateStrOffset(daysOffset) {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
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
  const isShieldProtected = !!options.shieldProtected || currentUser.shieldUsedOnDate === getTodayStr();
  const homeStreak = document.getElementById("home-streak-count");
  const tier = window.getFlameTier(Number(streak) || displayStreak);

  currentUser.streak = Number(streak) || 0;

  if (homeStreak) {
    homeStreak.textContent = `${displayStreak} ${displayStreak > 1 ? "jours" : "jour"}`;
  }

  const tierLabelEl = document.getElementById("home-streak-tier-label");
  if (tierLabelEl) {
    tierLabelEl.textContent = isShieldProtected ? `${tier.label} · Protégée` : tier.label;
  }

  const card = document.getElementById("home-streak-card");
  if (card) {
    card.classList.remove("streak-tier-amber", "streak-tier-blue", "streak-tier-plasma", "streak-tier-gold", "streak-tier-frozen");
    card.classList.add(isShieldProtected ? "streak-tier-frozen" : `streak-tier-${tier.id}`);
    card.classList.toggle("streak-pending", isPending);
  }

  renderRealisticFlameSVG(tier.id, isPending, isShieldProtected);
  updateDailyGoalUI();

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
  window.triggerStreakCelebration();

  if (newStreak > 0 && newStreak % 2 === 0) {
    window.awardStreakShieldIfEligible("streak", newStreak);
  }

  scheduleNextStreakDay();
}

function animateStreakExtinguish(lostStreak) {
  const card = document.getElementById("home-streak-card");
  if (!card) return;

  const flame = card.querySelector(".flame-svg-wrap");
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

  // Streak Freeze (Bouclier) when exactly 1 full day was missed (dayGap === 2)
  if (dayGap === 2 && (Number(u.streakShields) || 0) > 0) {
    const remainingShields = Math.max(0, (Number(u.streakShields) || 0) - 1);
    const yesterday = getDateStrOffset(-1);
    try {
      await updateDoc(doc(db, "users", u.id), {
        streakShields: remainingShields,
        lastActiveDate: yesterday,
        shieldUsedOnDate: today
      });
    } catch (_) {}
    currentUser.streakShields = remainingShields;
    currentUser.lastActiveDate = yesterday;
    currentUser.shieldUsedOnDate = today;
    saveSessionLocally(currentUser);
    showToast(`🛡️ Bouclier activé ! Ta série de ${currentStreak} jours a été protégée.`);

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
      shieldProtected: true,
      status: `🛡️ Série sauvée par un bouclier ! Encore ${Math.max(1, Math.ceil((STREAK_CONFIRM_MS - storedWatch.accumulatedMs) / 1000))}s aujourd'hui`
    });
    startStreakMinuteTimer();
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

async function backfillHistoricalStudyTime(u) {
  if (!u?.id || window._historicalBackfillRanFor === u.id) return;
  window._historicalBackfillRanFor = u.id;

  const today = typeof getTodayStr === "function" ? getTodayStr() : new Date().toISOString().slice(0, 10);
  const actMap = new Map();
  const sessMap = new Map();

  const safeQuery = async (colName, field, val, targetMap) => {
    if (!val) return;
    try {
      const snap = await getDocs(query(collection(db, colName), where(field, "==", val)));
      snap.forEach(d => targetMap.set(d.id, d.data()));
    } catch (err) {
      console.debug(`Backfill ${colName} (${field}) ignoré :`, err?.code || err?.message || err);
    }
  };

  await Promise.all([
    safeQuery("analytics_activity", "userId", u.id, actMap),
    safeQuery("analytics_activity", "username", u.username, actMap),
    safeQuery("analytics_sessions", "userId", u.id, sessMap),
    safeQuery("analytics_sessions", "username", u.username, sessMap)
  ]);

  let activityTotalMs = 0;
  let dailyActivityMs = 0;
  actMap.forEach(a => {
    const dur = Math.max(0, Number(a?.durationMs) || 0);
    activityTotalMs += dur;
    const ts = Number(a?.timestamp || 0);
    if (ts && typeof getDateFromTimestamp === "function" && getDateFromTimestamp(ts) === today) {
      dailyActivityMs += dur;
    }
  });

  let sessionsTotalMs = 0;
  let dailySessionsMs = 0;
  sessMap.forEach(s => {
    const start = Number(s?.startedAt || 0);
    const end = Number(s?.endedAt || s?.lastSeenAt || start);
    if (!start || end <= start) return;
    const span = Math.max(0, Math.min(4 * 3600 * 1000, end - start));
    sessionsTotalMs += span;
    if (typeof getDateFromTimestamp === "function" && getDateFromTimestamp(start) === today) {
      dailySessionsMs += span;
    }
  });

  const confirmMs = typeof STREAK_CONFIRM_MS === "number" ? STREAK_CONFIRM_MS : 60000;
  const streakBaselineMs = Math.max(Number(u.maxStreak) || 0, Number(u.streak) || 0) * confirmMs + Math.max(0, Number(u.streakWatchMs) || 0);

  const prevTotal = typeof window.getTotalStudyMs === "function" ? window.getTotalStudyMs() : (Number(u.totalStudyMs) || 0);
  const prevDaily = typeof window.getDailyStudyMs === "function" ? window.getDailyStudyMs() : 0;
  const mergedTotal = Math.max(prevTotal, Number(u.totalStudyMs) || 0, activityTotalMs, sessionsTotalMs, streakBaselineMs);
  const mergedDaily = Math.max(prevDaily, dailyActivityMs, dailySessionsMs);

  if (!window.currentUser || window.currentUser.id !== u.id) return;

  window.currentUser.totalStudyMs = mergedTotal;
  window.currentUser.dailyStudyDate = today;
  window.currentUser.dailyStudyMs = mergedDaily;
  saveLocalStudyStats(u.id, { totalStudyMs: mergedTotal, dailyDate: today, dailyStudyMs: mergedDaily });
  saveSessionLocally(window.currentUser);

  if (mergedTotal > prevTotal && typeof checkNewlyUnlockedThemesAndBadges === "function") {
    checkNewlyUnlockedThemesAndBadges(prevTotal, mergedTotal);
  }
  if (typeof updateDailyGoalUI === "function") updateDailyGoalUI();
  if (typeof renderThemesAndRewardsSettings === "function") renderThemesAndRewardsSettings();

  if (!u.historicalStudySynced || mergedTotal > (Number(u.totalStudyMs) || 0)) {
    try {
      await updateDoc(doc(db, "users", u.id), {
        totalStudyMs: mergedTotal,
        dailyStudyDate: today,
        dailyStudyMs: mergedDaily,
        historicalStudySynced: true
      });
    } catch (err) {
      console.debug("Synchronisation historique non enregistrée :", err?.code || err?.message || err);
    }
  }
}

function hydrateSession(u, options = {}) {
  window.currentUser = u;
  saveSessionLocally(u);
  updateRichTextToolbarVisibility();
  initGoogleAnalytics();
  startAnalyticsSession(u);

  document.getElementById("view-login").style.display = "none";
  document.getElementById("view-app").style.display = "block";
  const streakCard = document.getElementById("home-streak-card");
  if (streakCard) streakCard.style.display = isProfessorUser(u) ? "none" : "";
  if (!options.skipStreakCheck) checkStreak(u).catch(error => console.error("Erreur du système de série :", error));
  window.applyMaintenanceUI();
  loadTheme();
  if (u?.id) {
    const localStats = getLocalStudyStats(u.id);
    const today = typeof getTodayStr === "function" ? getTodayStr() : new Date().toISOString().slice(0, 10);
    const mergedTotal = Math.max(Number(u.totalStudyMs) || 0, localStats.totalStudyMs);
    const remoteDaily = u.dailyStudyDate === today ? (Number(u.dailyStudyMs) || 0) : 0;
    const mergedDaily = Math.max(remoteDaily, localStats.dailyStudyMs);
    u.totalStudyMs = mergedTotal;
    u.dailyStudyDate = today;
    u.dailyStudyMs = mergedDaily;
    saveLocalStudyStats(u.id, { totalStudyMs: mergedTotal, dailyDate: today, dailyStudyMs: mergedDaily });
  }
  if (typeof updateDailyGoalUI === "function") updateDailyGoalUI();
  if (typeof renderThemesAndRewardsSettings === "function") renderThemesAndRewardsSettings();
  if (u?.id && !options.skipStreakCheck) {
    backfillHistoricalStudyTime(u).catch(() => {});
  }

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
  if (document.getElementById("setting-email")) {
    document.getElementById("setting-email").value = u.email || "";
  }

  const canDepot = u.role === "professeur" || u.role === "admin" || u.role === "HS" || (u.subRoles && (u.subRoles.includes("volontaire") || u.subRoles.includes("admin")));

  document.getElementById("tab-admin")?.classList.toggle("hidden", !isAdmin);
  document.getElementById("tab-statistiques")?.classList.toggle("hidden", !isAdmin);
  document.getElementById("tab-publier")?.classList.toggle("hidden", !canDepot);
  document.getElementById("tab-depot")?.classList.toggle("hidden", !canDepot);
  document.getElementById("tab-creer-quiz")?.classList.toggle("hidden", !canDepot);
  
  document.querySelectorAll(".admin-only").forEach(el => el.classList.toggle("hidden", !isAdmin));
  const postTypeSel = document.getElementById("post-type");
  if (postTypeSel && !isAdmin && postTypeSel.value === "annonce") {
    postTypeSel.value = "cours";
  }

  const drawerPublier = document.getElementById("drawer-publier");
  const drawerDepot = document.getElementById("drawer-depot");
  const drawerAdmin = document.getElementById("drawer-admin");
  const drawerStats = document.getElementById("drawer-statistiques");
  const drawerCreerQuiz = document.getElementById("drawer-creer-quiz");
  
  if (drawerPublier) drawerPublier.classList.toggle("hidden", !canDepot);
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
  if (typeof window.refreshCookieClickerLinks === "function") window.refreshCookieClickerLinks();
  
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
  showToast("Mot de passe mis à jour ✓");

  // Le pré-prompt maison apparaît uniquement après la définition du mot de passe définitif.
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
  window.usersMap.set(currentUser.username, { ...currentUser });
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
  if (!currentUser?.username) return;
  const q1 = query(collection(db, "posts"), where("authorId", "==", currentUser.username));
  const q2 = query(collection(db, "quizzes"), where("authorId", "==", currentUser.username));
  const q3 = query(collection(db, "ai_quizzes"), where("authorId", "==", currentUser.username));
  const q4 = query(collection(db, "ai_exercices"), where("authorId", "==", currentUser.username));
  
  const [snap1, snap2, snap3, snap4] = await Promise.all([
    getDocs(q1), getDocs(q2), getDocs(q3), getDocs(q4).catch(() => ({ size: 0 }))
  ]);
  
  const el = document.getElementById("contrib-count"); 
  if (el) el.innerText = snap1.size + snap2.size + snap3.size + (snap4?.size || 0);
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

window.syncExerciseSubjectSelects = function syncExerciseSubjectSelects() {
  const entries = Array.from(window.subjectsMap.entries()).sort((a, b) => a[0].localeCompare(b[0], "fr"));
  const selExCreate = document.getElementById("ex-create-subject");
  if (selExCreate) {
    const prev = selExCreate.value;
    let html = entries.map(([name, icon]) => `<option value="${esc(name)}">${icon || "📚"} ${esc(name)}</option>`).join("");
    html += `<option value="autre">✏️ Autre (matière personnalisée)...</option>`;
    selExCreate.innerHTML = html;
    if (prev && (window.subjectsMap.has(prev) || prev === "autre")) {
      selExCreate.value = prev;
    } else if (entries.length > 0) {
      selExCreate.value = entries[0][0];
    } else {
      selExCreate.value = "autre";
    }
    if (typeof window.handleExerciceSubjectChange === "function") {
      window.handleExerciceSubjectChange({ target: selExCreate });
    }
  }
  const selExFilter = document.getElementById("ex-filter-modal-subject");
  if (selExFilter) {
    const prevF = selExFilter.value;
    let htmlF = `<option value="all">Toutes les matières</option>`;
    htmlF += entries.map(([name, icon]) => `<option value="${esc(name)}">${icon || "📚"} ${esc(name)}</option>`).join("");
    htmlF += `<option value="autre">Autre</option>`;
    selExFilter.innerHTML = htmlF;
    if (prevF && Array.from(selExFilter.options).some(o => o.value === prevF)) {
      selExFilter.value = prevF;
    }
  }
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
    window.syncExerciseSubjectSelects();
    if (typeof window.handlePostTypeChange === "function") window.handlePostTypeChange();
    if (typeof window.updatePublishLivePreview === "function") window.updatePublishLivePreview();
  });
}
function sanitizeRichText(html) {
  const parser = new DOMParser();
  const source = parser.parseFromString(String(html || ""), "text/html");
  const allowed = new Set(["STRONG", "B", "EM", "I", "U", "S", "STRIKE", "UL", "OL", "LI", "P", "DIV", "SPAN", "FONT", "BR"]);
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
      const spanBg = tag === "SPAN" ? normalizeColor(child.style?.backgroundColor) : "";
      const fontColor = tag === "FONT" ? normalizeColor(child.getAttribute("color")) : "";

      Array.from(child.attributes).forEach(attr => child.removeAttribute(attr.name));
      if (tag === "SPAN") {
        if (spanColor) child.style.color = spanColor;
        if (spanBg && spanBg !== "transparent") {
          child.style.backgroundColor = spanBg;
          child.style.borderRadius = "4px";
          child.style.padding = "0 3px";
        }
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

function limitRichText(editor, maxLength = 1200) {
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
  limitRichText(editor, 1200);
  const cleaned = sanitizeRichText(editor.innerHTML);
  if (cleaned !== editor.innerHTML) editor.innerHTML = cleaned;
  hidden.value = cleaned;
  if (counter) counter.textContent = richTextPlainLength(editor);
  if (typeof window.updatePublishLivePreview === "function") window.updatePublishLivePreview();
}

function updateRichTextToolbarVisibility() {
  const toolbar = document.getElementById("post-desc-toolbar");
  if (!toolbar) return;
  const canPublish = !currentUser || currentUser.role === "professeur" || currentUser.role === "admin" || currentUser.role === "HS" || (currentUser.subRoles && (currentUser.subRoles.includes("volontaire") || currentUser.subRoles.includes("admin")));
  toolbar.classList.toggle("hidden", !canPublish);
}

window.applyRichTextCommand = (command, value = null) => {
  const editor = document.getElementById("post-desc-editor");
  if (!editor) return;
  editor.focus();
  document.execCommand(command, false, value);
  syncRichTextDescription();
};

window.toggleRichTextColorMenu = (which = "text") => {
  const textPalette = document.getElementById("post-desc-color-palette");
  const hilitePalette = document.getElementById("post-desc-hilite-palette");
  if (which === "hilite") {
    if (textPalette) textPalette.classList.add("hidden");
    if (hilitePalette) hilitePalette.classList.toggle("hidden");
  } else {
    if (hilitePalette) hilitePalette.classList.add("hidden");
    if (textPalette) textPalette.classList.toggle("hidden");
  }
};

window.applyRichTextColor = color => {
  window.applyRichTextCommand("foreColor", color);
  const palette = document.getElementById("post-desc-color-palette");
  if (palette) palette.classList.add("hidden");
};

window.applyRichTextHighlight = color => {
  const editor = document.getElementById("post-desc-editor");
  if (editor) {
    editor.focus();
    const ok = document.execCommand("hiliteColor", false, color);
    if (!ok) document.execCommand("backColor", false, color);
    syncRichTextDescription();
  }
  const palette = document.getElementById("post-desc-hilite-palette");
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
    const nonImageExt = /\.(xlsx?|csv|docx?|pptx?|odt|ods|odp|pdf|zip|rar|7z|tar|gz|txt|json|py|js|html|css|mp4|webm|mp3|wav|ogg)(\?.*)?$/i;
    const isExplicitNonImg = nonImageExt.test(lowerU) || nonImageExt.test((f.name || "").toLowerCase());
    const isPDF = t === "application/pdf" || lowerU.endsWith(".pdf") || (f.name || "").toLowerCase().endsWith(".pdf");
    const isVideo = !isPDF && (t === "video/mp4" || lowerU.endsWith(".mp4"));
    const isImg = !isPDF && !isVideo && !isExplicitNonImg && (
      t.startsWith("image/") ||
      Boolean(lowerU.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp|ico|avif)(\?.*)?$/i)) ||
      (lowerU.includes("res.cloudinary.com") && !lowerU.includes("/raw/") && !lowerU.includes("/files/") && Boolean(lowerU.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp|ico|avif)(\?.*)?$/i)))
    );
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
    fileChips = `<div class="post-files-stack">` + docs.map(d => {
      const cleanName = d.name || p.title || "Document";
      const lower = ((d.url || "") + " " + cleanName).toLowerCase();
      const isPDF = d.type === "application/pdf" || lower.includes(".pdf");
      const isExcel = lower.includes(".xlsx") || lower.includes(".xls") || lower.includes(".csv") || (d.type || "").includes("spreadsheet") || (d.type || "").includes("excel");
      const isWord = lower.includes(".docx") || lower.includes(".doc") || lower.includes(".odt");
      const isZip = lower.includes(".zip") || lower.includes(".rar") || lower.includes(".7z");
      let icon = "🔗";
      let subNote = "";
      if (isExcel) { icon = "📊"; subNote = "Fichier Excel (sans aperçu)"; }
      else if (isPDF) { icon = "📄"; subNote = "Document PDF"; }
      else if (isWord) icon = "📝";
      else if (isZip) icon = "📦";
      return `
      <div class="file-chip ${isExcel ? 'file-chip-excel' : ''}">
        <div class="file-chip-info" title="${esc(cleanName)}">
          <span style="font-size:22px">${icon}</span>
          <div style="min-width:0; display:flex; flex-direction:column;">
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHTML(cleanName)}</span>
            ${subNote ? `<small class="caption" style="font-size:11px;">${subNote}</small>` : ""}
          </div>
        </div>
        <a href="${d.url}" target="_blank" rel="noopener" class="btn-download">📥 Consulter</a>
      </div>`;
    }).join("") + `</div>`;
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
  const safeDesc = p.description ? sanitizeRichText(p.description) : "";
  const plainDesc = safeDesc ? safeDesc.replace(/<[^>]+>/g, " ").trim() : "";
  const needsExpand = plainDesc.length > 170 || (safeDesc.match(/<br|<li|<p/gi) || []).length > 3;

  return `
    <div class="post-card">
      <div style="display:flex;flex-direction:column;gap:12px;flex:1">
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
          <div class="post-title">${p.title.length > 60 ? p.title.substring(0, 57) + '...' : p.title}</div>
          ${safeDesc ? `<div class="post-desc">${safeDesc}</div>` : ""}
          ${needsExpand ? `<button type="button" class="btn-show-more" onclick="togglePostExpand(this)">Lire la suite</button>` : ""}
        </div>
        ${mediaBox}
        ${fileChips}
      </div>
      <div class="post-card-footer">
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

window.togglePostExpand = (btn) => {
  const desc = btn?.previousElementSibling;
  if (!desc) return;
  const expanded = desc.classList.toggle("expanded");
  btn.textContent = expanded ? "Réduire" : "Lire la suite";
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
      <div style="flex:1">
        <div class="post-title">${q.title}</div>
        ${q.description ? `<p class="post-desc">${q.description}</p>` : ""}
        <div class="caption mt-1">${(q.questions || []).length} questions • Créé le ${dateStr} • <strong>Fait par ${q.attemptsCount || 0} personne(s)</strong></div>
      </div>
      <div class="post-card-footer">
        <div class="post-actions" style="border-top: 1px solid var(--hl); padding-top: 12px;">
          <button class="like-btn ${hasLiked ? 'liked' : ''}" onclick="toggleQuizLike('${qId}', ${q.isAI})">
            ${hasLiked ? '❤️' : '🤍'} ${likeCount}
          </button>
          <button class="like-btn" onclick="openShareModal('${qId}', '${q.isAI ? 'ai_quiz' : 'quiz'}', '${esc(q.title)}')">↗️ Partager</button>
        </div>
        <button class="btn-pill" style="justify-content:center; width:100%;" onclick="checkAndStartQuiz('${qId}', ${q.isAI})">Commencer le quiz</button>
      </div>
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

window._uploadedFileMeta = [];

function revokeUploadedFilePreviews() {
  (window._uploadedFileMeta || []).forEach(m => {
    if (m?.previewUrl) {
      try { URL.revokeObjectURL(m.previewUrl); } catch (_) {}
    }
  });
  window._uploadedFileMeta = [];
}

function renderPublishFilePreviews() {
  const files = window._uploadedFiles || [];
  const bar = document.getElementById("file-prev");
  const listDiv = document.getElementById("file-prev-list");
  if (!bar) return;

  if (!files.length) {
    bar.style.display = "none";
    if (listDiv) listDiv.innerHTML = "";
    return;
  }

  bar.style.display = "flex";
  const countEl = document.getElementById("file-prev-name");
  if (countEl) countEl.innerText = `${files.length} fichier(s) prêt(s)`;
  const iconEl = document.getElementById("file-prev-icon");
  if (iconEl) iconEl.innerText = "📁";

  revokeUploadedFilePreviews();
  window._uploadedFileMeta = files.map((f, idx) => {
    const lower = (f.name || "").toLowerCase();
    const isImage = (f.type || "").startsWith("image/") || /\.(jpg|jpeg|png|gif|webp|avif)$/i.test(lower);
    const isExcel = /\.(xlsx|xls|csv)$/i.test(lower) || (f.type || "").includes("spreadsheet") || (f.type || "").includes("excel");
    const isPDF = f.type === "application/pdf" || lower.endsWith(".pdf");
    const isVideo = (f.type || "").startsWith("video/") || /\.(mp4|webm)$/i.test(lower);
    const previewUrl = isImage ? URL.createObjectURL(f) : "";
    return { idx, name: f.name, size: f.size, isImage, isExcel, isPDF, isVideo, previewUrl };
  });

  if (listDiv) {
    listDiv.innerHTML = window._uploadedFileMeta.map((m, idx) => {
      let body = "";
      if (m.isImage && m.previewUrl) {
        body = `<img class="publish-file-thumb" src="${m.previewUrl}" alt="${esc(m.name)}">`;
      } else if (m.isExcel) {
        body = `<div class="publish-file-noprev"><span class="pf-ico">📊</span><span>Excel · Sans aperçu</span></div>`;
      } else if (m.isPDF) {
        body = `<div class="publish-file-noprev"><span class="pf-ico">📄</span><span>Document PDF</span></div>`;
      } else if (m.isVideo) {
        body = `<div class="publish-file-noprev"><span class="pf-ico">🎥</span><span>Vidéo (${(m.size / 1024 / 1024).toFixed(1)} Mo)</span></div>`;
      } else {
        body = `<div class="publish-file-noprev"><span class="pf-ico">📎</span><span>${(m.size / 1024 / 1024).toFixed(2)} Mo</span></div>`;
      }
      return `
        <div class="publish-file-preview-card">
          ${body}
          <div class="publish-file-meta" title="${esc(m.name)}">${escapeHTML(m.name)}</div>
          <button type="button" class="publish-file-del" onclick="removeSingleUploadedFile(${idx})" title="Retirer">✕</button>
        </div>`;
    }).join("");
  }
}

window.removeSingleUploadedFile = (idx) => {
  const next = (window._uploadedFiles || []).filter((_, i) => i !== idx);
  window._uploadedFiles = next;
  const inp = document.getElementById("post-file");
  if (inp && next.length === 0) inp.value = "";
  renderPublishFilePreviews();
  updatePublishLivePreview();
};

window.handleFileSelect = (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  if (files.length > 5) {
    showToast("Maximum 5 fichiers autorisés par document.");
    e.target.value = "";
    window._uploadedFiles = [];
    renderPublishFilePreviews();
    updatePublishLivePreview();
    return;
  }

  let totalSize = 0;
  files.forEach(f => totalSize += f.size);
  if (totalSize > 25 * 1024 * 1024) {
    e.target.value = "";
    window._uploadedFiles = [];
    renderPublishFilePreviews();
    updatePublishLivePreview();
    openModal("m-filesize");
    return;
  }

  window._uploadedFiles = files;
  renderPublishFilePreviews();
  updatePublishLivePreview();
};

window.clearFile = () => {
  revokeUploadedFilePreviews();
  window._uploadedFiles = [];
  const inp = document.getElementById("post-file");
  if (inp) inp.value = "";
  renderPublishFilePreviews();
  updatePublishLivePreview();
};

window.switchPublishMode = (mode = "post") => {
  const postPane = document.getElementById("publish-mode-post");
  const quizPane = document.getElementById("publish-mode-quiz");
  const btnPost = document.getElementById("pub-mode-btn-post");
  const btnQuiz = document.getElementById("pub-mode-btn-quiz");
  const isQuiz = mode === "quiz";
  if (postPane) postPane.classList.toggle("hidden", isQuiz);
  if (quizPane) quizPane.classList.toggle("hidden", !isQuiz);
  if (btnPost) {
    btnPost.classList.toggle("active", !isQuiz);
    btnPost.setAttribute("aria-selected", String(!isQuiz));
  }
  if (btnQuiz) {
    btnQuiz.classList.toggle("active", isQuiz);
    btnQuiz.setAttribute("aria-selected", String(isQuiz));
  }
  if (isQuiz) {
    const qc = document.getElementById("quiz-questions-container");
    if (qc && qc.children.length === 0 && typeof window.addQuizQuestionField === "function") {
      window.addQuizQuestionField();
    }
  } else {
    updatePublishLivePreview();
  }
};

window.handlePublishYouTubeInput = () => {
  const inp = document.getElementById("post-youtube-url");
  const prev = document.getElementById("post-youtube-preview");
  if (!inp || !prev) return;
  const embed = getYouTubeEmbedUrl(inp.value.trim());
  if (embed) {
    prev.innerHTML = `<iframe src="${esc(embed)}" title="Aperçu YouTube" allowfullscreen allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"></iframe>`;
    prev.classList.remove("hidden");
  } else {
    prev.innerHTML = "";
    prev.classList.add("hidden");
  }
  updatePublishLivePreview();
};

window.handlePostTypeChange = () => {
  const typeEl = document.getElementById("post-type");
  if (!typeEl) return;
  const type = typeEl.value;
  const matiereGroup = document.getElementById("group-post-matiere");
  const tagsGroup = document.getElementById("group-post-tags");
  const visibilityGroup = document.getElementById("group-post-announcement-visibility");
  if (type === "annonce") {
    if (matiereGroup) matiereGroup.style.display = "none";
    if (tagsGroup) tagsGroup.style.display = "none";
    if (visibilityGroup) {
      visibilityGroup.classList.remove("hidden");
      visibilityGroup.style.display = "flex";
    }
  } else {
    if (matiereGroup) matiereGroup.style.display = "flex";
    if (tagsGroup) tagsGroup.style.display = type === "cours" ? "flex" : "none";
    if (visibilityGroup) visibilityGroup.style.display = "none";
  }
  updatePublishLivePreview();
};

window.updatePublishLivePreview = () => {
  const box = document.getElementById("publish-live-preview-card");
  if (!box) return;
  const title = document.getElementById("post-title")?.value.trim() || "Titre du contenu…";
  const type = document.getElementById("post-type")?.value || "cours";
  const matiere = type === "annonce" ? "Annonces" : (document.getElementById("post-matiere")?.value || "Matière");
  const subjIcon = type === "annonce" ? "📌" : (window.subjectsMap.get(matiere) || "📚");
  const typeLabels = { cours: "Cours", fiches: "Fiche", revisions: "Révisions", annonce: "Annonce Épinglée" };
  const rawDesc = document.getElementById("post-desc")?.value || "";
  const safeDesc = sanitizeRichText(rawDesc);
  const tags = type === "cours" ? getSelectedTags('input[name="post-tag"]') : [];
  const ytUrl = document.getElementById("post-youtube-url")?.value.trim() || "";
  const urlInp = document.getElementById("post-url")?.value.trim() || "";
  const ytEmbed = getYouTubeEmbedUrl(ytUrl) || getYouTubeEmbedUrl(urlInp);

  const authorName = currentUser?.displayName || currentUser?.username || "Auteur";
  const authorRole = currentUser?.role || "élève";
  const roleClass = authorRole === "professeur" ? "professeur" : authorRole === "admin" ? "admin" : authorRole === "HS" ? "hs" : "eleve";
  const init = authorName.split(" ").map(x => x[0]).join("").substring(0, 2).toUpperCase();
  const av = currentUser?.avatar ? `<img src="${esc(currentUser.avatar)}" alt="">` : init;

  const metaFiles = window._uploadedFileMeta || [];
  const firstImg = metaFiles.find(m => m.isImage && m.previewUrl);
  let mediaPreviewHtml = "";
  if (ytEmbed) {
    mediaPreviewHtml = `<div class="post-carousel post-carousel-single" style="height:175px;"><iframe class="carousel-media-content carousel-youtube" src="${esc(ytEmbed)}" title="YouTube" frameborder="0" allowfullscreen></iframe></div>`;
  } else if (firstImg) {
    mediaPreviewHtml = `<div class="post-carousel post-carousel-single" style="height:175px;"><img class="carousel-media-content" src="${firstImg.previewUrl}" alt="Aperçu"></div>`;
  }

  const chips = metaFiles
    .filter(m => !m.isImage)
    .map(m => {
      const ico = m.isExcel ? "📊" : m.isPDF ? "📄" : "📎";
      return `<div class="file-chip ${m.isExcel ? "file-chip-excel" : ""}"><div class="file-chip-info"><span>${ico}</span><span>${escapeHTML(m.name)}${m.isExcel ? " (sans aperçu)" : ""}</span></div></div>`;
    }).join("");

  box.innerHTML = `
    <div class="post-card" style="height:auto;">
      <div class="post-header">
        <div class="post-av">${av}</div>
        <div style="flex:1;min-width:0">
          <div class="post-author-name">${escapeHTML(authorName)}</div>
          <div class="post-meta">
            <span class="rbadge ${roleClass}">${escapeHTML(authorRole)}</span>
            <span class="type-tag ${type}">${typeLabels[type] || type}</span>
            <span class="subj-tag">${subjIcon} ${escapeHTML(matiere)}</span>
            ${renderContentTags(tags)}
          </div>
        </div>
      </div>
      <div class="post-title">${escapeHTML(title)}</div>
      ${safeDesc ? `<div class="post-desc expanded" style="max-height:140px;overflow-y:auto;">${safeDesc}</div>` : `<div class="caption">Ta description colorée apparaîtra ici.</div>`}
      ${mediaPreviewHtml}
      ${chips ? `<div class="post-files-stack">${chips}</div>` : ""}
    </div>`;
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
  const ytInput = document.getElementById("post-youtube-url")?.value.trim() || "";
  const urlInput = document.getElementById("post-url")?.value.trim() || "";
  
  if (!title) {
    showToast("Titre requis.");
    return;
  }

  let filesArray = [];
  const hasFiles = window._uploadedFiles && window._uploadedFiles.length > 0;
  if (hasFiles || ytInput || urlInput) {
    const btn = document.getElementById("btn-submit-publish-post") || document.querySelector('[onclick="handleCreatePost()"]');
    if (btn) { btn.disabled = true; btn.innerText = "Upload des fichiers en cours…"; }
    
    try {
      const ytCandidate = ytInput || (urlInput && getYouTubeEmbedUrl(urlInput) ? urlInput : "");
      if (ytCandidate && getYouTubeEmbedUrl(ytCandidate)) {
        filesArray.push({ url: ytCandidate, name: "YouTube", type: "video/youtube" });
      }
      for (const file of (window._uploadedFiles || [])) {
        const fileUrl = await uploadToCloudinary(file);
        filesArray.push({
          url: fileUrl,
          name: file.name,
          type: file.type
        });
      }
      if (urlInput && !getYouTubeEmbedUrl(urlInput)) {
        filesArray.push({ url: urlInput, name: "Lien externe", type: "link" });
      }
    } catch (err) {
      showToast("Erreur lors de l'upload Cloudinary."); 
      if (btn) { btn.disabled = false; btn.innerText = "Publier avec la classe"; } 
      return;
    }
    
    if (btn) { btn.disabled = false; btn.innerText = "Publier avec la classe"; }
  }

  const firstFile = filesArray[0] || {};
  const post = {
    title, matiere, type, description: desc, tags,
    files: filesArray,
    fileData: firstFile.url || "",
    fileName: firstFile.name || "",
    fileType: firstFile.type || "",
    url: firstFile.url || ytInput || urlInput || "",
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
    trackActivityEvent("post_create");
    
    document.getElementById("post-title").value = ""; 
    document.getElementById("post-desc").value = "";
    const postDescEditor = document.getElementById("post-desc-editor");
    if (postDescEditor) postDescEditor.innerHTML = "";
    syncRichTextDescription(); 
    if (document.getElementById("post-youtube-url")) document.getElementById("post-youtube-url").value = "";
    const ytPrev = document.getElementById("post-youtube-preview");
    if (ytPrev) { ytPrev.innerHTML = ""; ytPrev.classList.add("hidden"); }
    if (document.getElementById("post-url")) document.getElementById("post-url").value = "";
    const announcementVisibilityEl = document.getElementById("post-announcement-visibility");
    if (announcementVisibilityEl) announcementVisibilityEl.value = "tous";
    document.querySelectorAll('input[name="post-tag"]').forEach(el => el.checked = false);
    clearFile(); 
    syncContrib(); 
    showToast("Contenu publié avec la classe ✓");
    
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
    trackActivityEvent("like");
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
    trackActivityEvent("like");
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
  } else if (type === 'ai_exercice') {
    if (typeof window.startSharedExercice === 'function') window.startSharedExercice(id, false);
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

window.renderPublicProfile = (uname, opts = {}) => {
  const silent = Boolean(opts?.silent);
  const pubPage = document.getElementById("page-pub-profil");
  if (!silent) {
    document.querySelectorAll(".page-view").forEach(p => p.classList.remove("active"));
    document.querySelectorAll(".nav-tab").forEach(b => b.classList.remove("active"));
    if (pubPage) {
      pubPage.classList.remove("active");
      void pubPage.offsetWidth;
      pubPage.classList.add("active");
    }
  } else if (!pubPage?.classList.contains("active")) {
    return;
  }

  const loading = document.getElementById("pub-loading-overlay");
  const wrapper = document.getElementById("pub-content-wrapper");
  if (!silent) {
    loading.style.display = "flex";
    wrapper.style.display = "none";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  setTimeout(async () => {
    if (!document.getElementById("page-pub-profil")?.classList.contains("active")) return;
    let targetUser = window.usersMap.get(uname);
    if (!targetUser && uname) {
      const lower = String(uname).toLowerCase();
      for (const u of window.usersMap.values()) {
        if (String(u.username || "").toLowerCase() === lower) {
          targetUser = u;
          break;
        }
      }
    }
    if (!targetUser && uname) {
      try {
        const snap = await getDocs(query(collection(db, "users"), where("username", "==", uname)));
        if (!snap.empty) {
          const d = snap.docs[0];
          targetUser = { id: d.id, ...d.data() };
          window.usersMap.set(targetUser.username, targetUser);
        }
      } catch (_) {}
    }
    if (!document.getElementById("page-pub-profil")?.classList.contains("active")) return;
    if (!targetUser) { 
      loading.style.display = "none"; 
      showToast("Membre introuvable"); 
      window.location.hash = "#accueil"; 
      return; 
    }

    loading.style.display = "none";
    wrapper.style.display = "block";

    window._currentViewedUser = targetUser;

    const bannerEl = document.getElementById("pub-banner");
    if (bannerEl) {
      const rawBanner = (targetUser.banner || "").trim();
      if (rawBanner) {
        const safeUrl = rawBanner.replace(/"/g, '\\"');
        bannerEl.style.backgroundImage = `url("${safeUrl}")`;
        bannerEl.classList.add("has-banner");
      } else {
        bannerEl.style.backgroundImage = "";
        bannerEl.classList.remove("has-banner");
      }
    }

    const imgEl = document.getElementById("pub-av-img"), initEl = document.getElementById("pub-av-init");
    if (targetUser.avatar) {
      if (imgEl.getAttribute("src") !== targetUser.avatar) imgEl.src = targetUser.avatar; 
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

    const feedKey = `${targetUser.username}::${window._pubTabActive}::${window._pubSubjFilter}`;
    if (silent && window._pubFeedKey === feedKey && (window._pubFeedUnsub || window._pubTabActive === 'likes')) {
      return;
    }
    window._pubFeedKey = feedKey;

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
         const nonImg = /\.(xlsx?|csv|docx?|pptx?|odt|ods|odp|pdf|zip|rar|7z|tar|gz|txt|json|py|js|html|css)(\?.*)?$/i;
         const isImage = !nonImg.test(m.fileUrl) && (
           Boolean(m.fileUrl.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp|ico|avif)(\?.*)?$/i)) ||
           (m.fileUrl.includes("res.cloudinary.com/") && !m.fileUrl.includes("/raw/") && !m.fileUrl.includes("/files/") && Boolean(m.fileUrl.match(/\.(jpeg|jpg|gif|png|webp|svg|bmp|ico|avif)(\?.*)?$/i)))
         );
         if (isImage) {
           attachHtml = `<div style="margin-bottom:6px;"><a href="${m.fileUrl}" target="_blank"><img src="${m.fileUrl}" style="max-width:100%;border-radius:8px;max-height:200px;object-fit:cover;"></a></div>`;
         } else {
           let icon = "📄";
           if (m.fileUrl.match(/\.(xlsx?|csv)/i)) icon = "📊";
           else if (m.fileUrl.match(/\.(docx?|odt)/i)) icon = "📝";
           else if (m.fileUrl.match(/\.(zip|rar|7z)/i)) icon = "📦";
           attachHtml = `<div style="margin-bottom:6px;"><a href="${m.fileUrl}" target="_blank" style="color:inherit;text-decoration:underline;">${icon} Pièce jointe</a></div>`;
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

function parseGroqJSON(content) {
  if (content && typeof content === "object" && !Array.isArray(content)) return content;
  const raw = String(content || "").trim();
  const withoutFences = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  try {
    return JSON.parse(withoutFences);
  } catch (_) {
    const start = withoutFences.indexOf("{");
    const end = withoutFences.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(withoutFences.slice(start, end + 1));
    }
    throw new Error("La réponse de l'IA ne contient pas de JSON valide.");
  }
}

async function callGroqAPI(systemPrompt, userPrompt, options = {}) {
  const payload = {
    model: options.model || GROQ_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    temperature: options.temperature ?? 0.35,
    max_completion_tokens: options.maxCompletionTokens || 8192,
    response_format: { type: "json_object" }
  };

  try {
    // Ne pas journaliser le contenu des copies ni les images des élèves.
    console.info("📤 Requête IA via le relais Groq :", {
      endpoint: GROQ_API_URL,
      model: payload.model,
      messageCount: payload.messages.length,
      maxCompletionTokens: payload.max_completion_tokens
    });

    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      mode: "cors",
      cache: "no-store",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload),
    });

    // Lire d'abord le corps en texte permet d'identifier proprement une page
    // HTML (Worker absent, mauvaise URL, page 404) au lieu d'afficher un
    // SyntaxError JSON cryptique commençant par "<html>".
    const responseText = await response.text();
    const contentType = response.headers.get("content-type") || "";
    let data = null;

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch (_) {
      const looksLikeHtml = /(?:text\/html|application\/xhtml\+xml)/i.test(contentType) || /^\s*<(?:!doctype\s+html|html|head|body)\b/i.test(responseText);
      if (looksLikeHtml) {
        if (response.status === 404) {
          throw new Error(`Le relais IA Groq est introuvable (HTTP 404). Le Worker Cloudflare n'est probablement pas déployé à l'adresse ${GROQ_API_URL}. Déploie le fichier cloudflare-groqrelay-onesignal.js avec la configuration wrangler.toml fournie, puis actualise le site.`);
        }
        throw new Error(`Le relais IA a renvoyé une page HTML au lieu de JSON (HTTP ${response.status}, ${contentType || "type inconnu"}). L'adresse ${GROQ_API_URL} ne répond pas comme un Worker Groq. Vérifie le déploiement Cloudflare et la version publiée du Worker.`);
      }
      throw new Error(`Réponse invalide du relais IA (HTTP ${response.status}, ${contentType || "type inconnu"}). Le serveur n'a pas renvoyé de JSON valide.`);
    }

    if (!response.ok) {
      if (response.status === 405) {
        throw new Error("Le relais Cloudflare a refusé la requête POST (HTTP 405). Vérifie que le Worker groqrelay est bien déployé avec cloudflare-groqrelay-onesignal.js et que GROQ_API_URL pointe vers son URL workers.dev.");
      }
      const message = data?.error?.message || data?.error || data?.message || `Erreur HTTP ${response.status}`;
      throw new Error(typeof message === "string" ? message : JSON.stringify(message));
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      const detail = data?.error?.message || data?.message;
      throw new Error(detail ? String(detail) : "Le relais IA répond correctement, mais le service Groq n'a renvoyé aucun contenu. Vérifie la clé GROQ_API_KEY et le modèle configuré dans Cloudflare.");
    }
    return parseGroqJSON(content);
  } catch (e) {
    console.error("❌ Erreur callGroqAPI :", e);
    if (e instanceof TypeError && /fetch|network|failed/i.test(e.message)) {
      throw new Error("Impossible de joindre le relais IA Groq. Vérifie que le Worker Cloudflare est déployé et que son adresse correspond à GROQ_API_URL.");
    }
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
    trackActivityEvent("ai_quiz_generated");
    
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
  trackActivityEvent("quiz_start");
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
  trackActivityEvent("quiz_complete");

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

/* ========================================================
   MODULE EXERCICES IA & CORRECTION PROFESSEUR SPÉCIALISÉ
   ======================================================== */

window._exUploadedPDFs = [];
window._exPaperPhotos = [];
window._exDuration = 60;
window._exTimerActive = true;
window._exTimerInterval = null;
window._exRemainingSeconds = 0;
window._exTotalSeconds = 0;
window._exTimerPaused = false;
window._exMode = "clavier";
window._exFormat = "mix";
window._exGradingTone = "bac";
window._currentExercice = null;
window._currentExerciceAnswers = [];
window._currentStructuredAnswers = {};
window._matchingSelection = { qid: null, leftId: null };
window._svgZoomLevels = {};
window._currentSelfEval = { confidenceStars: 4, estimatedScore: 14, reflections: "" };
window._exerciceFilterTab = "all";
window._exerciceSubjectFilter = "all";
window._exerciceSortOrder = "newest";

const MATCH_WIRE_COLORS = ["#4f46e5", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6"];

function escapeHtmlText(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMathHTML(rawText) {
  const input = String(rawText ?? "");
  if (!input) return "";
  const tokens = [];
  const mathRegex = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$([^$\n]{1,350}?)\$/g;
  const tokenized = input.replace(mathRegex, (full, dDollar, dBracket, iParen, iDollar) => {
    const isDisplay = Boolean(dDollar || dBracket);
    const expr = (dDollar || dBracket || iParen || iDollar || "").trim();
    if (!expr) return full;
    const idx = tokens.length;
    tokens.push({ expr, isDisplay });
    return `@@DNB_MATH_${idx}@@`;
  });

  let html = escapeHtmlText(tokenized).replace(/\n/g, "<br>");
  html = html.replace(/@@DNB_MATH_(\d+)@@/g, (_m, idxStr) => {
    const item = tokens[Number(idxStr)];
    if (!item) return "";
    if (window.katex && typeof window.katex.renderToString === "function") {
      try {
        return window.katex.renderToString(item.expr, {
          displayMode: item.isDisplay,
          throwOnError: false,
          strict: false
        });
      } catch (_) {}
    }
    return `<code>${escapeHtmlText(item.expr)}</code>`;
  });
  return html;
}
window.renderMathHTML = renderMathHTML;

function sanitizeSvgMarkup(rawSvg) {
  const txt = String(rawSvg || "").trim();
  if (!txt || !txt.includes("<svg")) {
    return `<svg viewBox="0 0 600 340" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="340" fill="#f8fafc"/><text x="300" y="170" text-anchor="middle" fill="#64748b" font-size="15">Schéma SVG indisponible</text></svg>`;
  }
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(txt, "text/html");
    const svg = doc.querySelector("svg");
    if (!svg) throw new Error("SVG introuvable");
    svg.querySelectorAll("script, foreignObject, iframe, object, embed").forEach(el => el.remove());
    svg.querySelectorAll("*").forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        const n = attr.name.toLowerCase();
        const v = String(attr.value || "").trim().toLowerCase();
        if (n.startsWith("on") || v.startsWith("javascript:")) {
          el.removeAttribute(attr.name);
        }
      });
    });
    if (!svg.getAttribute("viewBox")) {
      svg.setAttribute("viewBox", "0 0 600 340");
    }
    svg.removeAttribute("width");
    svg.removeAttribute("height");
    return svg.outerHTML;
  } catch (_) {
    return `<svg viewBox="0 0 600 340" xmlns="http://www.w3.org/2000/svg"><rect width="600" height="340" fill="#f8fafc"/><text x="300" y="170" text-anchor="middle" fill="#64748b" font-size="15">Schéma non valide</text></svg>`;
  }
}

function parseSvgViewBox(viewBoxStr) {
  const parts = String(viewBoxStr || "0 0 600 340").trim().split(/[\s,]+/).map(Number);
  if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
    return { minX: parts[0], minY: parts[1], width: parts[2], height: parts[3] };
  }
  return { minX: 0, minY: 0, width: 600, height: 340 };
}

function renderInteractiveSvgBlock(q, blockKey) {
  const diagram = q.svgDiagram;
  if (!diagram || !diagram.svgMarkup) return "";
  const vb = parseSvgViewBox(diagram.viewBox);
  const keyPoints = Array.isArray(diagram.keyPoints) ? diagram.keyPoints : [];
  window._svgZoomLevels[blockKey] = 1;

  const hotspotsHtml = keyPoints.map((kp, kpIdx) => {
    const xPct = Math.min(96, Math.max(4, ((Number(kp.x) - vb.minX) / vb.width) * 100));
    const yPct = Math.min(94, Math.max(6, ((Number(kp.y) - vb.minY) / vb.height) * 100));
    return `
      <button type="button"
        class="ex-svg-hotspot"
        data-block="${escapeHtmlText(blockKey)}"
        data-kp="${kpIdx}"
        style="left:${xPct.toFixed(2)}%;top:${yPct.toFixed(2)}%;"
        title="${escapeHtmlText(kp.label || `Point ${kpIdx + 1}`)}"
        onclick="selectSvgKeyPoint('${escapeHtmlText(blockKey)}', ${kpIdx})"
        onmouseenter="selectSvgKeyPoint('${escapeHtmlText(blockKey)}', ${kpIdx})"
      ></button>
    `;
  }).join("");

  const firstHint = keyPoints.length > 0
    ? `Clique ou survole les ${keyPoints.length} point(s) clé(s) sur le graphique pour inspecter leurs valeurs.`
    : (diagram.xAxisLabel || diagram.yAxisLabel ? `Axes : ${escapeHtmlText(diagram.xAxisLabel || "X")} / ${escapeHtmlText(diagram.yAxisLabel || "Y")}` : "Utilise les boutons + / - pour zoomer sur le schéma.");

  return `
    <div class="ex-svg-card" id="ex-svg-card-${escapeHtmlText(blockKey)}">
      <div class="ex-svg-toolbar">
        <div class="ex-svg-title">📈 ${escapeHtmlText(diagram.title || "Graphique / Schéma interactif")}</div>
        <div class="ex-svg-controls">
          <button type="button" class="btn-ghost btn-sm" onclick="zoomExerciseSvg('${escapeHtmlText(blockKey)}', -0.25)" title="Dézoomer">−</button>
          <span class="caption" id="ex-svg-zoom-val-${escapeHtmlText(blockKey)}" style="min-width:44px;text-align:center;font-weight:700;">100%</span>
          <button type="button" class="btn-ghost btn-sm" onclick="zoomExerciseSvg('${escapeHtmlText(blockKey)}', 0.25)" title="Zoomer">+</button>
          <button type="button" class="btn-ghost btn-sm" onclick="zoomExerciseSvg('${escapeHtmlText(blockKey)}', 0)" title="Réinitialiser le zoom">Reset</button>
        </div>
      </div>
      <div class="ex-svg-stage">
        <div class="ex-svg-canvas-inner" id="ex-svg-inner-${escapeHtmlText(blockKey)}">
          ${sanitizeSvgMarkup(diagram.svgMarkup)}
          ${hotspotsHtml}
        </div>
      </div>
      <div class="ex-svg-tooltip" id="ex-svg-tooltip-${escapeHtmlText(blockKey)}">
        <span>${firstHint}</span>
      </div>
    </div>
  `;
}

window.zoomExerciseSvg = (blockKey, delta) => {
  const inner = document.getElementById(`ex-svg-inner-${blockKey}`);
  const label = document.getElementById(`ex-svg-zoom-val-${blockKey}`);
  if (!inner) return;
  const cur = window._svgZoomLevels[blockKey] || 1;
  const next = delta === 0 ? 1 : Math.min(2.5, Math.max(0.75, Number((cur + delta).toFixed(2))));
  window._svgZoomLevels[blockKey] = next;
  inner.style.transform = `scale(${next})`;
  if (label) label.textContent = `${Math.round(next * 100)}%`;
};

window.selectSvgKeyPoint = (blockKey, kpIdx) => {
  const ex = window._currentExercice;
  if (!ex) return;
  const parts = String(blockKey).split("_");
  const qid = parts[parts.length - 1];
  const q = (ex.questions || []).find(item => String(item.id) === String(qid));
  const kp = q?.svgDiagram?.keyPoints?.[kpIdx];
  if (!kp) return;

  document.querySelectorAll(`#ex-svg-inner-${blockKey} .ex-svg-hotspot`).forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.kp) === kpIdx);
  });
  const tip = document.getElementById(`ex-svg-tooltip-${blockKey}`);
  if (tip) {
    tip.innerHTML = `<div><strong>📍 ${escapeHtmlText(kp.label || `Point ${kpIdx + 1}`)}</strong> — ${renderMathHTML(kp.detail || "")}</div>`;
  }
};

// Audio Bell Chime generator via Web Audio API (exam end sound)
function playExamBellChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.setValueAtTime(880, now);
    osc1.frequency.exponentialRampToValueAtTime(440, now + 1.2);
    gain1.gain.setValueAtTime(0.4, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 1.2);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(1174.66, now + 0.28);
    osc2.frequency.exponentialRampToValueAtTime(587.33, now + 1.6);
    gain2.gain.setValueAtTime(0.5, now + 0.28);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 1.6);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.28);
    osc2.stop(now + 1.6);

    const osc3 = ctx.createOscillator();
    const gain3 = ctx.createGain();
    osc3.type = "triangle";
    osc3.frequency.setValueAtTime(1318.51, now + 0.6);
    osc3.frequency.exponentialRampToValueAtTime(659.25, now + 2.0);
    gain3.gain.setValueAtTime(0.35, now + 0.6);
    gain3.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
    osc3.connect(gain3);
    gain3.connect(ctx.destination);
    osc3.start(now + 0.6);
    osc3.stop(now + 2.0);
  } catch (e) {
    console.warn("Audio Context non disponible :", e);
  }
}

// Storage helpers (scoped per DnB Reviz account)
function getExerciceStorageKey() {
  const uname = currentUser?.username ? String(currentUser.username).trim() : "guest";
  return `dnb_exercices_history_${uname}`;
}

function getStoredExercices() {
  const key = getExerciceStorageKey();
  try {
    let raw = localStorage.getItem(key);
    if (!raw && currentUser?.username) {
      const legacy = localStorage.getItem("dnb_exercices_history");
      if (legacy) {
        const parsedLegacy = JSON.parse(legacy);
        if (Array.isArray(parsedLegacy)) {
          const mine = parsedLegacy.filter(item => !item.author || item.author === currentUser.username);
          localStorage.setItem(key, JSON.stringify(mine));
          return mine;
        }
      }
    }
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function saveExerciceToHistory(ex) {
  try {
    const list = getStoredExercices();
    const matchKey = ex.remoteId || ex.id;
    const idx = list.findIndex(item => item.id === ex.id || (matchKey && (item.remoteId === matchKey || item.id === matchKey)));
    if (idx >= 0) {
      list[idx] = ex;
    } else {
      list.unshift(ex);
    }
    localStorage.setItem(getExerciceStorageKey(), JSON.stringify(list));
  } catch (e) {
    console.warn("Impossible de sauvegarder l'exercice en local :", e);
  }
}

window.selectExerciceFormat = (fmt) => {
  window._exFormat = fmt || "mix";
  document.querySelectorAll("#ex-type-grid .ex-type-card").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.exType === window._exFormat);
  });
};

window.selectGradingTone = (tone) => {
  window._exGradingTone = tone || "bac";
  document.querySelectorAll(".ex-tone-card").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tone === window._exGradingTone);
  });
};

function getGradingToneLabel(tone) {
  if (tone === "strict") return "Sévère (aucun cadeau)";
  if (tone === "kind") return "Bienveillant (sans excès)";
  return "Comme au Bac (officiel)";
}

function getExerciseTypeLabel(type) {
  switch (type) {
    case "questions": return "Questions rédigées";
    case "matching": return "Reliage";
    case "graph": return "Graphique SVG";
    case "qcm_open": return "QCM + Rédaction";
    case "mix":
    default:
      return "Mix complet";
  }
}

// Open creation modal
window.openCreateExerciceModal = () => {
  window._exUploadedPDFs = [];
  const listDiv = document.getElementById("ex-pdf-list");
  if (listDiv) listDiv.innerHTML = "";

  if (typeof window.syncExerciseSubjectSelects === "function") {
    window.syncExerciseSubjectSelects();
  }

  const subjSelect = document.getElementById("ex-create-subject");
  if (subjSelect) {
    if (subjSelect.options.length > 1) {
      subjSelect.selectedIndex = 0;
    }
    handleExerciceSubjectChange({ target: subjSelect });
  }

  const otherInput = document.getElementById("ex-create-subject-other");
  if (otherInput) otherInput.value = "";
  const topicInput = document.getElementById("ex-create-topic");
  if (topicInput) topicInput.value = "";
  const detailsInput = document.getElementById("ex-create-details");
  if (detailsInput) detailsInput.value = "";

  selectExerciceMode("clavier");
  selectExerciceFormat("mix");
  selectGradingTone("bac");

  setExerciceDuration(60);
  const timerToggle = document.getElementById("ex-enable-timer");
  if (timerToggle) timerToggle.checked = true;
  toggleExerciceTimerFields({ target: { checked: true } });

  populateLikedItemsDropdown();
  openModal("m-create-exercice");
};

function populateLikedItemsDropdown() {
  const sel = document.getElementById("ex-create-linked-item");
  if (!sel) return;
  sel.innerHTML = `<option value="">-- Aucun lien (exercice autonome) --</option>`;

  const myUsername = currentUser ? currentUser.username : "";
  const allLiked = [];

  const postsPool = [...(window._liveCoursData || []), ...(window._liveFRData || [])];
  postsPool.forEach(p => {
    if (p.likes && Array.isArray(p.likes) && (p.likes.includes(myUsername) || !myUsername)) {
      allLiked.push({
        type: "cours",
        id: p.id,
        title: p.title || "Cours sans titre",
        subject: p.subject || p.matiere || "Général",
        author: p.author || "Communauté",
        summary: (p.desc || p.body || p.title || "").slice(0, 150)
      });
    }
  });

  const quizPool = [...(window._liveQuizzesData || []), ...(window._liveAIQuizzesData || [])];
  quizPool.forEach(q => {
    if (q.likes && Array.isArray(q.likes) && (q.likes.includes(myUsername) || !myUsername)) {
      allLiked.push({
        type: "quiz",
        id: q.id,
        title: q.title || "Quiz",
        subject: q.subject || q.matiere || "Général",
        author: q.author || "Communauté",
        summary: `Quiz de ${q.questions?.length || 0} questions`
      });
    }
  });

  if (allLiked.length > 0) {
    const optGroup = document.createElement("optgroup");
    optGroup.label = "❤️ Tes cours, fiches et quiz aimés";
    allLiked.forEach(item => {
      const opt = document.createElement("option");
      opt.value = JSON.stringify({ title: item.title, subject: item.subject, summary: item.summary });
      opt.textContent = `[${item.subject}] ${item.title} (par @${item.author})`;
      optGroup.appendChild(opt);
    });
    sel.appendChild(optGroup);
  } else {
    const opt = document.createElement("option");
    opt.disabled = true;
    opt.textContent = "(Aucun cours ou quiz aimé pour le moment)";
    sel.appendChild(opt);
  }
}

window.handleExerciceSubjectChange = (e) => {
  const isOther = e.target.value === "autre";
  const wrap = document.getElementById("ex-create-subject-other-wrap");
  if (wrap) wrap.style.display = isOther ? "block" : "none";
};

window.handleExercicePDFUpload = async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  for (const f of files) {
    if (!f.name.toLowerCase().endsWith(".pdf")) {
      showToast("Seuls les fichiers PDF sont acceptés ici.");
      continue;
    }
    if (f.size > 20 * 1024 * 1024) {
      showToast(`Le fichier ${f.name} dépasse 20 Mo.`);
      continue;
    }

    try {
      const base64 = await readFileAsBase64(f);
      window._exUploadedPDFs.push({
        name: f.name,
        size: (f.size / (1024 * 1024)).toFixed(2) + " Mo",
        mimeType: "application/pdf",
        base64: base64
      });
    } catch (_) {
      showToast("Erreur de lecture de " + f.name);
    }
  }

  e.target.value = "";
  renderExercicePDFList();
};

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractExercisePDFContext(pdfFiles = []) {
  if (!pdfFiles.length) return { text: "", imageParts: [] };
  if (!window.pdfjsLib) {
    throw new Error("Le lecteur PDF n'a pas pu être chargé. Actualise la page puis réessaie.");
  }

  const pdfjs = window.pdfjsLib;
  pdfjs.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  const textSections = [];
  const imageParts = [];
  let remainingText = 26000;

  for (const pdf of pdfFiles) {
    const dataUrl = String(pdf.base64 || "");
    const base64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
    if (!base64) continue;

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const pdfDocument = await pdfjs.getDocument({ data: bytes }).promise;
    const pagesText = [];

    for (let pageNumber = 1; pageNumber <= Math.min(pdfDocument.numPages, 80) && remainingText > 0; pageNumber++) {
      const page = await pdfDocument.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map(item => typeof item.str === "string" ? item.str : "")
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (pageText) {
        const clipped = pageText.slice(0, remainingText);
        pagesText.push(`Page ${pageNumber} : ${clipped}`);
        remainingText -= clipped.length;
      }

      if (imageParts.length < 3) {
        const baseViewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1.5, 1400 / Math.max(baseViewport.width, baseViewport.height));
        const viewport = page.getViewport({ scale });
        const canvas = window.document.createElement("canvas");
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const context = canvas.getContext("2d");
        if (context) {
          await page.render({ canvasContext: context, viewport }).promise;
          imageParts.push({
            mimeType: "image/jpeg",
            base64: canvas.toDataURL("image/jpeg", 0.72)
          });
        }
        canvas.width = 0;
        canvas.height = 0;
      }
    }

    textSections.push(`Document : ${pdf.name || "Cours PDF"} (${pdfDocument.numPages} page(s))\n${pagesText.join("\n") || "Aucun texte sélectionnable détecté ; pages transmises en image."}`);
    if (remainingText <= 0) break;
  }

  return {
    text: textSections.join("\n\n").slice(0, 26000),
    imageParts
  };
}

function renderExercicePDFList() {
  const listDiv = document.getElementById("ex-pdf-list");
  if (!listDiv) return;

  if (window._exUploadedPDFs.length === 0) {
    listDiv.innerHTML = "";
    return;
  }

  listDiv.innerHTML = window._exUploadedPDFs.map((pdf, idx) => `
    <div style="display:flex; justify-content:space-between; align-items:center; background:var(--card-bg); border:1px solid var(--hl); padding:8px 12px; border-radius:10px; font-size:13px;">
      <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
        <span style="font-size:16px;">📄</span>
        <span style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtmlText(pdf.name)}</span>
        <span class="caption">(${escapeHtmlText(pdf.size)})</span>
      </div>
      <button class="btn-ghost btn-sm del" style="padding:2px 8px; font-size:11px;" onclick="removeExercicePDF(${idx})">✕</button>
    </div>
  `).join("");
}

window.removeExercicePDF = (idx) => {
  window._exUploadedPDFs.splice(idx, 1);
  renderExercicePDFList();
};

window.setExerciceDuration = (minutes) => {
  minutes = Math.min(240, Math.max(5, Number(minutes) || 60));
  window._exDuration = minutes;

  document.querySelectorAll(".ex-timer-btn").forEach(btn => {
    const bMin = Number(btn.dataset.min);
    btn.classList.toggle("active", bMin === minutes);
  });

  const customInput = document.getElementById("ex-custom-duration");
  if (customInput) customInput.value = minutes;
};

window.handleCustomDurationInput = (e) => {
  const val = Number(e.target.value);
  if (val > 240) {
    e.target.value = 240;
    showToast("Le chronomètre est limité à 4 heures maximum (240 min).");
  }
  setExerciceDuration(e.target.value);
};

window.toggleExerciceTimerFields = (e) => {
  const enabled = e.target.checked;
  window._exTimerActive = enabled;
  const cfg = document.getElementById("ex-timer-config");
  if (cfg) cfg.style.display = enabled ? "flex" : "none";
};

window.selectExerciceMode = (mode) => {
  window._exMode = mode;
  const cardClavier = document.getElementById("ex-mode-card-clavier");
  const cardPapier = document.getElementById("ex-mode-card-papier");
  if (cardClavier) cardClavier.classList.toggle("active", mode === "clavier");
  if (cardPapier) cardPapier.classList.toggle("active", mode === "papier");
};

function normalizeGeneratedExercise(data, params) {
  if (!data || typeof data !== "object" || !Array.isArray(data.questions)) {
    throw new Error("La réponse générée ne contient pas de liste de questions exploitable.");
  }
  if (data.questions.length < 3 || data.questions.length > 6) {
    throw new Error("Le sujet doit contenir entre 3 et 6 questions.");
  }

  let questions = data.questions.map((question, index) => {
    const qType = ["open", "qcm", "matching", "graph"].includes(question?.type) ? question.type : "open";
    const points = Math.max(0.5, Number(question?.points) || 2);
    const base = {
      id: index + 1,
      questionNumber: index + 1,
      type: qType,
      title: String(question?.title || `Question ${index + 1}`),
      text: String(question?.text || "").trim(),
      points: Number(points.toFixed(2)),
      hint: String(question?.hint || ""),
      rubric: String(question?.rubric || "Critères d'évaluation à préciser."),
      expectedAnswerSnippet: String(question?.expectedAnswerSnippet || "")
    };
    if (!base.text) {
      throw new Error(`La question ${index + 1} est incomplète.`);
    }
    if (qType === "qcm" && Array.isArray(question.options)) {
      base.options = question.options.slice(0, 6).map(o => String(o));
      base.correctOptionIndex = Number.isInteger(question.correctOptionIndex) ? question.correctOptionIndex : 0;
      base.requiresJustification = Boolean(question.requiresJustification);
    }
    if (qType === "matching") {
      base.leftItems = Array.isArray(question.leftItems) ? question.leftItems : [];
      base.rightItems = Array.isArray(question.rightItems) ? question.rightItems : [];
      base.correctPairs = question.correctPairs && typeof question.correctPairs === "object" ? question.correctPairs : {};
    }
    if (question.svgDiagram && typeof question.svgDiagram === "object") {
      base.svgDiagram = {
        title: String(question.svgDiagram.title || "Graphique / Schéma"),
        xAxisLabel: String(question.svgDiagram.xAxisLabel || ""),
        yAxisLabel: String(question.svgDiagram.yAxisLabel || ""),
        viewBox: String(question.svgDiagram.viewBox || "0 0 600 340"),
        svgMarkup: String(question.svgDiagram.svgMarkup || ""),
        keyPoints: Array.isArray(question.svgDiagram.keyPoints) ? question.svgDiagram.keyPoints : []
      };
    }
    return base;
  });

  const sum = Number(questions.reduce((acc, q) => acc + q.points, 0).toFixed(2));
  if (Math.abs(sum - 20) > 0.01 && sum > 0) {
    let running = 0;
    questions = questions.map((q, idx) => {
      if (idx === questions.length - 1) {
        return { ...q, points: Number((20 - running).toFixed(2)) };
      }
      const scaled = Math.max(0.5, Math.round((q.points / sum) * 20 * 2) / 2);
      running += scaled;
      return { ...q, points: Number(scaled.toFixed(2)) };
    });
  }

  return {
    ...data,
    title: String(data.title || `Entraînement — ${params.topic}`),
    subject: params.subject,
    topic: params.topic,
    level: params.level,
    exerciseType: params.exerciseType || data.exerciseType || "mix",
    gradingTone: params.gradingTone || data.gradingTone || "bac",
    instructions: String(data.instructions || "Répondez à chaque question en justifiant soigneusement votre démarche."),
    totalPoints: 20,
    questions
  };
}

// Instructions de génération des différents formats proposés dans le formulaire.
function getGeneratedExerciseFormatInstructions(exerciseType, mode) {
  const isPaper = mode === "papier";
  switch (exerciseType) {
    case "matching":
      return `FORMAT DEMANDÉ : exercice centré sur le RELIAGE / ASSOCIATION DE NOTIONS.
- Inclus au moins 2 questions de type "matching" avec 4 ou 5 notions à gauche et leurs définitions, résultats ou formules mélangés à droite.
- Complète avec 1 à 2 questions de type "open" pour justifier ou appliquer les notions.
${isPaper ? "- Le reliage sera recopié sur une feuille : numérote clairement les éléments et les propositions." : "- Les éléments doivent être assez courts pour être reliés facilement sur l'interface."}`;
    case "graph":
      return `FORMAT DEMANDÉ : exercice centré sur l'ANALYSE DE GRAPHIQUES ET DE SCHÉMAS SVG.
- Inclus au moins 2 questions de type "graph", chacune avec un champ "svgDiagram" contenant un vrai graphique ou schéma SVG lisible, précis et pertinent.
- Ajoute 1 à 2 questions de type "open" liées à l'interprétation ou aux calculs à partir des visuels.
- Chaque graphique doit utiliser viewBox="0 0 600 340" et comporter 3 à 5 "keyPoints" avec coordonnées exactes, label et détail factuel sans révéler la réponse finale.`;
    case "qcm_open":
      return `FORMAT DEMANDÉ : QCM RAISONNÉS ET QUESTIONS OUVERTES.
- Inclus 2 à 3 questions de type "qcm" avec 4 choix plausibles, un seul bon choix indiqué dans "correctOptionIndex" et "requiresJustification": true.
- Inclus 1 à 2 questions de type "open" pour développer ou justifier.`;
    case "questions":
      return `FORMAT DEMANDÉ : QUESTIONS CLASSIQUES RÉDIGÉES ET PROGRESSIVES.
- Utilise exclusivement le type "open" : calculs, démonstrations, définitions, analyse de documents ou rédaction selon la matière.`;
    case "mix":
    default:
      return `FORMAT DEMANDÉ : MIX PÉDAGOGIQUE VARIÉ.
- Inclus obligatoirement au moins 1 question de type "open", au moins 1 question de type "matching" avec 4 paires, et au moins 1 question de type "graph" avec un véritable schéma ou graphique SVG pertinent pour la matière.
- Tu peux ajouter 1 question de type "qcm" si cela apporte une réelle variété pédagogique.`;
  }
}

// Generate Exercise with the Cloudflare Groq relay (compatible with GitHub Pages).
window.handleGenerateAIExercice = async () => {
  const subjSelect = document.getElementById("ex-create-subject");
  let subject = subjSelect ? subjSelect.value : "";
  if (!subject || subject === "autre") {
    const otherVal = document.getElementById("ex-create-subject-other")?.value.trim();
    if (!otherVal) {
      showToast("Veuillez préciser le nom de votre matière personnalisée.");
      return;
    }
    subject = otherVal;
  }

  const topic = document.getElementById("ex-create-topic")?.value.trim();
  if (!topic) {
    showToast("Veuillez renseigner le chapitre ou thème de l'exercice.");
    return;
  }

  const level = document.getElementById("ex-create-level")?.value || "Contrôle continu standard";
  const details = document.getElementById("ex-create-details")?.value.trim() || "";
  const linkedItemRaw = document.getElementById("ex-create-linked-item")?.value || "";
  let linkedContext = "";
  if (linkedItemRaw) {
    try {
      const parsed = JSON.parse(linkedItemRaw);
      linkedContext = `Titre du document aimé : ${parsed.title} (${parsed.subject})\nRésumé : ${parsed.summary}`;
    } catch (_) {
      // Un élément lié mal formé ne doit pas bloquer la création de l'exercice.
    }
  }

  const durationMinutes = window._exTimerActive ? window._exDuration : 0;
  const mode = window._exMode || "clavier";
  const exerciseType = window._exFormat || "mix";
  const gradingTone = window._exGradingTone || "bac";
  const loadingDiv = document.getElementById("ex-create-loading");
  const actionsDiv = document.getElementById("ex-create-actions");

  if (loadingDiv) loadingDiv.style.display = "block";
  if (actionsDiv) actionsDiv.style.display = "none";

  try {
    // Les PDF sont analysés localement : le relais ne reçoit que le texte extrait
    // et jusqu'à trois images JPEG des premières pages utiles.
    const pdfContext = await extractExercisePDFContext(window._exUploadedPDFs || []);
    const parameters = {
      subject,
      topic,
      level,
      details,
      linkedContext,
      durationMinutes,
      mode,
      exerciseType,
      gradingTone
    };

    const gradingToneLabel = {
      strict: "Sévère & Impitoyable",
      bac: "Comme au Bac / Brevet (Officiel)",
      kind: "Bienveillant (sans excès)"
    }[gradingTone] || "Comme au Bac / Brevet (Officiel)";
    const formatInstructions = getGeneratedExerciseFormatInstructions(exerciseType, mode);

    const promptText = `Tu es un professeur spécialisé expérimenté de l'Éducation nationale française.
Crée un sujet d'exercice complet, authentique, rigoureux et progressif à partir des paramètres suivants.

PARAMÈTRES :
- Matière : ${subject}
- Chapitre / thème : ${topic}
- Niveau : ${level}
- Durée : ${durationMinutes ? `${durationMinutes} minutes` : "Non chronométré"}
- Mode de réponse : ${mode === "papier" ? "Copie papier manuscrite avec téléversement de photos" : "Clavier numérique et interface interactive"}
- Format demandé : ${exerciseType}
- Style de correction prévu : ${gradingToneLabel}
- Consignes supplémentaires : ${details || "Aucune"}
${linkedContext ? `- Document ou cours aimé par l'élève :\n${linkedContext}\n` : ""}
${pdfContext.text ? `CONTENU DES DOCUMENTS PDF FOURNIS (source prioritaire) :\n${pdfContext.text.slice(0, 26000)}\n` : ""}

${formatInstructions}

CONSIGNES IMPÉRATIVES DE QUALITÉ :
1. Génère entre 3 et 6 questions progressives, variées et adaptées à la matière, au thème et au niveau.
2. Le total des points doit être exactement égal à 20 : la somme numérique de questions[].points doit faire 20.
3. Chaque question doit avoir un énoncé complet, autonome et sans ambiguïté, un barème précis dans "rubric", un indice méthodologique facultatif dans "hint" et une synthèse de la solution dans "expectedAnswerSnippet".
4. N'inclus jamais la réponse attendue dans le texte visible de la question.
5. Formate les expressions mathématiques, fractions, puissances, racines, vecteurs, formules chimiques et équations en LaTeX avec $...$ ou $$...$$.
6. Pour chaque question de type "graph", fournis "svgDiagram" avec un SVG complet (viewBox="0 0 600 340", xmlns="http://www.w3.org/2000/svg"), propre et lisible. Aucun script, aucun gestionnaire d'événement et aucun contenu externe dans le SVG. Ajoute 3 à 5 "keyPoints" avec x, y, label et detail factuel ; ne révèle pas la solution dans detail.
7. Pour chaque question de type "matching", fournis 4 paires : "leftItems" et "rightItems" (ce dernier tableau dans un ordre mélangé), puis "correctPairs" avec les correspondances exactes.
8. Pour chaque question de type "qcm", fournis exactement 4 options, "correctOptionIndex" entre 0 et 3 et "requiresJustification" (booléen).
9. Utilise les PDF comme source prioritaire. N'invente aucune information qui contredirait les documents. Les pages envoyées en image servent à lire les schémas, graphiques et pages numérisées.
10. Les consignes doivent être adaptées à la matière : calculs et unités en sciences, rédaction et citations en français, analyse de documents en histoire-géographie, etc.

RENVOIE UNIQUEMENT UN OBJET JSON VALIDE, sans Markdown, avec cette structure :
{
  "title": "Titre du devoir / entraînement",
  "subject": "${subject}",
  "topic": "${topic}",
  "level": "${level}",
  "durationMinutes": ${Number(durationMinutes) || 0},
  "mode": "${mode}",
  "exerciseType": "${exerciseType}",
  "gradingTone": "${gradingTone}",
  "instructions": "Consignes générales pour l'élève",
  "totalPoints": 20,
  "questions": [
    {
      "id": 1,
      "questionNumber": 1,
      "type": "open | qcm | matching | graph",
      "title": "Sous-titre de la question",
      "text": "Énoncé complet avec LaTeX si pertinent",
      "points": 4,
      "hint": "Indice méthodologique facultatif",
      "rubric": "Critères précis d'attribution des points",
      "expectedAnswerSnippet": "Synthèse de la réponse attendue",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctOptionIndex": 0,
      "requiresJustification": true,
      "leftItems": [{"id":"L1","text":"Élément 1"}],
      "rightItems": [{"id":"R1","text":"Correspondance mélangée"}],
      "correctPairs": {"L1":"R1"},
      "svgDiagram": {
        "title": "Titre du graphique",
        "xAxisLabel": "Axe X",
        "yAxisLabel": "Axe Y",
        "viewBox": "0 0 600 340",
        "svgMarkup": "<svg viewBox=\"0 0 600 340\" xmlns=\"http://www.w3.org/2000/svg\">...</svg>",
        "keyPoints": [{"id":"P1","x":180,"y":140,"label":"Point A","detail":"Lecture factuelle du graphique"}]
      }
    }
  ]
}
N'inclus les propriétés options/correctOptionIndex que pour type="qcm", leftItems/rightItems/correctPairs que pour type="matching", et svgDiagram que pour type="graph".`;

    const userContent = [
      { type: "text", text: promptText },
      ...(pdfContext.imageParts || []).map(part => {
        // Compatibilité avec les deux formats d'images utilisés par les anciennes versions.
        if (part?.type === "image_url" && part.image_url?.url) return part;
        const imageUrl = String(part?.base64 || "");
        return imageUrl ? { type: "image_url", image_url: { url: imageUrl } } : null;
      }).filter(Boolean)
    ];

    const systemPrompt = "Tu es un professeur spécialisé rigoureux de l'Éducation nationale française. Génère un sujet pédagogique exact, complet et exploitable par l'interface. Respecte strictement le JSON, les formats de questions demandés et le barème total de 20 points.";
    let generated = await callGroqAPI(systemPrompt, userContent, {
      maxCompletionTokens: 8192,
      temperature: 0.35
    });

    let data;
    try {
      data = normalizeGeneratedExercise(generated, parameters);
    } catch (validationError) {
      // Seconde passe : on demande au modèle de réparer le JSON sans perdre le fond.
      const repairPrompt = `Répare le sujet JSON ci-dessous sans en changer inutilement le contenu.
Corrige précisément cette erreur : ${validationError.message}
Le sujet doit contenir entre 3 et 6 questions valides, respecter le format demandé (${exerciseType}), contenir les champs nécessaires aux QCM/reliages/graphiques utilisés et totaliser exactement 20 points.
Réponds uniquement avec un objet JSON valide.

Sujet à réparer :
${JSON.stringify(generated)}`;
      generated = await callGroqAPI(systemPrompt, repairPrompt, {
        maxCompletionTokens: 8192,
        temperature: 0.15
      });
      data = normalizeGeneratedExercise(generated, parameters);
    }

    const nowTs = Date.now();
    data.createdAt = nowTs;
    data.timestamp = nowTs;
    data.author = currentUser ? currentUser.username : "Élève";
    data.authorId = currentUser ? currentUser.username : "Élève";
    data.mode = mode;
    data.durationMinutes = durationMinutes;
    data.exerciseType = exerciseType;
    data.gradingTone = gradingTone;

    // Publish shared exercise template to Firestore so profs & classmates can see and take it
    if (currentUser?.username) {
      try {
        const sharedPayload = {
          title: data.title,
          subject: data.subject,
          topic: data.topic || parameters.topic || data.subject,
          level: data.level || "Standard",
          instructions: data.instructions || "",
          questions: Array.isArray(data.questions) ? data.questions : [],
          mode,
          durationMinutes: durationMinutes || 0,
          exerciseType,
          gradingTone,
          authorId: currentUser.username,
          authorDisplayName: currentUser.displayName || currentUser.username,
          authorAvatar: currentUser.avatar || "",
          authorRole: currentUser.role || "élève",
          etablissementId: currentUser.etablissementId || "",
          classeId: currentUser.classeId || "",
          likes: [],
          attemptsCount: 0,
          timestamp: nowTs,
          createdAt: nowTs
        };
        const ref = await addDoc(collection(db, "ai_exercices"), sharedPayload);
        data.remoteId = ref.id;
        data.id = ref.id;
        syncContrib();
      } catch (pubErr) {
        console.warn("Partage Firestore exercice impossible :", pubErr);
        data.id = "ex_" + nowTs;
      }
    } else {
      data.id = "ex_" + nowTs;
    }

    saveExerciceToHistory(data);
    closeModal("m-create-exercice");
    showToast("Exercice d'entraînement prêt et partagé ✓");
    window.startExerciceSession(data);
  } catch (err) {
    console.error("Erreur génération exercice :", err);
    showToast("Erreur lors de la génération : " + (err?.message || "réessaie dans quelques instants."));
  } finally {
    if (loadingDiv) loadingDiv.style.display = "none";
    if (actionsDiv) actionsDiv.style.display = "flex";
  }
};

function ensureStructuredSlot(qid) {
  const k = String(qid);
  if (!window._currentStructuredAnswers[k]) {
    window._currentStructuredAnswers[k] = {
      qcmIndex: null,
      qcmText: "",
      matchingPairs: {},
      justification: ""
    };
  }
  return window._currentStructuredAnswers[k];
}

window.selectQcmOption = (qid, optIndex) => {
  const ex = window._currentExercice;
  const q = (ex?.questions || []).find(item => String(item.id) === String(qid));
  if (!q) return;
  const slot = ensureStructuredSlot(qid);
  slot.qcmIndex = optIndex;
  slot.qcmText = q.options?.[optIndex] || "";
  document.querySelectorAll(`[data-qcm-qid="${qid}"]`).forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.optIdx) === optIndex);
  });
};

window.selectMatchNode = (qid, side, itemId) => {
  const k = String(qid);
  const slot = ensureStructuredSlot(k);
  if (side === "left") {
    if (window._matchingSelection.qid === k && window._matchingSelection.leftId === itemId) {
      window._matchingSelection = { qid: null, leftId: null };
    } else {
      window._matchingSelection = { qid: k, leftId: itemId };
    }
    updateMatchingVisuals(k);
    return;
  }

  if (side === "right") {
    if (window._matchingSelection.qid === k && window._matchingSelection.leftId) {
      const leftId = window._matchingSelection.leftId;
      // Unpair previous left mapped to this right item so bijection stays clean
      Object.keys(slot.matchingPairs).forEach(existingL => {
        if (slot.matchingPairs[existingL] === itemId) {
          delete slot.matchingPairs[existingL];
        }
      });
      slot.matchingPairs[leftId] = itemId;
      window._matchingSelection = { qid: null, leftId: null };
      updateMatchingVisuals(k);
    } else {
      // Clicking a paired right item without active left removes its pair
      let changed = false;
      Object.keys(slot.matchingPairs).forEach(existingL => {
        if (slot.matchingPairs[existingL] === itemId) {
          delete slot.matchingPairs[existingL];
          changed = true;
        }
      });
      if (changed) updateMatchingVisuals(k);
      else showToast("Sélectionne d'abord un élément dans la colonne de gauche.");
    }
  }
};

window.resetMatchingQuestion = (qid) => {
  const k = String(qid);
  const slot = ensureStructuredSlot(k);
  slot.matchingPairs = {};
  if (window._matchingSelection.qid === k) {
    window._matchingSelection = { qid: null, leftId: null };
  }
  updateMatchingVisuals(k);
};

function updateMatchingVisuals(qid) {
  const k = String(qid);
  const board = document.getElementById(`ex-match-board-${k}`);
  if (!board) return;
  const slot = ensureStructuredSlot(k);
  const pairs = slot.matchingPairs || {};
  const leftKeys = Object.keys(pairs);

  const colorByLeft = {};
  const colorByRight = {};
  leftKeys.forEach((lid, idx) => {
    const col = MATCH_WIRE_COLORS[idx % MATCH_WIRE_COLORS.length];
    colorByLeft[lid] = col;
    colorByRight[pairs[lid]] = col;
  });

  board.querySelectorAll(".ex-match-node[data-side='left']").forEach(btn => {
    const id = btn.dataset.itemId;
    const isSel = window._matchingSelection.qid === k && window._matchingSelection.leftId === id;
    const col = colorByLeft[id] || "";
    btn.classList.toggle("selected", isSel);
    btn.classList.toggle("paired", Boolean(col));
    if (col) btn.style.setProperty("--match-color", col);
    else btn.style.removeProperty("--match-color");
  });

  board.querySelectorAll(".ex-match-node[data-side='right']").forEach(btn => {
    const id = btn.dataset.itemId;
    const col = colorByRight[id] || "";
    btn.classList.toggle("paired", Boolean(col));
    if (col) btn.style.setProperty("--match-color", col);
    else btn.style.removeProperty("--match-color");
  });

  const counterEl = document.getElementById(`ex-match-count-${k}`);
  if (counterEl) {
    const q = (window._currentExercice?.questions || []).find(item => String(item.id) === k);
    const total = q?.leftItems?.length || leftKeys.length;
    counterEl.textContent = `${leftKeys.length} / ${total} relié(s)`;
  }

  requestAnimationFrame(() => drawMatchingLines(k));
}

function drawMatchingLines(qid) {
  const k = String(qid);
  const board = document.getElementById(`ex-match-board-${k}`);
  const svg = document.getElementById(`ex-match-svg-${k}`);
  if (!board || !svg) return;

  const rect = board.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);

  const slot = ensureStructuredSlot(k);
  const pairs = slot.matchingPairs || {};
  let paths = "";

  Object.entries(pairs).forEach(([lid, rid], idx) => {
    const lNode = board.querySelector(`.ex-match-node[data-side='left'][data-item-id="${CSS.escape(lid)}"]`);
    const rNode = board.querySelector(`.ex-match-node[data-side='right'][data-item-id="${CSS.escape(rid)}"]`);
    if (!lNode || !rNode) return;
    const lRect = lNode.getBoundingClientRect();
    const rRect = rNode.getBoundingClientRect();
    const x1 = lRect.right - rect.left;
    const y1 = lRect.top + lRect.height / 2 - rect.top;
    const x2 = rRect.left - rect.left;
    const y2 = rRect.top + rRect.height / 2 - rect.top;
    const dx = Math.max(24, (x2 - x1) * 0.45);
    const color = MATCH_WIRE_COLORS[idx % MATCH_WIRE_COLORS.length];
    paths += `<path d="M ${x1.toFixed(1)} ${y1.toFixed(1)} C ${(x1 + dx).toFixed(1)} ${y1.toFixed(1)}, ${(x2 - dx).toFixed(1)} ${y2.toFixed(1)}, ${x2.toFixed(1)} ${y2.toFixed(1)}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" opacity="0.9"/>`;
  });

  svg.innerHTML = paths;
}

window.addEventListener("resize", () => {
  if (!window._currentExercice) return;
  (window._currentExercice.questions || []).forEach(q => {
    if (q.type === "matching") drawMatchingLines(q.id);
  });
});

// Start exercise session
window.startExerciceSession = (exercice) => {
  window._currentExercice = exercice;
  window._currentExerciceAnswers = Array.isArray(exercice.studentAnswers)
    ? exercice.studentAnswers.map(a => ({ ...a }))
    : [];
  window._currentStructuredAnswers = exercice.structuredAnswers && typeof exercice.structuredAnswers === "object"
    ? JSON.parse(JSON.stringify(exercice.structuredAnswers))
    : {};
  window._matchingSelection = { qid: null, leftId: null };
  window._exPaperPhotos = [];
  window._exGradingTone = exercice.gradingTone || window._exGradingTone || "bac";

  document.getElementById("ex-take-title").innerText = exercice.title || "Entraînement";
  document.getElementById("ex-take-subject-badge").innerText = exercice.subject;
  document.getElementById("ex-take-level-badge").innerText = exercice.level || "Standard";

  const modeBadge = document.getElementById("ex-take-mode-badge");
  if (modeBadge) {
    modeBadge.innerText = exercice.mode === "papier" ? "📝 Copie Papier" : "💻 Clavier Numérique";
    modeBadge.style.background = exercice.mode === "papier" ? "rgba(255,149,0,.14)" : "rgba(52,199,89,.12)";
    modeBadge.style.color = exercice.mode === "papier" ? "#b25e00" : "#248a3d";
  }

  document.getElementById("ex-take-instructions").innerHTML = renderMathHTML(
    exercice.instructions || "Répondez aux questions avec clarté et précision méthodologique."
  );

  const container = document.getElementById("ex-take-content");
  container.innerHTML = "";

  if (exercice.mode === "papier") {
    const paperBanner = document.createElement("div");
    paperBanner.style.cssText = "background:rgba(88,86,214,.08); border:1px solid rgba(88,86,214,.25); border-radius:16px; padding:18px; margin-bottom:12px;";
    paperBanner.innerHTML = `
      <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
        <span style="font-size:24px;">📝</span>
        <h3 style="margin:0; font-size:16px; color:#5856d6;">Mode Rédaction Manuscrite sur Feuille Papier</h3>
      </div>
      <p class="caption" style="margin:0 0 12px 0; line-height:1.5;">
        Munissez-vous de vos feuilles et stylos. Numérotez bien chaque question (y compris les paires de reliage ou lettres QCM), puis prenez votre copie en photo ci-dessous pour la correction stylo rouge.
      </p>
      <div class="ex-photo-upload-area" onclick="document.getElementById('ex-paper-photo-input').click()">
        <input type="file" id="ex-paper-photo-input" accept="image/jpeg,image/png,image/webp" multiple capture="environment" style="display:none;" onchange="handleExercicePaperPhotos(event)">
        <div style="font-size:28px; margin-bottom:6px;">📸</div>
        <div style="font-weight:700; font-size:14px; color:var(--ink);">Ajouter / Prendre en photo ma copie manuscrite</div>
        <div class="caption">JPG, PNG ou WEBP — jusqu’à 3 photos par copie</div>
      </div>
      <div class="ex-photo-preview-grid" id="ex-photo-preview-grid"></div>
    `;
    container.appendChild(paperBanner);
  }

  const letters = ["A", "B", "C", "D", "E", "F"];
  (exercice.questions || []).forEach((q, idx) => {
    const qid = q.id || (idx + 1);
    const savedText = (window._currentExerciceAnswers.find(a => String(a.questionId) === String(qid))?.answerText) || "";
    const slot = ensureStructuredSlot(qid);

    const qBox = document.createElement("div");
    qBox.className = "ex-question-box";
    qBox.id = `ex-q-box-${qid}`;

    const qFormatTag = q.type === "qcm" ? "QCM" : q.type === "matching" ? "Reliage" : q.type === "graph" ? "Graphique SVG" : "Rédaction";

    const hintHtml = q.hint ? `
      <div style="margin-top:10px;">
        <button type="button" class="btn-ghost btn-sm" style="font-size:12px; padding:3px 10px;" onclick="toggleExerciceHint(${idx})">💡 Voir l'indice</button>
        <div class="ex-hint-content" id="ex-hint-${idx}" style="display:none;">${renderMathHTML(q.hint)}</div>
      </div>
    ` : "";

    const svgHtml = q.svgDiagram?.svgMarkup
      ? renderInteractiveSvgBlock(q, `take_${qid}`)
      : "";

    let interactionHtml = "";

    if (q.type === "qcm" && Array.isArray(q.options) && q.options.length > 0) {
      const optsHtml = q.options.map((opt, optIdx) => {
        const isActive = slot.qcmIndex === optIdx;
        if (exercice.mode === "papier") {
          return `<div class="ex-qcm-opt" style="cursor:default;"><span class="ex-qcm-letter">${letters[optIdx] || optIdx + 1}</span><span>${renderMathHTML(opt)}</span></div>`;
        }
        return `
          <button type="button" class="ex-qcm-opt${isActive ? " active" : ""}" data-qcm-qid="${qid}" data-opt-idx="${optIdx}" onclick="selectQcmOption(${qid}, ${optIdx})">
            <span class="ex-qcm-letter">${letters[optIdx] || optIdx + 1}</span>
            <span>${renderMathHTML(opt)}</span>
          </button>
        `;
      }).join("");
      interactionHtml += `<div class="ex-qcm-list">${optsHtml}</div>`;
    }

    if (q.type === "matching" && Array.isArray(q.leftItems) && Array.isArray(q.rightItems)) {
      const leftHtml = q.leftItems.map((item, lIdx) => `
        <button type="button" class="ex-match-node" data-side="left" data-item-id="${escapeHtmlText(item.id)}" ${exercice.mode === "clavier" ? `onclick="selectMatchNode('${qid}', 'left', '${esc(item.id)}')"` : "disabled"}>
          <span><strong>${lIdx + 1}.</strong> ${renderMathHTML(item.text)}</span>
          <span class="ex-match-dot"></span>
        </button>
      `).join("");
      const rightHtml = q.rightItems.map((item, rIdx) => `
        <button type="button" class="ex-match-node" data-side="right" data-item-id="${escapeHtmlText(item.id)}" ${exercice.mode === "clavier" ? `onclick="selectMatchNode('${qid}', 'right', '${esc(item.id)}')"` : "disabled"}>
          <span class="ex-match-dot"></span>
          <span><strong>${letters[rIdx] || rIdx + 1}.</strong> ${renderMathHTML(item.text)}</span>
        </button>
      `).join("");

      interactionHtml += `
        <div class="ex-matching-wrap">
          <div class="ex-matching-toolbar">
            <span>${exercice.mode === "clavier" ? "Clique à gauche puis à droite pour relier chaque notion :" : "Recopie les paires sur ta feuille (ex: 1-B, 2-A...) :"}</span>
            ${exercice.mode === "clavier" ? `
              <div style="display:flex; align-items:center; gap:8px;">
                <strong id="ex-match-count-${qid}">0 / ${q.leftItems.length} relié(s)</strong>
                <button type="button" class="btn-ghost btn-sm" onclick="resetMatchingQuestion('${qid}')">Réinitialiser</button>
              </div>
            ` : ""}
          </div>
          <div class="ex-matching-board" id="ex-match-board-${qid}">
            <svg class="ex-matching-svg" id="ex-match-svg-${qid}"></svg>
            <div class="ex-matching-col">${leftHtml}</div>
            <div class="ex-matching-col">${rightHtml}</div>
          </div>
        </div>
      `;
    }

    const needsTextBox = exercice.mode === "clavier" && (q.type === "open" || q.type === "graph" || (q.type === "qcm" && q.requiresJustification !== false));
    const answerArea = needsTextBox ? `
      <div style="margin-top:14px;">
        <label style="font-size:13px; font-weight:700; color:var(--ink); margin-bottom:6px; display:block;">
          ${q.type === "qcm" ? "Justification de ton choix :" : "Ta réponse rédigée :"}
        </label>
        <textarea class="ex-q-textarea" id="ex-answer-q-${qid}" data-qid="${qid}" placeholder="${q.type === "qcm" ? "Explique brièvement pourquoi tu as choisi cette option..." : "Rédige ta réponse complète avec démarches, formules et unités..."}" oninput="handleAnswerInput(${qid})">${escapeHtmlText(savedText)}</textarea>
      </div>
    ` : (exercice.mode === "papier" ? `
      <div style="margin-top:10px; font-size:12px; color:var(--ink-m); font-style:italic;">
        ✍️ À traiter sur votre copie papier (n°${q.questionNumber || idx + 1}).
      </div>
    ` : "");

    qBox.innerHTML = `
      <div class="ex-q-header">
        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
          <span style="font-weight:800; font-size:16px; color:var(--primary);">Question ${q.questionNumber || idx + 1}</span>
          ${q.title ? `<span style="font-size:14px; font-weight:600; color:var(--ink);">${escapeHtmlText(q.title)}</span>` : ""}
          <span class="ex-badge-soft" style="font-size:11px;">${qFormatTag}</span>
        </div>
        <span class="ex-q-points">${q.points || 0} pt${(q.points || 0) > 1 ? "s" : ""}</span>
      </div>
      <div style="font-size:15px; line-height:1.65; color:var(--ink);">${renderMathHTML(q.text)}</div>
      ${svgHtml}
      ${hintHtml}
      ${interactionHtml}
      ${answerArea}
    `;

    container.appendChild(qBox);
    if (q.type === "matching") {
      setTimeout(() => updateMatchingVisuals(qid), 60);
    }
  });

  initExerciceTimer(exercice.durationMinutes);
  openModal("m-take-exercice");
};

window.toggleExerciceHint = (idx) => {
  const el = document.getElementById(`ex-hint-${idx}`);
  if (el) el.style.display = el.style.display === "none" ? "block" : "none";
};

window.handleAnswerInput = (qid) => {
  const ta = document.getElementById(`ex-answer-q-${qid}`);
  if (!ta) return;
  const existing = window._currentExerciceAnswers.find(a => String(a.questionId) === String(qid));
  if (existing) {
    existing.answerText = ta.value;
  } else {
    window._currentExerciceAnswers.push({ questionId: qid, answerText: ta.value });
  }
  const slot = ensureStructuredSlot(qid);
  slot.justification = ta.value;
};

// Timer Logic
function initExerciceTimer(minutes) {
  if (window._exTimerInterval) {
    clearInterval(window._exTimerInterval);
    window._exTimerInterval = null;
  }

  const timerBar = document.getElementById("ex-take-timer-bar");
  const alertEl = document.getElementById("ex-timer-alert");
  if (alertEl) alertEl.style.display = "none";

  if (!minutes || minutes <= 0) {
    if (timerBar) timerBar.style.display = "none";
    return;
  }

  if (timerBar) timerBar.style.display = "block";
  window._exTotalSeconds = minutes * 60;
  window._exRemainingSeconds = minutes * 60;
  window._exTimerPaused = false;

  updateTimerDisplay();

  window._exTimerInterval = setInterval(() => {
    if (window._exTimerPaused) return;

    window._exRemainingSeconds--;
    updateTimerDisplay();

    if (window._exRemainingSeconds <= 0) {
      clearInterval(window._exTimerInterval);
      window._exTimerInterval = null;
      window._exRemainingSeconds = 0;
      updateTimerDisplay();
      playExamBellChime();
      if (alertEl) alertEl.style.display = "block";
      showToast("⏰ Le temps imparti de l'exercice est écoulé !");
    }
  }, 1000);
}

function updateTimerDisplay() {
  const display = document.getElementById("ex-timer-display");
  const fill = document.getElementById("ex-timer-progress-fill");
  if (!display || !fill) return;

  const s = Math.max(0, window._exRemainingSeconds);
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  display.innerText = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;

  const pct = window._exTotalSeconds > 0 ? (s / window._exTotalSeconds) * 100 : 0;
  fill.style.width = `${pct}%`;

  if (s <= 300) {
    fill.classList.add("warning");
    display.style.color = "var(--danger)";
  } else {
    fill.classList.remove("warning");
    display.style.color = "var(--primary)";
  }
}

window.toggleExerciceTimerPause = () => {
  window._exTimerPaused = !window._exTimerPaused;
  const btn = document.getElementById("btn-timer-pause");
  const status = document.getElementById("ex-timer-status");
  if (btn) btn.innerText = window._exTimerPaused ? "▶️ Reprendre" : "⏸️ Pause";
  if (status) status.innerText = window._exTimerPaused ? "En pause" : "Chronomètre actif";
};

window.handleExercicePaperPhotos = async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  for (const f of files) {
    if (window._exPaperPhotos.length >= 3) {
      showToast("La correction IA accepte jusqu'à 3 photos par copie.");
      break;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      showToast("Format photo non pris en charge : utilise JPG, PNG ou WEBP.");
      continue;
    }
    try {
      const base64 = await readFileAsBase64(f);
      window._exPaperPhotos.push({
        name: f.name,
        mimeType: f.type,
        base64: base64
      });
    } catch (_) {
      showToast("Erreur de chargement d'une photo.");
    }
  }

  e.target.value = "";
  renderPaperPhotosGrid();
  showToast(`${window._exPaperPhotos.length} photo(s) de copie enregistrée(s) ✓`);
};

function renderPaperPhotosGrid() {
  const grid = document.getElementById("ex-photo-preview-grid");
  if (!grid) return;

  grid.innerHTML = window._exPaperPhotos.map((p, idx) => `
    <div class="ex-photo-thumb-card">
      <img src="${p.base64}" alt="Page ${idx + 1}">
      <button type="button" class="ex-photo-thumb-del" onclick="removeExercicePhoto(${idx})">✕</button>
      <div style="position:absolute; bottom:4px; left:4px; font-size:10px; background:rgba(0,0,0,0.7); color:#fff; padding:2px 6px; border-radius:4px;">Page ${idx + 1}</div>
    </div>
  `).join("");
}

window.removeExercicePhoto = (idx) => {
  window._exPaperPhotos.splice(idx, 1);
  renderPaperPhotosGrid();
};

function collectAllStudentAnswers() {
  const ex = window._currentExercice;
  if (!ex) return { textAnswers: [], structuredAnswers: {} };

  const textAnswers = [];
  (ex.questions || []).forEach(q => {
    const qid = q.id;
    const ta = document.getElementById(`ex-answer-q-${qid}`);
    const slot = ensureStructuredSlot(qid);
    const val = ta ? ta.value.trim() : (slot.justification || "");
    textAnswers.push({ questionId: qid, answerText: val });
    if (ta) slot.justification = val;
  });

  window._currentExerciceAnswers = textAnswers;
  return {
    textAnswers,
    structuredAnswers: window._currentStructuredAnswers || {}
  };
}

window.confirmExitExercice = () => {
  if (confirm("Voulez-vous vraiment quitter cette session d'exercice ? Vos réponses actuelles sont conservées localement.")) {
    const ex = window._currentExercice;
    if (ex) {
      const { textAnswers, structuredAnswers } = collectAllStudentAnswers();
      ex.studentAnswers = textAnswers;
      ex.structuredAnswers = structuredAnswers;
      saveExerciceToHistory(ex);
    }
    if (window._exTimerInterval) {
      clearInterval(window._exTimerInterval);
      window._exTimerInterval = null;
    }
    closeModal("m-take-exercice");
  }
};

window.openSelfEvaluationModal = () => {
  if (!window._currentExercice) return;

  if (window._currentExercice.mode === "papier") {
    if (window._exPaperPhotos.length === 0) {
      if (!confirm("Vous n'avez pas encore téléversé de photo de votre copie papier. Voulez-vous quand même continuer pour la correction ?")) {
        return;
      }
    }
  } else {
    const { textAnswers, structuredAnswers } = collectAllStudentAnswers();
    const hasText = textAnswers.some(a => a.answerText.length > 0);
    const hasStruct = Object.values(structuredAnswers).some(s =>
      (s.qcmIndex !== null && s.qcmIndex !== undefined) ||
      (s.matchingPairs && Object.keys(s.matchingPairs).length > 0)
    );
    if (!hasText && !hasStruct) {
      if (!confirm("Vous n'avez saisi aucune réponse aux questions. Voulez-vous quand même lancer la correction du professeur ?")) {
        return;
      }
    }
  }

  selectGradingTone(window._currentExercice.gradingTone || window._exGradingTone || "bac");
  setSelfEvalStars(4);
  const rangeInput = document.getElementById("self-eval-score-range");
  if (rangeInput) rangeInput.value = 14;
  handleSelfEvalScoreChange({ target: { value: 14 } });
  const refText = document.getElementById("self-eval-reflections");
  if (refText) refText.value = "";

  openModal("m-self-evaluation");
};

window.setSelfEvalStars = (val) => {
  window._currentSelfEval.confidenceStars = Number(val);
  const stars = document.querySelectorAll("#self-eval-stars .ex-star");
  stars.forEach(st => {
    const sVal = Number(st.dataset.val);
    st.classList.toggle("active", sVal <= val);
  });

  const textEl = document.getElementById("self-eval-confidence-text");
  const labels = [
    "",
    "Très peu confiant (1/5) — Gros doutes sur l'épreuve",
    "Peu confiant (2/5) — Plusieurs blocages",
    "Moyennement confiant (3/5) — Travail correct mais hésitant",
    "Assez confiant (4/5) — Bon ressenti général",
    "Très confiant (5/5) — Démarche maîtrisée et complète"
  ];
  if (textEl) textEl.innerText = labels[val] || `${val}/5`;
};

window.handleSelfEvalScoreChange = (e) => {
  const score = Number(e.target.value);
  window._currentSelfEval.estimatedScore = score;
  const disp = document.getElementById("self-eval-score-display");
  if (disp) disp.innerText = `${score} / 20`;
};

function normalizeExerciseGrading(result, exercise, gradingTone) {
  if (!result || typeof result !== "object") {
    throw new Error("La correction générée est vide ou invalide.");
  }

  const sourceEvaluations = Array.isArray(result.questionEvaluations) ? result.questionEvaluations : [];
  const questionEvaluations = (exercise.questions || []).map((question, index) => {
    const evaluation = sourceEvaluations.find(item => item && String(item.questionId) === String(question.id)) || sourceEvaluations[index] || {};
    const maxPoints = Number(question.points) || 0;
    const rawPoints = Number(evaluation.pointsAwarded);
    const pointsAwarded = Number(Math.min(maxPoints, Math.max(0, Number.isFinite(rawPoints) ? rawPoints : 0)).toFixed(2));
    const criteria = Array.isArray(evaluation.criteriaBreakdown)
      ? evaluation.criteriaBreakdown.map(c => ({
          label: String(c?.label || "Critère"),
          awarded: Number(c?.awarded ?? 0),
          max: Number(c?.max ?? 0)
        }))
      : [];
    const annotations = Array.isArray(evaluation.annotations)
      ? evaluation.annotations.map(seg => ({
          text: String(seg?.text || ""),
          status: ["correct", "imprecise", "error", "neutral"].includes(seg?.status) ? seg.status : "neutral",
          comment: String(seg?.comment || "")
        })).filter(seg => seg.text.length > 0)
      : [];

    return {
      questionId: question.id,
      pointsAwarded,
      maxPoints,
      status: pointsAwarded >= maxPoints ? "correct" : pointsAwarded > 0 ? "partial" : "incorrect",
      criteriaBreakdown: criteria,
      annotations,
      feedback: String(evaluation.feedback || "La réponse n'a pas pu être évaluée en détail."),
      idealSolution: String(evaluation.idealSolution || question.expectedAnswerSnippet || question.rubric || "")
    };
  });

  const totalScore = Number(questionEvaluations.reduce((sum, item) => sum + item.pointsAwarded, 0).toFixed(2));
  return {
    ...result,
    gradingToneUsed: result.gradingToneUsed || gradingTone || "bac",
    bulletinComment: String(result.bulletinComment || result.generalAppreciation || "Travail examiné avec attention."),
    totalScore,
    maxScore: 20,
    questionEvaluations,
    strengths: Array.isArray(result.strengths) ? result.strengths : [],
    improvements: Array.isArray(result.improvements) ? result.improvements : []
  };
}

// Consignes de correction utilisées par le relais Cloudflare / Groq.
function getExerciseGradingToneInstructions(tone) {
  switch (tone) {
    case "strict":
      return `POSTURE DE CORRECTION : SÉVÈRE (aucun cadeau).
- Applique le barème de manière stricte et exigeante.
- Pénalise systématiquement tout oubli d'unité, toute notation mathématique/scientifique imprécise, toute affirmation non justifiée, toute faute de méthode ou d'orthographe technique.
- Un résultat juste sans démonstration lorsque celle-ci est attendue ne vaut au maximum que la moitié des points.`;
    case "kind":
      return `POSTURE DE CORRECTION : BIENVEILLANT ET CONSTRUCTIF (gentiment mais sans plus).
- Reste honnête sur la note (ne donne JAMAIS de points pour une réponse fausse ou hors-sujet), mais valorise pleinement les bonnes intuitions et la logique de raisonnement même si la formulation est maladroite.
- Tolère les petites maladresses rédactionnelles mineures tant que l'idée juste est clairement exprimée.
- Adopte un ton chaleureux, encourageant et rassurant dans les retours.`;
    case "bac":
    default:
      return `POSTURE DE CORRECTION : JURY D'EXAMEN OFFICIEL (BAC / BREVET).
- Sois parfaitement impartial, équilibré et fidèle aux consignes officielles de l'Éducation Nationale.
- Valorise la démarche et les étapes intermédiaires cohérentes (même si une erreur de calcul survient en cours de route, n'applique la pénalité qu'une fois).
- Exige la rigueur attendue à l'examen officiel.`;
  }
}

// Submit for AI grading through the same Cloudflare Groq relay as exercise generation.
window.submitExerciceForGrading = async () => {
  if (!window._currentExercice) return;

  const reflections = document.getElementById("self-eval-reflections")?.value.trim() || "";
  window._currentSelfEval.reflections = reflections;

  const loadingDiv = document.getElementById("ex-grade-loading");
  const actionsDiv = document.getElementById("self-eval-actions");
  if (loadingDiv) loadingDiv.style.display = "block";
  if (actionsDiv) actionsDiv.style.display = "none";

  try {
    const exercise = window._currentExercice;
    const mode = exercise.mode || window._exMode || "clavier";
    const gradingTone = window._exGradingTone || exercise.gradingTone || "bac";
    const { textAnswers, structuredAnswers } = collectAllStudentAnswers();
    const paperPhotos = (window._exPaperPhotos || []).slice(0, 3);

    if (!exercise.questions || !Array.isArray(exercise.questions) || exercise.questions.length === 0) {
      throw new Error("Le sujet de l'exercice ne contient aucune question à corriger.");
    }

    const effectiveTone = gradingTone || exercise.gradingTone || "bac";
    const toneDirective = getExerciseGradingToneInstructions(effectiveTone);
    const promptText = `Tu es un professeur français chargé de corriger la copie d'un élève façon « stylo rouge sur copie d'examen ».

${toneDirective}

=== SUJET D'ORIGINE ===
Matière : ${exercise.subject || "Non précisée"}
Thème : ${exercise.topic || "Non précisé"}
Niveau : ${exercise.level || "Non précisé"}
Consignes : ${exercise.instructions || "Standard"}
Barème total : 20 points
Questions :
${JSON.stringify(exercise.questions, null, 2)}

=== AUTO-ÉVALUATION DE L'ÉLÈVE ===
Note estimée par l'élève : ${window._currentSelfEval?.estimatedScore ?? "Non spécifiée"}/20
Confiance : ${window._currentSelfEval?.confidenceStars ?? "3"}/5
Commentaire : "${window._currentSelfEval?.reflections || "Aucun commentaire"}"

=== COPIE DE L'ÉLÈVE ===
Mode de réponse : ${mode === "papier" ? "Copie papier manuscrite photographiée (lis attentivement toutes les images jointes)" : "Réponses saisies au clavier et interactions"}
Réponses textuelles saisies :
${JSON.stringify(textAnswers || [], null, 2)}
Réponses interactives (QCM / Reliage) :
${JSON.stringify(structuredAnswers || {}, null, 2)}
Nombre de photos jointes : ${paperPhotos.length}

=== DIRECTIVES DE CORRECTION & ANNOTATIONS STYLO ROUGE ===
1. Évalue chaque question séparément en respectant son barème exact : maxPoints = question.points. N'invente pas de réponse lorsque l'élève n'a rien fourni.
2. Pour chaque question :
   - Décompose la note dans "criteriaBreakdown" (ex. [{"label":"Méthode & justification","awarded":1.5,"max":2},{"label":"Résultat & unités","awarded":1,"max":1}]). La somme des "awarded" doit égaler "pointsAwarded" et la somme des "max" doit égaler "maxPoints".
   - Fournis "annotations" : des segments de la réponse réelle de l'élève (ou du texte effectivement lu sur sa copie papier), avec un statut parmi "correct", "error", "imprecise" et "neutral". Utilise "correct" pour le juste, "error" pour une erreur, "imprecise" pour une formulation vague ou une unité manquante et "neutral" pour une liaison. Ajoute un commentaire court et précis pour les erreurs et imprécisions. Si l'élève n'a rien répondu, utilise un seul segment {"text":"(Aucune réponse rédigée)","status":"error","comment":"Question non traitée"}.
   - Rédige "feedback" (commentaire constructif façon stylo rouge) et "idealSolution" (rédaction modèle complète, avec formules LaTeX $...$ si pertinent).
3. Calcule "totalScore" comme la somme exacte des "pointsAwarded" de toutes les questions. La note est sur 20.
4. Compare avec l'auto-évaluation de l'élève dans "selfAssessmentCritique".
5. Rédige "bulletinComment" (2 phrases maximum, façon bulletin scolaire officiel) et "generalAppreciation" (appréciation plus détaillée).
6. Pour une copie photographiée, examine les images jointes dans l'ordre des pages. Ne prétends jamais lire un passage illisible ; signale-le dans le feedback et n'invente aucun contenu.

Réponds STRICTEMENT avec un objet JSON valide, sans Markdown ni texte avant/après, avec cette structure :
{
  "totalScore": 14.5,
  "maxScore": 20,
  "mention": "Bien",
  "gradingToneUsed": "${effectiveTone}",
  "bulletinComment": "Travail sérieux et méthodique, des bases solides à consolider sur la rédaction finale.",
  "generalAppreciation": "Appréciation globale détaillée du professeur...",
  "selfAssessmentCritique": "Analyse de l'écart entre la note estimée et la note réelle...",
  "strengths": ["Point fort 1", "Point fort 2"],
  "improvements": ["Axe de progrès 1", "Axe de progrès 2"],
  "questionEvaluations": [
    {
      "questionId": 1,
      "pointsAwarded": 3.5,
      "maxPoints": 4,
      "status": "partial",
      "criteriaBreakdown": [
        {"label":"Démarche / Raisonnement","awarded":2,"max":2},
        {"label":"Calcul & Unités","awarded":1.5,"max":2}
      ],
      "annotations": [
        {"text":"On applique le théorème de Pythagore dans le triangle ABC rectangle en A.","status":"correct","comment":"Hypothèse bien posée"},
        {"text":"Donc BC = 12.","status":"imprecise","comment":"Unité (cm) oubliée"}
      ],
      "feedback": "Bon raisonnement d'ensemble, pense à toujours indiquer l'unité.",
      "idealSolution": "Rédaction modèle complète avec LaTeX $...$"
    }
  ]
}

Chaque question du sujet doit apparaître exactement une fois dans questionEvaluations, avec son questionId d'origine.`;

    // Les photos sont envoyées comme images vision au format OpenAI/Groq.
    // readFileAsBase64 renvoie normalement déjà une data URL (data:image/...;base64,...).
    const imageParts = paperPhotos.map(photo => {
      const rawImage = String(photo?.base64 || "").trim();
      if (!rawImage) return null;
      const imageUrl = /^data:image\//i.test(rawImage)
        ? rawImage
        : `data:${photo.mimeType || "image/jpeg"};base64,${rawImage.replace(/^data:[^,]*,/, "")}`;
      return { type: "image_url", image_url: { url: imageUrl } };
    }).filter(Boolean);

    const userContent = [
      { type: "text", text: promptText },
      ...imageParts
    ];
    const gradingPayload = await callGroqAPI(
      "Tu es un professeur correcteur officiel français. Corrige avec minutie et impartialité. Respecte strictement le barème et renvoie uniquement le JSON demandé.",
      userContent,
      { maxCompletionTokens: 8192, temperature: 0.2 }
    );

    const gradingResult = normalizeExerciseGrading(gradingPayload, exercise, effectiveTone);

    exercise.result = gradingResult;
    exercise.gradingTone = gradingTone;
    exercise.studentAnswers = textAnswers;
    exercise.structuredAnswers = structuredAnswers;
    exercise.paperPhotosCount = paperPhotos.length;
    exercise.selfAssessment = { ...window._currentSelfEval };
    exercise.gradedAt = Date.now();

    saveExerciceToHistory(exercise);

    // Increment shared attempt counter in Firestore when completed
    const targetRemoteId = exercise.remoteId || exercise.id;
    if (targetRemoteId && !String(targetRemoteId).startsWith("ex_")) {
      try {
        const remoteRef = doc(db, "ai_exercices", targetRemoteId);
        const remoteSnap = await getDoc(remoteRef);
        if (remoteSnap.exists()) {
          const prevAttempts = Number(remoteSnap.data().attemptsCount) || 0;
          await updateDoc(remoteRef, { attemptsCount: prevAttempts + 1 });
        }
      } catch (_) {}
    }

    // Award streak shield every 5 passed exercises (>= 10/20)
    if (gradingResult.totalScore >= 10 && currentUser?.id) {
      const nextCount = (Number(currentUser.passedExercisesCount) || 0) + 1;
      currentUser.passedExercisesCount = nextCount;
      saveSessionLocally(currentUser);
      try {
        await updateDoc(doc(db, "users", currentUser.id), { passedExercisesCount: nextCount });
      } catch (_) {}
      if (typeof window.awardStreakShieldIfEligible === "function") {
        window.awardStreakShieldIfEligible("exercises", nextCount);
      }
    }

    if (window._exTimerInterval) {
      clearInterval(window._exTimerInterval);
      window._exTimerInterval = null;
    }

    closeModal("m-self-evaluation");
    closeModal("m-take-exercice");
    displayExerciceResults(exercise);
    loadExercicesFeed();
    showToast("Copie corrigée par le professeur IA ✓");
  } catch (err) {
    console.error("Erreur grading :", err);
    showToast("Erreur lors de la correction : " + (err?.message || "réessaie dans quelques instants."));
  } finally {
    if (loadingDiv) loadingDiv.style.display = "none";
    if (actionsDiv) actionsDiv.style.display = "flex";
  }
};

function formatStudentPlainAnswer(ex, q) {
  const qid = q.id;
  const studentAnsObj = (ex.studentAnswers || []).find(a => String(a.questionId) === String(qid));
  const struct = (ex.structuredAnswers || {})[String(qid)];
  const parts = [];

  if (q.type === "qcm" && struct && struct.qcmIndex !== null && struct.qcmIndex !== undefined) {
    const letter = ["A", "B", "C", "D", "E", "F"][struct.qcmIndex] || (struct.qcmIndex + 1);
    parts.push(`Choix sélectionné : ${letter}. ${struct.qcmText || q.options?.[struct.qcmIndex] || ""}`);
  }
  if (q.type === "matching" && struct && struct.matchingPairs && Object.keys(struct.matchingPairs).length > 0) {
    const pairLines = Object.entries(struct.matchingPairs).map(([lid, rid]) => {
      const lTxt = (q.leftItems || []).find(i => i.id === lid)?.text || lid;
      const rTxt = (q.rightItems || []).find(i => i.id === rid)?.text || rid;
      return `• ${lTxt} → ${rTxt}`;
    });
    parts.push(pairLines.join("\n"));
  }
  if (studentAnsObj && studentAnsObj.answerText) {
    parts.push(studentAnsObj.answerText);
  }
  if (parts.length > 0) return parts.join("\n");
  if (ex.mode === "papier") return `[Réponse sur copie papier téléversée — ${ex.paperPhotosCount || 1} photo(s)]`;
  return "(Aucune réponse saisie)";
}

function renderAnnotatedPaperHtml(qEval, fallbackText) {
  const anns = Array.isArray(qEval.annotations) && qEval.annotations.length > 0 ? qEval.annotations : null;
  if (!anns) {
    return `<div>${renderMathHTML(fallbackText)}</div>`;
  }
  return anns.map(seg => {
    const cls = seg.status === "correct"
      ? "ex-ann-correct"
      : seg.status === "imprecise"
        ? "ex-ann-imprecise"
        : seg.status === "error"
          ? "ex-ann-error"
          : "";
    const commentHtml = seg.comment
      ? `<span class="ex-ann-note">✒️ ${escapeHtmlText(seg.comment)}</span>`
      : "";
    const textHtml = renderMathHTML(seg.text);
    return cls ? `<span class="${cls}">${textHtml}</span>${commentHtml} ` : `<span>${textHtml}</span>${commentHtml} `;
  }).join("");
}

function renderStructuredComparisonHtml(ex, q) {
  const struct = (ex.structuredAnswers || {})[String(q.id)];
  if (q.type === "qcm" && Array.isArray(q.options)) {
    const letters = ["A", "B", "C", "D", "E", "F"];
    const picked = struct?.qcmIndex;
    const expected = q.correctOptionIndex;
    return `
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
        ${q.options.map((opt, idx) => {
          const isPicked = picked === idx;
          const isCorrect = expected === idx;
          let bg = "var(--file-bg)";
          let border = "var(--hl)";
          let tag = "";
          if (isCorrect) { bg = "rgba(34,197,94,.14)"; border = "#16a34a"; tag = " ✓ Attendu"; }
          if (isPicked && !isCorrect) { bg = "rgba(239,68,68,.12)"; border = "#dc2626"; tag = " ✕ Ton choix"; }
          if (isPicked && isCorrect) { tag = " ✓ Ton choix"; }
          return `<span style="font-size:12px;padding:4px 9px;border-radius:8px;background:${bg};border:1px solid ${border};color:var(--ink);"><strong>${letters[idx]}.</strong> ${renderMathHTML(opt)}${tag ? ` <strong>${tag}</strong>` : ""}</span>`;
        }).join("")}
      </div>
    `;
  }
  if (q.type === "matching" && Array.isArray(q.leftItems) && q.correctPairs) {
    const studentPairs = struct?.matchingPairs || {};
    return `
      <div style="display:flex;flex-direction:column;gap:5px;margin-bottom:10px;">
        ${q.leftItems.map(li => {
          const sRid = studentPairs[li.id];
          const cRid = q.correctPairs[li.id];
          const sTxt = (q.rightItems || []).find(r => r.id === sRid)?.text || "Non relié";
          const cTxt = (q.rightItems || []).find(r => r.id === cRid)?.text || cRid || "—";
          const ok = sRid && sRid === cRid;
          return `
            <div style="font-size:12px;padding:6px 10px;border-radius:8px;background:${ok ? "rgba(34,197,94,.12)" : "rgba(239,68,68,.09)"};border:1px solid ${ok ? "rgba(22,163,74,.4)" : "rgba(220,38,38,.3)"};color:var(--ink);">
              <strong>${renderMathHTML(li.text)}</strong> → ${renderMathHTML(sTxt)} ${ok ? "✅" : `<span style="color:#dc2626;font-weight:700;">(Attendu : ${renderMathHTML(cTxt)})</span>`}
            </div>
          `;
        }).join("")}
      </div>
    `;
  }
  return "";
}

function displayExerciceResults(ex) {
  const res = ex.result;
  if (!res) return;
  window._currentExercice = ex;

  document.getElementById("ex-result-title").innerText = ex.title;
  document.getElementById("ex-result-meta").innerText = `${ex.subject} · ${ex.level || "Standard"} · ${new Date(ex.gradedAt || Date.now()).toLocaleDateString("fr-FR")}`;

  const scoreEl = document.getElementById("ex-result-score");
  if (scoreEl) scoreEl.innerHTML = `${res.totalScore}<span style="font-size:24px; color:var(--ink-m);">/20</span>`;

  const mentionEl = document.getElementById("ex-result-mention");
  if (mentionEl) mentionEl.innerText = res.mention || (res.totalScore >= 16 ? "Très bien" : res.totalScore >= 14 ? "Bien" : res.totalScore >= 12 ? "Assez bien" : res.totalScore >= 10 ? "Passable" : "Insuffisant");

  const toneBadge = document.getElementById("ex-result-tone-badge");
  if (toneBadge) toneBadge.innerText = getGradingToneLabel(res.gradingToneUsed || ex.gradingTone || "bac");

  const bulletinEl = document.getElementById("ex-result-bulletin");
  if (bulletinEl) bulletinEl.innerText = res.bulletinComment || res.generalAppreciation || "Travail sérieux.";

  const selfScoreEl = document.getElementById("ex-result-self-score");
  const gapEl = document.getElementById("ex-result-gap");
  const selfCommentEl = document.getElementById("ex-result-self-comment");

  const selfScore = ex.selfAssessment?.estimatedScore ?? res.totalScore;
  const gap = Number((res.totalScore - selfScore).toFixed(1));
  if (selfScoreEl) selfScoreEl.innerText = `${selfScore}/20`;
  if (gapEl) {
    gapEl.innerText = `${gap > 0 ? "+" : ""}${gap} pt${Math.abs(gap) > 1 ? "s" : ""}`;
    gapEl.style.color = gap >= 0 ? "#248a3d" : "#c93400";
  }
  if (selfCommentEl) {
    selfCommentEl.innerText = res.selfAssessmentCritique || (gap > 0 ? "Tu as fait preuve d'une modestie appréciable, ton travail est meilleur que prévu !" : gap < 0 ? "Attention à ne pas sous-estimer la sévérité du barème officiel et l'exigence de rédaction." : "Estimation parfaite de ta copie !");
  }

  const appEl = document.getElementById("ex-result-appreciation");
  if (appEl) appEl.innerHTML = `« ${renderMathHTML(res.generalAppreciation || "Copie corrigée avec rigueur.")} »`;

  const strList = document.getElementById("ex-result-strengths");
  if (strList) {
    strList.innerHTML = (res.strengths || ["Rigueur des démarches"]).map(s => `<li>${renderMathHTML(s)}</li>`).join("");
  }
  const impList = document.getElementById("ex-result-improvements");
  if (impList) {
    impList.innerHTML = (res.improvements || ["Préciser les unités et justifications"]).map(s => `<li>${renderMathHTML(s)}</li>`).join("");
  }

  const qContainer = document.getElementById("ex-result-questions-container");
  if (qContainer) {
    qContainer.innerHTML = (ex.questions || []).map((q, idx) => {
      const qEval = (res.questionEvaluations || []).find(e => String(e.questionId) === String(q.id)) || res.questionEvaluations?.[idx] || {
        pointsAwarded: q.points || 0,
        maxPoints: q.points || 0,
        status: "correct",
        criteriaBreakdown: [],
        annotations: [],
        feedback: "Bonne réponse.",
        idealSolution: q.rubric || "Réponse attendue."
      };

      const ptsAwarded = qEval.pointsAwarded ?? 0;
      const maxPts = qEval.maxPoints ?? q.points ?? 0;
      const statusClass = qEval.status === "correct" || ptsAwarded === maxPts ? "correct" : ptsAwarded > 0 ? "partial" : "incorrect";
      const statusBadgeText = statusClass === "correct" ? "✓ Validé" : statusClass === "partial" ? "⚠ Partiel" : "✕ Erreur";

      const fallbackAnswerText = formatStudentPlainAnswer(ex, q);
      const criteriaHtml = Array.isArray(qEval.criteriaBreakdown) && qEval.criteriaBreakdown.length > 0
        ? `<div class="ex-criteria-row">${qEval.criteriaBreakdown.map(c => `<span class="ex-criterion-item">${escapeHtmlText(c.label)}<span>+${c.awarded} / ${c.max} pt${c.max > 1 ? "s" : ""}</span></span>`).join("")}</div>`
        : "";

      const svgReview = q.svgDiagram?.svgMarkup ? renderInteractiveSvgBlock(q, `res_${q.id}`) : "";

      return `
        <div class="ex-res-q-box ${statusClass}">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin-bottom:8px;">
            <div style="font-weight:700; font-size:15px; color:var(--ink);">
              Question ${q.questionNumber || idx + 1} ${q.title ? `— ${escapeHtmlText(q.title)}` : ""}
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="type-tag" style="font-weight:700;">${ptsAwarded} / ${maxPts} pts</span>
              <span class="ex-badge-soft" style="font-size:11px;">${statusBadgeText}</span>
            </div>
          </div>

          <div style="font-size:14px; color:var(--ink-m); margin-bottom:10px; line-height:1.55;">
            <strong>Énoncé :</strong> ${renderMathHTML(q.text)}
          </div>

          ${svgReview}
          ${renderStructuredComparisonHtml(ex, q)}

          <!-- Copie d'examen annotée façon stylo rouge -->
          <div class="ex-exam-paper">
            <div class="ex-exam-margin-score">${ptsAwarded}<br>/${maxPts}</div>
            ${renderAnnotatedPaperHtml(qEval, fallbackAnswerText)}
          </div>

          ${criteriaHtml}

          <div style="background:rgba(220,38,38,0.05); border:1px solid rgba(220,38,38,0.18); border-radius:10px; padding:12px; margin-top:12px; margin-bottom:10px;">
            <div style="font-size:12px; font-weight:700; color:#dc2626; margin-bottom:4px;">✒️ Remarque du correcteur :</div>
            <div style="font-size:13px; line-height:1.5; color:var(--ink);">${renderMathHTML(qEval.feedback || "Démarche examinée.")}</div>
          </div>

          <div style="background:rgba(52,199,89,0.06); border:1px solid rgba(52,199,89,0.25); border-radius:10px; padding:12px;">
            <div style="font-size:12px; font-weight:700; color:#248a3d; margin-bottom:4px;">✨ Corrigé type attendu :</div>
            <div style="font-size:13px; line-height:1.55; color:var(--ink);">${renderMathHTML(qEval.idealSolution || q.expectedAnswerSnippet || "Se référer aux formules du cours.")}</div>
          </div>
        </div>
      `;
    }).join("");
  }

  openModal("m-exercice-result");
}

// PDF EXPORT (Uncorrected & Graded)
const EX_PDF_LAYOUT = {
  pageWidth: 210,
  pageHeight: 297,
  left: 14,
  right: 196,
  width: 182,
  top: 18,
  bottom: 279,
  lineHeight: 4.5
};

function safePdfText(value, fallback = "—") {
  const normalized = String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/[“”]/g, '"')
    .replace(/[’‘]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/\u00a0/g, " ")
    .trim();
  return normalized || fallback;
}

function pdfLines(doc, text, width, fontSize = 9, fontStyle = "normal") {
  doc.setFont("helvetica", fontStyle);
  doc.setFontSize(fontSize);
  return doc.splitTextToSize(safePdfText(text), width);
}

function pdfNewPage(doc) {
  doc.addPage();
  return EX_PDF_LAYOUT.top;
}

function drawPdfWrappedBlock(doc, state, title, content, options = {}) {
  const x = options.x ?? EX_PDF_LAYOUT.left;
  const width = options.width ?? EX_PDF_LAYOUT.width;
  const padding = options.padding ?? 4;
  const fontSize = options.fontSize ?? 9;
  const titleFontSize = options.titleFontSize ?? 9.5;
  const lineHeight = options.lineHeight ?? (fontSize * 0.5);
  const titleLineHeight = options.titleLineHeight ?? (titleFontSize * 0.5);
  const fill = options.fill ?? [248, 250, 252];
  const border = options.border ?? [203, 213, 225];
  const titleColor = options.titleColor ?? [30, 41, 59];
  const textColor = options.textColor ?? [51, 65, 85];
  const bodyWidth = width - padding * 2;
  const titleLines = title ? pdfLines(doc, title, bodyWidth, titleFontSize, "bold") : [];
  const titleHeight = titleLines.length ? titleLines.length * titleLineHeight + 2 : 0;
  const lines = pdfLines(doc, content, bodyWidth, fontSize, "normal");
  let lineIndex = 0;
  let continuation = false;

  while (lineIndex < lines.length) {
    let y = state.y;
    const remainingPage = EX_PDF_LAYOUT.bottom - y;
    const minCardHeight = padding * 2 + titleHeight + lineHeight;
    if (remainingPage < minCardHeight) {
      y = pdfNewPage(doc);
      state.y = y;
      continuation = lineIndex > 0;
    }

    const usable = EX_PDF_LAYOUT.bottom - state.y - padding * 2 - titleHeight;
    const linesPerPage = Math.max(1, Math.floor(usable / lineHeight));
    const chunk = lines.slice(lineIndex, lineIndex + linesPerPage);
    const blockHeight = padding * 2 + titleHeight + chunk.length * lineHeight;

    doc.setFillColor(...fill);
    doc.setDrawColor(...border);
    doc.setLineWidth(0.35);
    doc.roundedRect(x, state.y, width, blockHeight, 2, 2, "FD");

    let textY = state.y + padding + titleLineHeight;
    if (titleLines.length) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(titleFontSize);
      doc.setTextColor(...titleColor);
      const labelLines = continuation ? [...titleLines.slice(0, 1), "(suite)"] : titleLines;
      labelLines.forEach((line, index) => {
        if (index < titleLines.length) doc.text(line, x + padding, state.y + padding + titleLineHeight * (index + 0.85));
      });
      textY = state.y + padding + titleHeight;
    }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(fontSize);
    doc.setTextColor(...textColor);
    chunk.forEach((line, index) => {
      doc.text(line, x + padding, textY + lineHeight * (index + 0.85));
    });

    state.y += blockHeight + (options.gapAfter ?? 4);
    lineIndex += chunk.length;
    continuation = lineIndex < lines.length;

    if (lineIndex < lines.length) {
      state.y = pdfNewPage(doc);
    }
  }

  return state.y;
}

function drawPdfHeader(doc, title, subtitle, options = {}) {
  const x = EX_PDF_LAYOUT.left;
  const y = options.y ?? 18;
  const width = EX_PDF_LAYOUT.width;
  const titleWidth = options.titleWidth ?? width - 10;
  const titleSize = options.titleSize ?? 15;
  const subtitleSize = options.subtitleSize ?? 8.5;
  const titleLines = pdfLines(doc, title, titleWidth, titleSize, "bold").slice(0, 3);
  const subtitleLines = pdfLines(doc, subtitle, options.subtitleWidth ?? width - 10, subtitleSize, "normal").slice(0, 3);
  const height = Math.max(options.minHeight ?? 27, 8 + titleLines.length * 6 + subtitleLines.length * 4.2 + 4);

  doc.setFillColor(15, 23, 42);
  doc.roundedRect(x, y, width, height, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(titleSize);
  doc.setTextColor(255, 255, 255);
  titleLines.forEach((line, index) => doc.text(line, x + 6, y + 8 + index * 6));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(subtitleSize);
  subtitleLines.forEach((line, index) => doc.text(line, x + 6, y + 8 + titleLines.length * 6 + index * 4.2));
  return y + height + 8;
}

function addExercicePdfFooters(doc, label) {
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.25);
    doc.line(14, 285, 196, 285);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(`DnB Reviz · ${label}`, 14, 290);
    doc.text(`Page ${page} / ${pageCount}`, 196, 290, { align: "right" });
  }
}

function exercicePdfFileSlug(title) {
  return safePdfText(title, "exercice")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70) || "exercice";
}

window.exportExerciceUncorrectedPDF = () => {
  const ex = window._currentExercice;
  if (!ex) return;
  if (!window.jspdf?.jsPDF) {
    showToast("Module PDF indisponible.");
    return;
  }

  collectAllStudentAnswers();
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const subject = safePdfText(ex.subject, "Non précisée");
  const level = safePdfText(ex.level, "Standard");
  const headerSubtitle = `Matière : ${subject} · Niveau : ${level} · Barème : 20 points`;
  const state = { y: drawPdfHeader(doc, "DnB Reviz — Sujet d'entraînement et copie", headerSubtitle, { minHeight: 29 }) };

  drawPdfWrappedBlock(doc, state, "Informations", `Titre : ${safePdfText(ex.title, "Exercice")}\nÉlève : ${safePdfText(currentUser?.username, "Élève")}\nGénéré le : ${new Date(ex.createdAt || Date.now()).toLocaleDateString("fr-FR")}`, {
    fill: [241, 245, 249], border: [203, 213, 225], titleColor: [30, 41, 59], textColor: [51, 65, 85]
  });

  if (ex.instructions) {
    drawPdfWrappedBlock(doc, state, "Consignes", ex.instructions, {
      fill: [255, 251, 235], border: [245, 158, 11], titleColor: [146, 64, 14], textColor: [71, 85, 105]
    });
  }

  (ex.questions || []).forEach((question, index) => {
    const number = question.questionNumber || index + 1;
    drawPdfWrappedBlock(doc, state, `Question ${number} · ${safePdfText(question.points, "—")} point(s)`, question.text, {
      fill: [239, 246, 255], border: [59, 130, 246], titleColor: [30, 58, 138], textColor: [30, 41, 59], fontSize: 9.2
    });

    const answerText = formatStudentPlainAnswer({ ...ex, studentAnswers: window._currentExerciceAnswers, structuredAnswers: window._currentStructuredAnswers }, question);
    drawPdfWrappedBlock(doc, state, "Réponse de l'élève", answerText, {
      fill: [236, 253, 245], border: [16, 185, 129], titleColor: [5, 150, 105], textColor: [30, 41, 59]
    });
  });

  addExercicePdfFooters(doc, "Sujet non corrigé");
  doc.save(`dnb-copie-${exercicePdfFileSlug(ex.title)}.pdf`);
  showToast("Copie d'entraînement (non corrigée) exportée en PDF ✓");
};

window.exportExerciceGradedPDF = () => {
  const ex = window._currentExercice;
  if (!ex || !ex.result) {
    showToast("Aucune correction disponible pour l'export.");
    return;
  }
  if (!window.jspdf?.jsPDF) {
    showToast("Module PDF indisponible.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const result = ex.result;
  const state = { y: 18 };
  const titleLines = pdfLines(doc, "DnB Reviz — Rapport de correction", 126, 14, "bold").slice(0, 2);
  const meta = `Sujet : ${safePdfText(ex.title, "Exercice")} · Matière : ${safePdfText(ex.subject, "Non précisée")} · Posture : ${getGradingToneLabel(result.gradingToneUsed || ex.gradingTone)}`;
  const metaLines = pdfLines(doc, meta, 126, 8, "normal").slice(0, 3);
  const headerHeight = Math.max(39, 8 + titleLines.length * 5.8 + metaLines.length * 4 + 4);

  doc.setFillColor(15, 23, 42);
  doc.roundedRect(14, state.y, 182, headerHeight, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  titleLines.forEach((line, index) => doc.text(line, 19, state.y + 8 + index * 5.8));
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  metaLines.forEach((line, index) => doc.text(line, 19, state.y + 8 + titleLines.length * 5.8 + index * 4));

  doc.setFillColor(37, 99, 235);
  doc.roundedRect(151, state.y + 5, 39, 26, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text(`${safePdfText(result.totalScore, "—")} / 20`, 170.5, state.y + 16, { align: "center" });
  doc.setFontSize(7.5);
  doc.text(`Mention : ${safePdfText(result.mention, "—")}`, 170.5, state.y + 24, { align: "center" });
  state.y += headerHeight + 8;

  const selfScore = ex.selfAssessment?.estimatedScore ?? "—";
  const appreciation = safePdfText(result.generalAppreciation, "Travail examiné.");
  const bulletin = safePdfText(result.bulletinComment, appreciation);
  drawPdfWrappedBlock(doc, state, "Bilan général & Bulletin", `Appréciation du bulletin : ${bulletin}\nAuto-évaluation de l'élève : ${selfScore}/20 · Note finale : ${safePdfText(result.totalScore, "—")}/20\nAnalyse de l'écart : ${safePdfText(result.selfAssessmentCritique, "Aucune remarque.")}\nAppréciation détaillée : ${appreciation}`, {
    fill: [241, 245, 249], border: [203, 213, 225], titleColor: [30, 41, 59], textColor: [51, 65, 85], fontSize: 8.8
  });

  (ex.questions || []).forEach((question, index) => {
    const evaluation = (result.questionEvaluations || []).find(item => String(item.questionId) === String(question.id))
      || result.questionEvaluations?.[index]
      || {
        pointsAwarded: question.points || 0,
        maxPoints: question.points || 0,
        feedback: "Démarche analysée.",
        idealSolution: question.rubric || ""
      };

    const number = question.questionNumber || index + 1;
    drawPdfWrappedBlock(doc, state, `Question ${number} · Note : ${safePdfText(evaluation.pointsAwarded, "0")} / ${safePdfText(evaluation.maxPoints ?? question.points, "0")} pts`, question.text, {
      fill: [239, 246, 255], border: [59, 130, 246], titleColor: [30, 58, 138], textColor: [30, 41, 59], fontSize: 8.8
    });

    const answerText = formatStudentPlainAnswer(ex, question);
    drawPdfWrappedBlock(doc, state, "Copie de l'élève", answerText, {
      fill: [236, 253, 245], border: [16, 185, 129], titleColor: [5, 150, 105], textColor: [30, 41, 59], fontSize: 8.8
    });

    const criteriaLine = Array.isArray(evaluation.criteriaBreakdown) && evaluation.criteriaBreakdown.length > 0
      ? `\nBarème : ${evaluation.criteriaBreakdown.map(c => `${c.label} (+${c.awarded}/${c.max})`).join(" · ")}`
      : "";
    drawPdfWrappedBlock(doc, state, "Correction stylo rouge", `${evaluation.feedback || "Démarche analysée."}${criteriaLine}`, {
      fill: [254, 242, 242], border: [248, 113, 113], titleColor: [185, 28, 28], textColor: [51, 65, 85], fontSize: 8.8
    });

    if (evaluation.idealSolution) {
      drawPdfWrappedBlock(doc, state, "Corrigé type attendu", evaluation.idealSolution, {
        fill: [239, 246, 255], border: [96, 165, 250], titleColor: [29, 78, 216], textColor: [51, 65, 85], fontSize: 8.8
      });
    }
  });

  addExercicePdfFooters(doc, "Copie corrigée");
  doc.save(`dnb-correction-officielle-${exercicePdfFileSlug(ex.title)}.pdf`);
  showToast("Copie corrigée par l'IA exportée en PDF ✓");
};

function renderExercicesFeed() {
  const container = document.getElementById("exercices-feed");
  if (!container) return;

  const localList = getStoredExercices();
  const localById = new Map();
  localList.forEach(item => {
    if (item?.id) localById.set(item.id, item);
    if (item?.remoteId) localById.set(item.remoteId, item);
  });

  const remoteRaw = Array.isArray(window._liveSharedExercicesData) ? window._liveSharedExercicesData : [];
  const visibleRemote = window.filterVisibleContent(remoteRaw, "exercice");
  const seenRemoteIds = new Set();

  const merged = visibleRemote.map(rem => {
    seenRemoteIds.add(rem.id);
    const localCopy = localById.get(rem.id);
    return {
      ...rem,
      remoteId: rem.id,
      _isShared: true,
      result: localCopy?.result || null,
      studentAnswers: localCopy?.studentAnswers || [],
      structuredAnswers: localCopy?.structuredAnswers || {},
      _hasLocalDraft: Boolean(localCopy && !localCopy.result)
    };
  });

  // Include local-only / legacy offline exercises not found in remote
  localList.forEach(loc => {
    const key = loc.remoteId || loc.id;
    if (!seenRemoteIds.has(key) && (!loc.remoteId || String(loc.id).startsWith("ex_"))) {
      merged.push({
        ...loc,
        authorId: loc.authorId || loc.author || currentUser?.username || "Élève",
        authorRole: loc.authorRole || (loc.author === currentUser?.username ? (currentUser?.role || "élève") : "élève"),
        _isShared: false,
        _hasLocalDraft: Boolean(!loc.result)
      });
    }
  });

  let filtered = merged;
  if (window._exerciceFilterTab === "profs") {
    filtered = filtered.filter(ex => {
      const liveAuthor = window.usersMap.get(ex.authorId);
      const role = liveAuthor?.role || ex.authorRole;
      return role === "professeur" || role === "admin";
    });
  } else if (window._exerciceFilterTab === "mine") {
    filtered = filtered.filter(ex => ex._hasLocalDraft && !ex.result);
  } else if (window._exerciceFilterTab === "graded") {
    filtered = filtered.filter(ex => Boolean(ex.result));
  }

  if (window._exerciceSubjectFilter !== "all") {
    filtered = filtered.filter(ex => (ex.subject || "").toLowerCase() === window._exerciceSubjectFilter.toLowerCase());
  }

  const searchInput = document.getElementById("ex-search-input")?.value.toLowerCase().trim();
  if (searchInput) {
    filtered = filtered.filter(ex =>
      (ex.title || "").toLowerCase().includes(searchInput) ||
      (ex.subject || "").toLowerCase().includes(searchInput) ||
      (ex.topic || "").toLowerCase().includes(searchInput) ||
      (ex.authorDisplayName || ex.authorId || "").toLowerCase().includes(searchInput)
    );
  }

  if (window._exerciceSortOrder === "score_desc") {
    filtered.sort((a, b) => (b.result?.totalScore || -1) - (a.result?.totalScore || -1));
  } else if (window._exerciceSortOrder === "score_asc") {
    filtered.sort((a, b) => (a.result?.totalScore ?? 99) - (b.result?.totalScore ?? 99));
  } else if (window._exerciceSortOrder === "oldest") {
    filtered.sort((a, b) => (a.timestamp || a.createdAt || 0) - (b.timestamp || b.createdAt || 0));
  } else {
    filtered.sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0));
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:48px 20px; background:var(--card-bg); border-radius:20px; border:1px solid var(--hl);">
        <div style="font-size:42px; margin-bottom:12px;">✍️</div>
        <h3 style="margin:0 0 8px 0;">Aucun exercice trouvé</h3>
        <p class="caption" style="max-width:440px; margin:0 auto 20px auto;">
          ${searchInput ? "Aucun sujet ne correspond à votre recherche." : "Aucun exercice disponible dans cette catégorie pour le moment. Créez-en un avec l'IA pour le partager avec votre classe !"}
        </p>
        <button class="btn-pill" onclick="openCreateExerciceModal()">✨ Créer un exercice avec l'IA</button>
      </div>
    `;
    return;
  }

  const isAdmin = currentUser?.role === "admin" || (currentUser?.subRoles && currentUser.subRoles.includes("admin"));

  container.innerHTML = filtered.map(ex => {
    const exId = ex.id;
    const isGraded = Boolean(ex.result);
    const liveAuthor = window.usersMap.get(ex.authorId) || {};
    const liveRole = liveAuthor.role || ex.authorRole || "élève";
    const liveName = liveAuthor.displayName || ex.authorDisplayName || ex.authorId || "Élève";
    const liveAv = liveAuthor.avatar !== undefined ? liveAuthor.avatar : (ex.authorAvatar || "");
    const authorBadge = getBadge(liveAuthor);
    const avContent = liveAv ? `<img src="${esc(liveAv)}" alt="">` : escapeHtmlText(liveName).slice(0, 2).toUpperCase();
    const roleClass = liveRole === "professeur" ? "professeur" : liveRole === "admin" ? "admin" : liveRole === "HS" ? "hs" : "eleve";
    const canDel = ex._isShared ? (isAdmin || ex.authorId === currentUser?.username) : true;
    const hasLiked = (ex.likes || []).includes(currentUser?.username);
    const likeCount = (ex.likes || []).length;
    const dateStr = new Date(ex.timestamp || ex.createdAt || Date.now()).toLocaleDateString("fr-FR");

    const scoreHtml = isGraded
      ? `<div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
           <span style="font-size:19px; font-weight:900; color:var(--primary);">${ex.result.totalScore}/20</span>
           <span class="ex-badge-soft">${escapeHtmlText(ex.result.mention || "Noté")}</span>
         </div>`
      : ex._hasLocalDraft
        ? `<span class="type-tag" style="background:rgba(255,149,0,.14); color:#b25e00; font-weight:700; flex-shrink:0;">En cours</span>`
        : `<span class="type-tag" style="background:var(--primary-l); color:var(--primary-f); font-weight:700; flex-shrink:0;">Sujet partagé</span>`;

    return `
      <div class="ex-feed-card">
        <div class="post-header">
          <a href="#${esc(ex.authorId || '')}" class="post-av">${avContent}</a>
          <div style="flex:1;min-width:0">
            <a href="#${esc(ex.authorId || '')}" class="post-author-name">${escapeHtmlText(liveName)}${authorBadge}</a>
            <div class="post-meta">
              <span class="rbadge ${roleClass}">${escapeHtmlText(liveRole)}</span>
              <span class="subj-tag">${window.subjectsMap.get(ex.subject) || "📚"} ${escapeHtmlText(ex.subject)}</span>
              <span class="type-tag" style="background:var(--file-bg); color:var(--ink);">${escapeHtmlText(ex.level || "Standard")}</span>
            </div>
          </div>
          ${scoreHtml}
        </div>

        <div style="flex:1; display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <span class="type-tag" style="background:rgba(88,86,214,.1); color:#5856d6;">${getExerciseTypeLabel(ex.exerciseType)}</span>
            <span class="type-tag" style="background:rgba(52,199,89,.12); color:#248a3d;">${ex.mode === "papier" ? "📝 Papier" : "💻 Clavier"}</span>
            ${ex.durationMinutes ? `<span class="type-tag" style="background:var(--hl); color:var(--ink);">⏱️ ${ex.durationMinutes} min</span>` : ""}
          </div>
          <div class="post-title">${escapeHtmlText(ex.title)}</div>
          <p class="caption" style="margin:0; font-size:13px; line-height:1.45; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtmlText(ex.topic || "")}</p>
          <div class="caption" style="font-size:12px;">
            ${dateStr} · ${ex.questions?.length || 0} question(s) · <strong>Fait par ${ex.attemptsCount || 0} personne(s)</strong>
          </div>
        </div>

        <div class="post-card-footer">
          <div class="post-actions" style="border-top: 1px solid var(--hl); padding-top: 10px;">
            ${ex._isShared ? `
              <button class="like-btn ${hasLiked ? 'liked' : ''}" onclick="toggleExerciceLike('${esc(exId)}')">
                ${hasLiked ? '❤️' : '🤍'} ${likeCount}
              </button>
              <button class="like-btn" onclick="openShareModal('${esc(exId)}', 'ai_exercice', '${esc(ex.title)}')">↗️ Partager</button>
            ` : ""}
            ${canDel ? `<button class="btn-ghost btn-sm del" style="margin-left:auto;" onclick="${ex._isShared ? `deleteSharedExercice('${esc(exId)}')` : `deleteExerciceFromHistory('${esc(exId)}')`}" title="Supprimer">🗑️</button>` : ""}
          </div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            ${isGraded ? `
              <button class="btn-pill btn-sm" style="flex:1; justify-content:center;" onclick="openPastExerciceResult('${esc(exId)}')">📊 Voir ma copie</button>
              <button class="btn-ghost btn-sm" style="flex:1; justify-content:center;" onclick="startSharedExercice('${esc(exId)}', true)">🔄 Refaire</button>
            ` : ex._hasLocalDraft ? `
              <button class="btn-pill btn-sm" style="flex:1; justify-content:center;" onclick="openPastExerciceSession('${esc(exId)}')">🚀 Continuer</button>
              <button class="btn-ghost btn-sm" onclick="startSharedExercice('${esc(exId)}', true)">🔄 Recommencer</button>
            ` : `
              <button class="btn-pill btn-sm" style="width:100%; justify-content:center;" onclick="startSharedExercice('${esc(exId)}', true)">🚀 Faire l'exercice</button>
            `}
          </div>
        </div>
      </div>
    `;
  }).join("");
}

window.loadExercicesFeed = () => {
  if (!window._exUnsub) {
    window._exUnsub = onSnapshot(collection(db, "ai_exercices"), snap => {
      window._liveSharedExercicesData = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderExercicesFeed();
    }, err => {
      console.warn("Erreur écoute exercices partagés :", err);
      renderExercicesFeed();
    });
  }
  renderExercicesFeed();
};

window.startSharedExercice = async (id, forceFresh = true) => {
  let source = (window._liveSharedExercicesData || []).find(item => item.id === id);
  if (!source) {
    const localList = getStoredExercices();
    source = localList.find(item => item.id === id || item.remoteId === id);
  }
  if (!source && id && !String(id).startsWith("ex_")) {
    try {
      const snap = await getDoc(doc(db, "ai_exercices", id));
      if (snap.exists()) source = { id: snap.id, ...snap.data() };
    } catch (_) {}
  }
  if (!source) {
    showToast("Cet exercice n'est plus disponible.");
    return;
  }

  if (!forceFresh) {
    const localList = getStoredExercices();
    const localMatch = localList.find(item => item.id === id || item.remoteId === id);
    if (localMatch?.result) {
      window._currentExercice = localMatch;
      displayExerciceResults(localMatch);
      return;
    }
    if (localMatch) {
      window.startExerciceSession(localMatch);
      return;
    }
  }

  const freshAttempt = {
    id: source.id,
    remoteId: String(source.id || "").startsWith("ex_") ? (source.remoteId || "") : source.id,
    title: source.title,
    subject: source.subject,
    topic: source.topic,
    level: source.level,
    instructions: source.instructions,
    questions: JSON.parse(JSON.stringify(source.questions || [])),
    mode: source.mode || "clavier",
    durationMinutes: source.durationMinutes || 0,
    exerciseType: source.exerciseType || "mix",
    gradingTone: source.gradingTone || "bac",
    authorId: source.authorId || source.author || "",
    authorDisplayName: source.authorDisplayName || "",
    authorRole: source.authorRole || "élève",
    createdAt: Date.now(),
    timestamp: source.timestamp || source.createdAt || Date.now(),
    studentAnswers: [],
    structuredAnswers: {},
    result: null
  };
  saveExerciceToHistory(freshAttempt);
  window.startExerciceSession(freshAttempt);
};

window.toggleExerciceLike = async (exId) => {
  if (!currentUser?.username) return;
  const ref = doc(db, "ai_exercices", exId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  let likes = snap.data().likes || [];
  if (likes.includes(currentUser.username)) {
    likes = likes.filter(u => u !== currentUser.username);
  } else {
    likes.push(currentUser.username);
    trackActivityEvent("like");
  }
  await updateDoc(ref, { likes });
};

window.deleteSharedExercice = async (exId) => {
  if (!confirm("Supprimer ce sujet partagé pour toute la classe ?")) return;
  try {
    await deleteDoc(doc(db, "ai_exercices", exId));
    const list = getStoredExercices().filter(ex => ex.id !== exId && ex.remoteId !== exId);
    localStorage.setItem(getExerciceStorageKey(), JSON.stringify(list));
    syncContrib();
    showToast("Sujet supprimé ✓");
  } catch (e) {
    showToast("Impossible de supprimer cet exercice.");
  }
};

window.openPastExerciceSession = (id) => {
  const list = getStoredExercices();
  const found = list.find(ex => ex.id === id || ex.remoteId === id);
  if (found) {
    window.startExerciceSession(found);
  }
};

window.openPastExerciceResult = (id) => {
  const list = getStoredExercices();
  const found = list.find(ex => ex.id === id || ex.remoteId === id);
  if (found && found.result) {
    window._currentExercice = found;
    displayExerciceResults(found);
  }
};

window.deleteExerciceFromHistory = (id) => {
  if (confirm("Supprimer définitivement cet exercice de ton historique ?")) {
    const list = getStoredExercices().filter(ex => ex.id !== id && ex.remoteId !== id);
    localStorage.setItem(getExerciceStorageKey(), JSON.stringify(list));
    renderExercicesFeed();
    showToast("Exercice supprimé ✓");
  }
};

window.setExercicesFilter = (tab) => {
  window._exerciceFilterTab = tab;
  document.querySelectorAll(".ex-tab-filter").forEach(btn => {
    btn.classList.toggle("active", btn.id === `filter-ex-${tab}`);
  });
  renderExercicesFeed();
};

window.handleExerciceSearch = () => {
  renderExercicesFeed();
};

window.openExerciceFilterModal = () => {
  if (typeof window.syncExerciseSubjectSelects === "function") {
    window.syncExerciseSubjectSelects();
  }
  openModal("m-ex-filter");
};

window.applyExerciceModalFilter = () => {
  const subj = document.getElementById("ex-filter-modal-subject")?.value || "all";
  const sort = document.getElementById("ex-filter-modal-sort")?.value || "newest";
  window._exerciceSubjectFilter = subj;
  window._exerciceSortOrder = sort;
  closeModal("m-ex-filter");
  renderExercicesFeed();
  showToast("Filtres appliqués ✓");
};

// =========================================================================
// EASTER EGG : COOKIE CLICKER STUDIO (lié à DnB Reviz + Firebase index 76)
// =========================================================================
(() => {
  const COOKIE_FB = {
    apiKey: "AIzaSyDXdEnimnKl8dG7xXprd5uhWFANddUr2Sg",
    authDomain: "dancookieclicker.firebaseapp.com",
    projectId: "dancookieclicker",
    storageBucket: "dancookieclicker.firebasestorage.app",
    messagingSenderId: "438891454674",
    appId: "1:438891454674:web:603b70cad0b1cd422fcd0b",
    measurementId: "G-58T7DPL4LH"
  };

  let cookieApp = null;
  let cookieDb = null;
  let cookieAuth = null;
  const googleProvider = new GoogleAuthProvider();

  function getCookieApp() {
    if (!cookieApp) cookieApp = initializeApp(COOKIE_FB, "dnbCookieClickerApp");
    return cookieApp;
  }
  function getCookieDb() {
    if (!cookieDb) cookieDb = getFirestore(getCookieApp());
    return cookieDb;
  }
  function getCookieAuth() {
    if (!cookieAuth) cookieAuth = getAuth(getCookieApp());
    return cookieAuth;
  }

  const defaultSave = {
    username: "", saveCode: "", displayName: "", password: "", profilePic: "",
    dnbUsername: "", dnbAvatar: "",
    cookies: 0, totalCookies: 0, upgradesBought: [], playtime: 0,
    banned: false, lastAdminSync: 0, lastGCSync: 0, lastForceSave: 0, groupId: null,
    spinsLeft: 2, lastSpinReset: 0, companions: [], equippedCompanion: null,
    sugars: 0, sugarTime: 0,
    buildings: {
      cursor: { count: 0, level: 0 }, grandma: { count: 0, level: 0 }, farm: { count: 0, level: 0 },
      mine: { count: 0, level: 0 }, factory: { count: 0, level: 0 }, bank: { count: 0, level: 0 },
      temple: { count: 0, level: 0 }, wizard: { count: 0, level: 0 }, shipment: { count: 0, level: 0 },
      alch: { count: 0, level: 0 }, portal: { count: 0, level: 0 }, time: { count: 0, level: 0 },
      prism: { count: 0, level: 0 }, clone: { count: 0, level: 0 }, brain: { count: 0, level: 0 },
      corrupted_cursor: { count: 0, level: 0 }, void_portal: { count: 0, level: 0 },
      cthulhu: { count: 0, level: 0 }, jds_corp: { count: 0, level: 0 }
    }
  };

  const buildingData = {
    cursor: { id: "cursor", name: "Curseur", icon: "🖱️", baseCost: 15, baseCps: 1, desc: "Clique automatiquement toutes les 10 secondes." },
    grandma: { id: "grandma", name: "Grand-mère", icon: "👵", baseCost: 100, baseCps: 3, desc: "Une gentille mamie pour cuire plus de cookies." },
    farm: { id: "farm", name: "Ferme", icon: "🌱", baseCost: 1100, baseCps: 10, desc: "Fait pousser des plants de cookies." },
    mine: { id: "mine", name: "Mine", icon: "⛏️", baseCost: 120000, baseCps: 28, desc: "Extrait de la pâte à cookie." },
    factory: { id: "factory", name: "Usine", icon: "🏭", baseCost: 1300000, baseCps: 130, desc: "Produit des cookies en masse." },
    bank: { id: "bank", name: "Banque", icon: "🏦", baseCost: 14000000, baseCps: 170, desc: "Génère des cookies avec les intérêts." },
    temple: { id: "temple", name: "Temple", icon: "🏛️", baseCost: 200000000, baseCps: 7000, desc: "Prie pour avoir plus de cookies." },
    wizard: { id: "wizard", name: "Tour de sorcier", icon: "🧙‍♂️", baseCost: 3300000000, baseCps: 100000, desc: "Invoque des cookies magiquement." },
    shipment: { id: "shipment", name: "Vaisseau", icon: "🚀", baseCost: 51000000000, baseCps: 260000, desc: "Ramène des cookies de la planète cookie." },
    alch: { id: "alch", name: "Labo Alchimie", icon: "⚗️", baseCost: 75000000000, baseCps: 1600000, desc: "Transforme l'or en cookies." },
    portal: { id: "portal", name: "Portail", icon: "🌀", baseCost: 1000000000000, baseCps: 1900000, desc: "Ouvre une porte vers le cookie-verse." },
    time: { id: "time", name: "Machine Temporelle", icon: "⏳", baseCost: 14000000000000, baseCps: 650000, desc: "Ramène des cookies du passé." },
    prism: { id: "prism", name: "Prisme", icon: "🌈", baseCost: 200000000000000, baseCps: 430000000, desc: "Convertit la lumière en cookies." },
    clone: { id: "clone", name: "Cloneur", icon: "👥", baseCost: 100000000000000000, baseCps: 35000000, desc: "Clone tes cookies." },
    brain: { id: "brain", name: "Cerveau Galactique", icon: "🧠", baseCost: 500000000000000000, baseCps: 250000000, desc: "Pense fort à des cookies." },
    corrupted_cursor: { id: "corrupted_cursor", name: "Curseur Corrompu", icon: "👾", baseCost: 5000000000000000000, baseCps: 1500000000, desc: "Un curseur volé sur le dark web." },
    void_portal: { id: "void_portal", name: "Faille du Néant", icon: "🕳️", baseCost: 50000000000000000000, baseCps: 10000000000, desc: "Aspire des cookies d'une autre dimension." },
    cthulhu: { id: "cthulhu", name: "Entité Cosmique", icon: "🐙", baseCost: 1000000000000000000000, baseCps: 100000000000, desc: "Ph'nglui mglw'nafh Cthulhu R'lyeh wgah'nagl fhtagn." },
    jds_corp: { id: "jds_corp", name: "JDS corp.", icon: "🏢", baseCost: 25000000000000000000000000, baseCps: 70000000000000000000000000, desc: "La multinationale ultime qui domine le marché des cookies." }
  };

  const upgradeData = [
    { id: "up1", icon: "🦾", cost: 500, desc: "Clic x2", type: "click_mult", val: 2 },
    { id: "up2", icon: "👵🏼", cost: 5000, desc: "Mamies x2", type: "b_mult", target: "grandma", val: 2 },
    { id: "up3", icon: "🚜", cost: 50000, desc: "Fermes x2", type: "b_mult", target: "farm", val: 2 },
    { id: "up4", icon: "⛏️", cost: 500000, desc: "Mines x2", type: "b_mult", target: "mine", val: 2 },
    { id: "up5", icon: "🏭", cost: 5000000, desc: "Usines x2", type: "b_mult", target: "factory", val: 2 },
    { id: "up6", icon: "💸", cost: 50000000, desc: "Banques x2", type: "b_mult", target: "bank", val: 2 },
    { id: "up7", icon: "🖱️", cost: 100000, desc: "Clic x2 (Encore)", type: "click_mult", val: 2 },
    { id: "up8", icon: "🖱️", cost: 10002212100, desc: "Clic x3 (Encore)", type: "click_mult", val: 3 },
    { id: "up9", icon: "👀", cost: 1000, desc: "C'est Dan qui donne c'est carré ! Production globale +71%", type: "global_mult", val: 1.71 },
    { id: "up10", icon: "👑J", cost: 1000000000000000000000000, desc: "C'est Jayden qui donne c'est carré ! Production globale x8", type: "global_mult", val: 8 }
  ];

  const companionsDB = {
    algaz: { id: "algaz", name: "AlgaZ", icon: "💥", cpsMult: 1.25, clickBonus: 1000000, gcMult: 1, desc: "x1.25 CpS | +1M Puissance de Clic", rarity: "Épique", rClass: "r-epic", sellPrice: 10000000000000 },
    dan: { id: "dan", name: "Dan", icon: "💣", cpsMult: 1.75, clickBonus: 10000000, gcMult: 2, desc: "x1.75 CpS | Apparition Cookies Dorés x2", rarity: "Mythique", rClass: "r-mythic", sellPrice: 50000000000000 },
    dan_shiny: { id: "dan_shiny", name: "Dan ✨", icon: "💣", cpsMult: 3, clickBonus: 200000000, gcMult: 20, desc: "x3.00 CpS | Cookies Dorés x20 | SHINY ✨", rarity: "Secret", rClass: "r-secret shiny-img", sellPrice: 10000000000000000000000000000 },
    jayden: { id: "jayden", name: "Jayden", icon: "https://i.ibb.co/qM5P7xxK/m-13.png", cpsMult: 2.0, clickBonus: 3000000, gcMult: 2, desc: "x2.00 CpS | +3M Clic | Cookies Dorés x2", rarity: "Secret", rClass: "r-secret", sellPrice: 250000000000000 },
    jayden_shiny: { id: "jayden_shiny", name: "Jayden ✨", icon: "https://i.ibb.co/qM5P7xxK/m-13.png", cpsMult: 3, clickBonus: 5000000, gcMult: 4, desc: "x3.00 CpS | +5M Clic | Cookies Dorés x4 | SHINY ✨", rarity: "Secret+", rClass: "r-secret shiny-img", sellPrice: 50000000000000000000000000000 }
  };

  const imgCookieBase = "https://png.pngtree.com/png-vector/20250425/ourmid/pngtree-chocolate-chip-cookie-icon-white-background-png-image_16100260.png";
  const imgCookieGolden = "https://i.ibb.co/Y4fx1dPt/image-removebg-preview-2.png";
  const imgCursorOrbit = "https://static.vecteezy.com/system/resources/thumbnails/055/608/060/small/cursor-icon-pointer-cursor-finger-pointer-clicking-mouse-cursor-png.png";
  const imgMysteryComp = "https://oise-echecs.fr/wp-content/uploads/2020/05/point-interrogation.png";

  const itemsDef = [
    { id: "2_5b", label: "2.5B<br>Cookies", img: imgCookieBase, odds: "~47.9%" },
    { id: "7_5b", label: "7.5B<br>Cookies", img: imgCookieGolden, odds: "35%" },
    { id: "algaz", label: "AlgaZ<br>(Épique)", icon: "💥", odds: "15%" },
    { id: "dan", label: "Dan<br>(Mythique)", icon: "💣", odds: "2%" },
    { id: "dan_shiny", label: "Dan ✨<br>(Secret)", icon: "💣", extraClass: "shiny-img", odds: "0.0015%" },
    { id: "jayden", label: "Jayden<br>(Secret)", img: "https://i.ibb.co/qM5P7xxK/m-13.png", odds: "0.0003%" }
  ];
  const vibrantPalette = ["#FF3B30", "#00D4FF", "#00FF88", "#FF9500", "#34C759", "#FFD700", "#FF2D55", "#5AC8FA"];

  let game = JSON.parse(JSON.stringify(defaultSave));
  let currentCps = 0;
  let clickPower = 1;
  let storeMode = "buy";
  let unsavedProgress = false;
  let isGoldenFrenzy = false;
  let companionAutoClickInterval = null;
  let frenzyEndTimeout = null;
  let ccIsAdmin = false;
  let realtimeListener = null;
  let chatListener = null;
  let tradeListenerSender = null;
  let tradeListenerReceiver = null;
  let lastCursorCount = -1;
  let lastStageWidth = -1;
  let groupsMap = {};
  let groupCpsBonus = 0;
  let allLeaderboardPlayers = [];
  let ccInitialized = false;
  let goldenTimeout = null;

  let isSpinning = false;
  let wheelPendingPrize = null;
  let wheelStartPosY = 0;
  let wheelStartPosX = 0;
  let currentWheelLayout = [];
  let currentWheelEditId = null;
  let currentWheelEditData = null;

  let currentTradeDocId = null;
  let currentTradeData = null;
  let isTradeModalOpen = false;
  let tradeUpdateTimeout = null;

  let tempLoginCode = "";
  let tempLoginData = null;
  let tempProfilePicBase64 = "";
  let initialChatLoad = true;
  let appJustLoaded = true;
  setTimeout(() => { appJustLoaded = false; }, 3500);

  const $id = id => document.getElementById(id);

  function mergeSaveData(parsed) {
    const mergedBuildings = {};
    for (const key in buildingData) {
      const b = parsed?.buildings?.[key] || {};
      mergedBuildings[key] = {
        count: ccValidateNum(b.count || 0),
        level: ccValidateNum(b.level || 0)
      };
    }
    const merged = {
      ...JSON.parse(JSON.stringify(defaultSave)),
      ...(parsed || {}),
      buildings: mergedBuildings
    };
    if (!Array.isArray(merged.upgradesBought)) merged.upgradesBought = [];
    if (!Array.isArray(merged.companions)) merged.companions = [];
    if (merged.sugars === undefined) merged.sugars = 0;
    if (merged.sugarTime === undefined) merged.sugarTime = 0;
    if (merged.spinsLeft === undefined) merged.spinsLeft = 2;
    if (merged.lastSpinReset === undefined) merged.lastSpinReset = 0;
    if (merged.profilePic === undefined) merged.profilePic = "";
    return merged;
  }

  function findDnBUserProfile(identifier, displayHint) {
    if (!window.usersMap || window.usersMap.size === 0) return null;
    const key = String(identifier || "").trim();
    if (key && window.usersMap.has(key)) return window.usersMap.get(key);
    const lowKey = key.toLowerCase();
    const lowDisp = String(displayHint || "").trim().toLowerCase();
    for (const u of window.usersMap.values()) {
      if (!u) continue;
      if (lowKey && String(u.username || "").toLowerCase() === lowKey) return u;
      if (lowDisp && (String(u.username || "").toLowerCase() === lowDisp || String(u.displayName || "").toLowerCase() === lowDisp)) return u;
      if (lowKey && String(u.displayName || "").toLowerCase() === lowKey) return u;
    }
    return null;
  }

  function renderCCAvatarHTML(username, displayName, storedAvatar, sizeClass = "") {
    const matched = findDnBUserProfile(username, displayName);
    const avatarUrl = storedAvatar || matched?.avatar || "";
    const label = String(matched?.displayName || displayName || username || "?").trim();
    const initials = label.split(/\s+/).filter(Boolean).map(w => w.charAt(0)).join("").slice(0, 2).toUpperCase() || "?";
    const imgHtml = avatarUrl
      ? `<img src="${esc(avatarUrl)}" alt="" loading="lazy" onerror="this.remove()">`
      : "";
    return `<span class="cc-avatar ${sizeClass}" title="${esc(label)}">${imgHtml}<span class="cc-avatar-init">${escapeHTML(initials)}</span></span>`;
  }

  function ccValidateNum(n) {
    const num = Number(n);
    return (isNaN(num) || !isFinite(num) || num < 0) ? 0 : num;
  }

  function ccFormatNumber(num) {
    num = ccValidateNum(num);
    if (num < 1000000) return Math.floor(num).toLocaleString("fr-FR");
    const units = ["", " Million", " Milliard", " Billion", " Billiard", " Trillion", " Quatrillion", " Quintillion", " Sextillion", " Septillion", " Octillion"];
    const unitIndex = Math.floor((Math.log10(num) - 3) / 3);
    if (unitIndex >= units.length) return num.toExponential(3);
    let shortVal = (num / Math.pow(10, unitIndex * 3 + 3)).toFixed(2);
    if (shortVal.endsWith(".00")) shortVal = shortVal.substring(0, shortVal.length - 3);
    let suffix = units[unitIndex];
    if (parseFloat(shortVal) >= 2 && suffix !== "") suffix += "s";
    return shortVal + suffix;
  }

  function getDnBRevizStudyBonus() {
    const u = window.currentUser;
    const totalMs = Number(u?.totalStudyMs) || 0;
    const studyMinutes = Math.floor(totalMs / 60000);
    const streakDays = Number(u?.streak) || 0;
    const studyPct = Math.min(150, Math.floor(studyMinutes / 5));
    const streakPct = streakDays * 5;
    const totalPct = studyPct + streakPct;
    return {
      totalPct,
      multiplier: 1 + totalPct / 100,
      studyMinutes,
      streakDays
    };
  }

  function ccShowDialog({ title = "Information", message = "", type = "alert", defaultValue = "", placeholder = "" }) {
    return new Promise(resolve => {
      const modal = $id("cc-dialog-modal");
      const titleEl = $id("cc-dialog-title");
      const msgEl = $id("cc-dialog-message");
      const wrap = $id("cc-dialog-input-wrap");
      const inp = $id("cc-dialog-input");
      const btnCancel = $id("cc-dialog-cancel");
      const btnOk = $id("cc-dialog-confirm");
      if (!modal || !titleEl || !msgEl || !btnOk) { resolve(null); return; }

      titleEl.textContent = title;
      msgEl.textContent = message;
      const isPrompt = type === "prompt";
      const isConfirm = type === "confirm";
      wrap.classList.toggle("hidden", !isPrompt);
      btnCancel.classList.toggle("hidden", !(isConfirm || isPrompt));
      if (isPrompt) {
        inp.value = defaultValue || "";
        inp.placeholder = placeholder || "";
      }

      const cleanup = (val) => {
        modal.classList.remove("active");
        btnOk.onclick = null;
        btnCancel.onclick = null;
        inp.onkeydown = null;
        resolve(val);
      };

      btnOk.onclick = () => cleanup(isPrompt ? inp.value : true);
      btnCancel.onclick = () => cleanup(isPrompt ? null : false);
      inp.onkeydown = (e) => {
        if (e.key === "Enter") cleanup(inp.value);
        if (e.key === "Escape") cleanup(null);
      };

      modal.classList.add("active");
      if (isPrompt) setTimeout(() => inp.focus(), 40);
    });
  }

  function getGroupHTML(groupId) {
    if (!groupId || !groupsMap[groupId]) return "";
    const g = groupsMap[groupId];
    const safeName = String(g.name || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (g.color === "rainbow") return ` <span class="text-rainbow">[${safeName}]</span>`;
    if (g.color === "golden-aura") return ` <span class="text-golden-aura">[${safeName}]</span>`;
    if (g.color === "aura") return ` <span class="text-aura">[${safeName}]</span>`;
    if (g.color === "dan") return ` <span class="text-dan-secret">[${safeName}]</span>`;
    return ` <span style="color:${g.color}; font-weight:bold;">[${safeName}]</span>`;
  }

  async function fetchGroups() {
    try {
      const snap = await getDocs(collection(getCookieDb(), "stmg_groups"));
      groupsMap = {};
      snap.forEach(d => { groupsMap[d.id] = d.data(); });
    } catch (e) {
      console.error("Erreur chargement groupes Cookie Clicker:", e);
    }
  }

  function getBuildingBuyCost(id) {
    const count = ccValidateNum(game.buildings[id]?.count || 0);
    return Math.ceil(buildingData[id].baseCost * Math.pow(1.15, count));
  }

  function getBuildingSellCost(id) {
    const count = ccValidateNum(game.buildings[id]?.count || 0);
    if (count === 0) return 0;
    return Math.ceil(buildingData[id].baseCost * Math.pow(1.15, count - 1) * 0.5);
  }

  window.ccBuyBuildingLevel = (id) => {
    if (!game.buildings[id]) game.buildings[id] = { count: 0, level: 0 };
    const lvl = ccValidateNum(game.buildings[id].level || 0);
    const cost = lvl + 1;
    if (ccValidateNum(game.sugars) >= cost) {
      game.sugars -= cost;
      game.buildings[id].level = lvl + 1;
      unsavedProgress = true;
      saveLocal();
      recalculateStats();
      updateUI();
    }
  };

  function hasUpgrade(id) {
    return Array.isArray(game.upgradesBought) && game.upgradesBought.includes(id);
  }

  function calculateCpsForSave(saveObj) {
    const bMults = {};
    for (const key in buildingData) bMults[key] = 1;
    let gMult = 1;
    let compCpsMult = 1;

    if (saveObj.equippedCompanion && companionsDB[saveObj.equippedCompanion]) {
      compCpsMult = companionsDB[saveObj.equippedCompanion].cpsMult;
    }

    (saveObj.upgradesBought || []).forEach(upId => {
      const up = upgradeData.find(u => u.id === upId);
      if (up) {
        if (up.type === "b_mult" && bMults[up.target] !== undefined) bMults[up.target] *= up.val;
        if (up.type === "global_mult") gMult *= up.val;
      }
    });

    let cps = 0;
    for (const id in saveObj.buildings) {
      if (saveObj.buildings[id] && buildingData[id]) {
        const level = ccValidateNum(saveObj.buildings[id].level || 0);
        const levelMult = 1 + (level * 0.01);
        cps += ccValidateNum(saveObj.buildings[id].count) * buildingData[id].baseCps * (bMults[id] || 1) * levelMult;
      }
    }
    return ccValidateNum(cps * gMult * compCpsMult) + ccValidateNum(groupCpsBonus);
  }

  function recalculateStats() {
    const bMults = {};
    for (const key in buildingData) bMults[key] = 1;
    let cMult = 1;
    let gMult = 1;
    let compCpsMult = 1;
    let compClickBonus = 0;
    let frenzyMult = 2;

    if (game.equippedCompanion && companionsDB[game.equippedCompanion]) {
      const comp = companionsDB[game.equippedCompanion];
      compCpsMult = comp.cpsMult;
      compClickBonus = comp.clickBonus;
      if (comp.gcMult && comp.gcMult > 1) frenzyMult = comp.gcMult;
    }

    (game.upgradesBought || []).forEach(upId => {
      const up = upgradeData.find(u => u.id === upId);
      if (up) {
        if (up.type === "b_mult" && bMults[up.target] !== undefined) bMults[up.target] *= up.val;
        if (up.type === "click_mult") cMult *= up.val;
        if (up.type === "global_mult") gMult *= up.val;
      }
    });

    const revizBonus = getDnBRevizStudyBonus();
    let cps = 0;
    for (const id in game.buildings) {
      if (game.buildings[id] && buildingData[id]) {
        const level = ccValidateNum(game.buildings[id].level || 0);
        const levelMult = 1 + (level * 0.01);
        cps += ccValidateNum(game.buildings[id].count) * buildingData[id].baseCps * (bMults[id] || 1) * levelMult;
      }
    }

    const bonusSecu = ccValidateNum(groupCpsBonus);
    currentCps = ccValidateNum(cps * gMult * compCpsMult * revizBonus.multiplier) + bonusSecu;

    const cursorCount = ccValidateNum(game.buildings.cursor?.count || 0);
    clickPower = ccValidateNum((1 + cursorCount + Math.floor(currentCps * 0.05)) * cMult * revizBonus.multiplier) + compClickBonus;
    if (isGoldenFrenzy) clickPower *= frenzyMult;

    const dispCps = $id("cc-cps-display");
    const dispCpsBonus = $id("cc-cps-bonus-display");
    const dispClick = $id("cc-click-power-display");
    const frenzyPill = $id("cc-frenzy-pill");
    if (dispCps) dispCps.innerText = ccFormatNumber(currentCps);
    if (dispClick) dispClick.innerText = ccFormatNumber(clickPower);
    if (frenzyPill) frenzyPill.innerText = `✨ Frénésie Dorée active (Clics x${frenzyMult})`;

    if (dispCpsBonus) {
      if (bonusSecu > 0) {
        dispCpsBonus.classList.remove("hidden");
        dispCpsBonus.innerText = `+${ccFormatNumber(bonusSecu)} CpS (Bonus Classement Groupe)`;
      } else {
        dispCpsBonus.classList.add("hidden");
      }
    }

    const bonusEl = $id("cc-reviz-bonus-text");
    if (bonusEl) {
      bonusEl.innerText = `Bonus Révision : +${revizBonus.totalPct}% (×${revizBonus.multiplier.toFixed(2)})`;
    }
  }

  function updateLiquidColor() {
    const wrapper = $id("ccWrapper");
    const waves = document.querySelectorAll("#cc-easter-modal .wave");
    let color = "var(--primary)";
    let customStyle = null;

    if (isGoldenFrenzy) {
      color = "#eab308";
    } else if (game.totalCookies >= 5000000000 && game.groupId && groupsMap[game.groupId]) {
      const gColor = groupsMap[game.groupId].color;
      if (["rainbow", "golden-aura", "aura", "dan"].includes(gColor)) {
        customStyle = gColor;
      } else if (gColor) {
        color = gColor;
      }
    } else if (game.totalCookies >= 1000000000) {
      color = "var(--secondary)";
    } else if (game.totalCookies >= 1000000) {
      color = "var(--danger)";
    }

    if (wrapper) {
      if (customStyle === "rainbow") wrapper.style.borderColor = "var(--secondary)";
      else if (customStyle === "golden-aura") wrapper.style.borderColor = "#eab308";
      else if (customStyle === "aura") wrapper.style.borderColor = "#0ABAB5";
      else if (customStyle === "dan") wrapper.style.borderColor = "#16eae3";
      else wrapper.style.borderColor = color;
    }

    waves.forEach(w => {
      if (customStyle === "rainbow") w.style.background = "linear-gradient(45deg, var(--primary), var(--secondary), #facc15, #fb923c, #ef4444)";
      else if (customStyle === "golden-aura") w.style.background = "linear-gradient(45deg, #ffd700, #ff8c00, #fffacd)";
      else if (customStyle === "aura") w.style.background = "linear-gradient(45deg, #0ABAB5, #E0B0FF)";
      else if (customStyle === "dan") w.style.background = "#1e293b";
      else w.style.background = color;

      const baseOp = w.classList.contains("wave3") ? 0.20 : (w.classList.contains("wave1") ? 0.15 : (w.classList.contains("wave4") ? 0.12 : 0.10));
      w.style.opacity = (color === "#eab308" || customStyle) ? Math.min(0.45, baseOp * 1.8) : baseOp;
    });
  }

  function updateOrbitingCursors(force = false) {
    const count = ccValidateNum(game.buildings.cursor ? game.buildings.cursor.count : 0);
    const stage = $id("cc-cookie-stage");
    const stageWidth = stage?.offsetWidth || 280;
    if (!force && count === lastCursorCount && stageWidth === lastStageWidth) return;
    lastCursorCount = count;
    lastStageWidth = stageWidth;

    const container = $id("cc-orbiting-cursors");
    if (!container) return;
    container.innerHTML = "";

    const visualCount = Math.min(count, 50);
    const radius = Math.max(84, Math.round(stageWidth * 0.44));
    for (let i = 0; i < visualCount; i++) {
      const angle = (i / visualCount) * (2 * Math.PI);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const angleDeg = angle * (180 / Math.PI);
      const rot = angleDeg - 90;

      const img = document.createElement("img");
      img.src = imgCursorOrbit;
      img.className = "cursor-orbit-img";
      img.alt = "";
      img.draggable = false;
      img.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) rotate(${rot.toFixed(1)}deg)`;
      img.onerror = () => {
        const dot = document.createElement("span");
        dot.className = "cursor-orbit-dot";
        dot.textContent = "🖱️";
        dot.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px)) rotate(${(angleDeg + 90).toFixed(1)}deg)`;
        img.replaceWith(dot);
      };
      container.appendChild(img);
    }
  }

  function showTooltip(e, html) {
    const tt = $id("cc-game-tooltip");
    if (!tt) return;
    tt.innerHTML = html;
    tt.style.opacity = "1";
    tt.style.left = Math.min(window.innerWidth - 270, e.clientX + 14) + "px";
    tt.style.top = Math.min(window.innerHeight - 140, e.clientY + 14) + "px";
  }
  function hideTooltip() {
    const tt = $id("cc-game-tooltip");
    if (tt) tt.style.opacity = "0";
  }

  function renderActiveCompanionStage() {
    const box = $id("cc-active-companion");
    if (!box) return;
    if (game.equippedCompanion && companionsDB[game.equippedCompanion]) {
      const c = companionsDB[game.equippedCompanion];
      const shinyClass = c.rClass.includes("shiny") ? "shiny-img" : "";
      if (c.icon.startsWith("http")) {
        box.innerHTML = `<img src="${esc(c.icon)}" class="${shinyClass}" alt="${esc(c.name)}">`;
      } else {
        box.innerHTML = `<div class="${shinyClass}">${c.icon}</div>`;
      }
      box.style.display = "flex";
    } else {
      box.innerHTML = "";
      box.style.display = "none";
    }
  }

  function renderCompanions() {
    if (!Array.isArray(game.companions)) game.companions = [];
    renderActiveCompanionStage();
    const listEl = $id("cc-comp-list");
    if (!listEl) return;
    listEl.innerHTML = "";

    const compCounts = {};
    game.companions.forEach(c => { compCounts[c] = (compCounts[c] || 0) + 1; });

    const ownedIds = Object.keys(compCounts);
    if (ownedIds.length === 0) {
      listEl.innerHTML = `<p class="caption" style="grid-column:1/-1;text-align:center;padding:18px 0;">Tu n'as aucun compagnon pour l'instant. Tourne la <strong>🎡 Roue Cosmique</strong> ou fais un <strong>🤝 Trade</strong> !</p>`;
      return;
    }

    ownedIds.forEach(cId => {
      const count = compCounts[cId];
      const c = companionsDB[cId];
      if (!c) return;
      const isEq = game.equippedCompanion === cId;
      const div = document.createElement("div");
      div.className = `companion-card ${isEq ? "equipped" : ""}`;
      const shinyCls = c.rClass.includes("shiny") ? "shiny-img" : "";
      const iconHtml = c.icon.startsWith("http")
        ? `<img src="${esc(c.icon)}" class="comp-icon ${shinyCls}" alt="${esc(c.name)}">`
        : `<div class="comp-icon ${shinyCls}">${c.icon}</div>`;
      const badgeHTML = count > 1 ? `<span class="comp-count-pill">x${count}</span>` : "";

      div.innerHTML = `
        <div class="comp-info">
          ${iconHtml}
          <div style="min-width:0;flex:1;">
            <div class="comp-name">${escapeHTML(c.name)} ${badgeHTML} <span class="comp-rarity ${c.rClass}">${escapeHTML(c.rarity)}</span></div>
            <div class="caption" style="margin-top:3px;">${escapeHTML(c.desc)}</div>
            <button type="button" class="btn-ghost btn-sm del cc-sell-comp-btn" style="margin-top:6px;">Vendre (+${ccFormatNumber(c.sellPrice)})</button>
          </div>
        </div>
        <div style="font-size:20px;flex-shrink:0;">${isEq ? "✅" : ""}</div>
      `;

      div.querySelector(".comp-info").onclick = (e) => {
        if (e.target.closest(".cc-sell-comp-btn")) return;
        game.equippedCompanion = isEq ? null : cId;
        unsavedProgress = true;
        saveLocal();
        saveGameToServer();
        recalculateStats();
        renderCompanions();
        updateUI();
      };

      div.querySelector(".cc-sell-comp-btn").onclick = async (e) => {
        e.stopPropagation();
        if (await ccShowDialog({
          type: "confirm",
          title: "Vendre un compagnon",
          message: `Vendre ${c.name} pour ${ccFormatNumber(c.sellPrice)} cookies ?`
        })) {
          game.cookies = ccValidateNum(game.cookies) + c.sellPrice;
          game.totalCookies = ccValidateNum(game.totalCookies) + c.sellPrice;
          const idx = game.companions.indexOf(cId);
          if (idx > -1) game.companions.splice(idx, 1);
          if (game.equippedCompanion === cId && !game.companions.includes(cId)) {
            game.equippedCompanion = null;
          }
          unsavedProgress = true;
          saveLocal();
          saveGameToServer();
          recalculateStats();
          updateUI();
          renderCompanions();
        }
      };

      listEl.appendChild(div);
    });

    if (game.companions.length > 0) {
      for (let i = 0; i < 15; i++) {
        const lockCard = document.createElement("div");
        lockCard.className = "companion-card locked-companion";
        lockCard.innerHTML = `
          <div class="comp-info" style="cursor:not-allowed;">
            <img src="${imgMysteryComp}" class="comp-icon" style="filter:grayscale(100%);" alt="?">
            <div>
              <div class="comp-name" style="color:var(--ink-m);">??? <span class="comp-rarity" style="background:var(--hl);color:var(--ink-m);">???</span></div>
              <div class="caption">Compagnon inconnu</div>
            </div>
          </div>
          <div style="font-size:20px;">🔒</div>
        `;
        listEl.appendChild(lockCard);
      }
    }
  }

  function updateSugars() {
    const sugarUI = $id("cc-sugar-ui");
    if (!sugarUI) return;
    if (game.totalCookies >= 1000000000 || ccValidateNum(game.sugars) > 0) {
      if (!game.sugarTime) game.sugarTime = Date.now();
      sugarUI.classList.remove("hidden");

      const elapsed = Date.now() - game.sugarTime;
      const lumpTime = 3600000;
      if (elapsed >= lumpTime) {
        const lumps = Math.floor(elapsed / lumpTime);
        game.sugars = ccValidateNum(game.sugars) + lumps;
        game.sugarTime += lumps * lumpTime;
        saveLocal();
        if (game.username && !game.username.startsWith("Invité") && !game.banned) saveGameToServer();
      }

      const remaining = Math.max(0, lumpTime - (Date.now() - game.sugarTime));
      const m = Math.floor(remaining / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      const cntEl = $id("cc-sugars-count");
      const tmrEl = $id("cc-sugars-timer");
      if (cntEl) cntEl.innerText = ccValidateNum(game.sugars);
      if (tmrEl) tmrEl.innerText = `Suivant : ${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    } else {
      sugarUI.classList.add("hidden");
    }
  }

  function updateUI() {
    game.cookies = ccValidateNum(game.cookies);
    const banScreen = $id("cc-ban-screen");
    if (game.banned) {
      if (banScreen) banScreen.classList.remove("hidden");
      return;
    } else if (banScreen) {
      banScreen.classList.add("hidden");
    }

    updateSugars();

    const dispCookies = $id("cc-cookies-display");
    const dispName = $id("cc-player-name-display");
    const avSlot = $id("cc-player-avatar-slot");
    if (dispCookies) dispCookies.innerText = ccFormatNumber(game.cookies);
    if (dispName) dispName.innerHTML = escapeHTML(game.displayName || game.username || "Invité") + getGroupHTML(game.groupId);
    if (avSlot) {
      const avKey = window.currentUser?.username || game.dnbUsername || game.username;
      const avUrl = game.profilePic || window.currentUser?.avatar || game.dnbAvatar || "";
      avSlot.innerHTML = renderCCAvatarHTML(avKey, game.displayName || game.username || "?", avUrl, "cc-avatar-sm");
    }

    for (const id in buildingData) {
      const elCost = $id(`cc-cost-${id}`);
      const elItem = $id(`cc-bitem-${id}`);
      const elCount = $id(`cc-count-${id}`);
      const lvlBox = $id(`cc-lvlbox-${id}`);
      if (!game.buildings[id]) game.buildings[id] = { count: 0, level: 0 };
      const level = ccValidateNum(game.buildings[id].level || 0);

      if (lvlBox) {
        if (game.totalCookies >= 1000000000 || ccValidateNum(game.sugars) > 0 || level > 0) {
          const costToLevel = level + 1;
          const canAfford = ccValidateNum(game.sugars) >= costToLevel;
          lvlBox.innerHTML = `<button type="button" class="cc-lvl-btn ${canAfford ? "affordable" : ""}" onclick="event.stopPropagation(); window.ccBuyBuildingLevel('${id}')" title="+1% CpS (Coût : ${costToLevel} sucre(s))">Lvl ${level} ⬆</button>`;
        } else {
          lvlBox.innerHTML = "";
        }
      }

      if (elCost && elItem && elCount) {
        elCount.innerText = game.buildings[id].count > 0 ? game.buildings[id].count : "";
        if (storeMode === "buy") {
          const cost = getBuildingBuyCost(id);
          elCost.innerText = ccFormatNumber(cost);
          elCost.style.color = "var(--success)";
          if (game.cookies >= cost) {
            elItem.classList.remove("locked");
            elCost.classList.remove("too-expensive");
          } else {
            elItem.classList.add("locked");
            elCost.classList.add("too-expensive");
          }
        } else {
          const cost = getBuildingSellCost(id);
          elCost.innerText = "+" + ccFormatNumber(cost);
          elCost.style.color = "var(--danger)";
          elCost.classList.remove("too-expensive");
          elItem.classList.toggle("locked", game.buildings[id].count <= 0);
        }
      }
    }

    const upgradesContainer = $id("cc-upgrades-container");
    if (upgradesContainer) {
      upgradesContainer.innerHTML = "";
      upgradeData.forEach(up => {
        if (!hasUpgrade(up.id)) {
          const uDiv = document.createElement("button");
          uDiv.type = "button";
          uDiv.className = game.cookies >= up.cost ? "upgrade-item" : "upgrade-item locked";
          uDiv.innerText = up.icon;
          uDiv.onmousemove = (e) => showTooltip(e, `<b>${up.desc}</b><br>Coût : <span style="color:var(--success)">${ccFormatNumber(up.cost)}</span>`);
          uDiv.onmouseleave = hideTooltip;
          uDiv.onclick = () => {
            if (game.cookies >= up.cost) {
              game.cookies -= up.cost;
              game.upgradesBought.push(up.id);
              hideTooltip();
              unsavedProgress = true;
              saveLocal();
              recalculateStats();
              updateUI();
            }
          };
          upgradesContainer.appendChild(uDiv);
        }
      });
    }

    const modalOpen = !$id("cc-easter-modal")?.classList.contains("hidden");
    if (modalOpen && game.username) {
      document.title = `${ccFormatNumber(game.cookies)} cookies · DnB Reviz`;
    }
    updateLiquidColor();
    updateOrbitingCursors();
  }

  function initStore() {
    const storeContainer = $id("cc-store-container");
    if (!storeContainer) return;
    storeContainer.innerHTML = "";
    for (const id in buildingData) {
      const b = buildingData[id];
      const div = document.createElement("div");
      div.className = "building-item locked";
      div.id = `cc-bitem-${id}`;
      div.innerHTML = `<div class="b-icon">${b.icon}</div><div class="b-info"><div class="b-name"><span>${b.name}</span><span id="cc-lvlbox-${id}"></span></div><div class="b-cost" id="cc-cost-${id}">0</div></div><div class="b-count" id="cc-count-${id}"></div>`;
      div.onmousemove = (e) => {
        const count = ccValidateNum(game.buildings[id]?.count || 0);
        const level = ccValidateNum(game.buildings[id]?.level || 0);
        const levelMult = 1 + (level * 0.01);
        let bMulti = 1;
        upgradeData.forEach(u => {
          if (u.type === "b_mult" && u.target === id && hasUpgrade(u.id)) bMulti *= u.val;
        });
        const prod = ccFormatNumber(b.baseCps * count * bMulti * levelMult);
        let txt = `<b>${b.name}</b><br><i style="color:var(--ink-m); font-size:0.8rem">${b.desc}</i><br>Production actuelle : ${prod} CpS`;
        if (storeMode === "sell") txt += `<br><span style="color:var(--danger)">Revente : +${ccFormatNumber(getBuildingSellCost(id))}</span>`;
        showTooltip(e, txt);
      };
      div.onmouseleave = hideTooltip;
      div.addEventListener("click", () => {
        if (!game.buildings[id]) game.buildings[id] = { count: 0, level: 0 };
        if (storeMode === "buy") {
          const cost = getBuildingBuyCost(id);
          if (game.cookies >= cost) {
            game.cookies -= cost;
            game.buildings[id].count++;
            unsavedProgress = true;
            saveLocal();
            recalculateStats();
            updateUI();
          }
        } else if (game.buildings[id].count > 0) {
          const cost = getBuildingSellCost(id);
          game.cookies += cost;
          game.buildings[id].count--;
          unsavedProgress = true;
          saveLocal();
          recalculateStats();
          updateUI();
        }
      });
      storeContainer.appendChild(div);
    }
  }

  function spawnCrack(x, y) {
    const stage = $id("cc-cookie-stage");
    if (!stage) return;
    const crack = document.createElement("div");
    crack.className = "crack-effect";
    crack.style.left = (x - 40) + "px";
    crack.style.top = (y - 40) + "px";
    stage.appendChild(crack);
    setTimeout(() => crack.remove(), 200);
  }

  function spawnCrumb(x, y) {
    const stage = $id("cc-cookie-stage");
    if (!stage) return;
    const crumb = document.createElement("div");
    crumb.className = "crumb";
    crumb.style.setProperty("--tx", `${(Math.random() * 110 - 55).toFixed(0)}px`);
    crumb.style.setProperty("--ty", `${(Math.random() * 110 - 55).toFixed(0)}px`);
    crumb.style.left = x + "px";
    crumb.style.top = y + "px";
    stage.appendChild(crumb);
    setTimeout(() => crumb.remove(), 480);
  }

  function showGoldenCookie() {
    const goldenCookie = $id("cc-golden-cookie");
    const container = $id("cc-cookie-stage");
    if (!goldenCookie || !container || !goldenCookie.classList.contains("hidden")) return;
    goldenCookie.classList.remove("hidden");
    const size = goldenCookie.offsetWidth || 80;
    const maxX = Math.max(16, container.offsetWidth - size - 8);
    const maxY = Math.max(16, container.offsetHeight - size - 8);
    goldenCookie.style.left = Math.round(Math.random() * maxX) + "px";
    goldenCookie.style.top = Math.round(Math.random() * maxY) + "px";

    const hideTimeout = setTimeout(() => {
      goldenCookie.classList.add("hidden");
    }, 15000);

    const claimGolden = () => {
      clearTimeout(hideTimeout);
      goldenCookie.classList.add("hidden");
      activateGoldenFrenzy();
    };
    goldenCookie.onclick = claimGolden;
    goldenCookie.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); claimGolden(); }
    };
  }

  function activateGoldenFrenzy() {
    isGoldenFrenzy = true;
    if (frenzyEndTimeout) clearTimeout(frenzyEndTimeout);
    if (companionAutoClickInterval) clearInterval(companionAutoClickInterval);

    const mainCookieImg = $id("cc-main-cookie-img");
    const bigCookieBtn = $id("cc-big-cookie");
    const activeCompEl = $id("cc-active-companion");

    if (mainCookieImg) {
      mainCookieImg.src = imgCookieGolden;
      mainCookieImg.classList.add("frenzy-img");
    }
    if (bigCookieBtn) bigCookieBtn.classList.add("frenzy-active");
    $id("ccWrapper")?.classList.add("golden-frenzy");
    $id("cc-frenzy-pill")?.classList.remove("hidden");

    if (game.equippedCompanion && companionsDB[game.equippedCompanion]) {
      activeCompEl?.classList.add("hitting-cookie");
      companionAutoClickInterval = setInterval(() => {
        if (!game.banned && game.username) {
          game.cookies += clickPower;
          game.totalCookies += clickPower;
          unsavedProgress = true;
          const stage = $id("cc-cookie-stage");
          const cx = (stage?.offsetWidth || 260) / 2 + (Math.random() * 44 - 22);
          const cy = (stage?.offsetHeight || 260) / 2 + (Math.random() * 44 - 22);
          spawnCrack(cx, cy);
          const dc = $id("cc-cookies-display");
          if (dc) dc.innerText = ccFormatNumber(game.cookies);
        }
      }, 333);
    }

    recalculateStats();
    updateUI();

    frenzyEndTimeout = setTimeout(() => {
      isGoldenFrenzy = false;
      if (mainCookieImg) {
        mainCookieImg.src = imgCookieBase;
        mainCookieImg.classList.remove("frenzy-img");
      }
      if (bigCookieBtn) bigCookieBtn.classList.remove("frenzy-active");
      $id("ccWrapper")?.classList.remove("golden-frenzy");
      $id("cc-frenzy-pill")?.classList.add("hidden");
      activeCompEl?.classList.remove("hitting-cookie");
      if (companionAutoClickInterval) {
        clearInterval(companionAutoClickInterval);
        companionAutoClickInterval = null;
      }
      recalculateStats();
      updateUI();
    }, 60000);
  }

  function spawnGoldenCookieLoop() {
    if (goldenTimeout) clearTimeout(goldenTimeout);
    let gcMult = 1;
    if (game.equippedCompanion && companionsDB[game.equippedCompanion]) {
      gcMult = companionsDB[game.equippedCompanion].gcMult || 1;
    }
    const delay = (Math.random() * (2 * 60000) + (4 * 60000)) / gcMult;
    goldenTimeout = setTimeout(() => {
      if (Math.random() <= 0.90 && !game.banned && game.username) {
        showGoldenCookie();
      }
      spawnGoldenCookieLoop();
    }, delay);
  }

  // =========================================================================
  // LA ROUE COSMIQUE
  // =========================================================================
  function getRandomColorsForWheel() {
    const colors = [];
    let lastColor = null;
    for (let i = 0; i < 6; i++) {
      let available = vibrantPalette.filter(c => c !== lastColor && (i !== 5 || c !== colors[0]));
      if (available.length === 0) available = vibrantPalette;
      const picked = available[Math.floor(Math.random() * available.length)];
      colors.push(picked);
      lastColor = picked;
    }
    return colors;
  }

  function generateWheelLayout() {
    const shuffled = [...itemsDef].sort(() => 0.5 - Math.random());
    const colors = getRandomColorsForWheel();
    currentWheelLayout = [];
    for (let i = 0; i < 6; i++) {
      currentWheelLayout.push({ ...shuffled[i], color: colors[i], startDeg: i * 60, endDeg: (i + 1) * 60 });
    }
  }

  function renderWheelVisuals() {
    const wheel = $id("cc-wheel-visual");
    if (!wheel) return;
    if (currentWheelLayout.length === 0) generateWheelLayout();

    const gradientString = currentWheelLayout.map((item, i) => `${item.color} ${i * 60}deg ${(i + 1) * 60}deg`);
    wheel.style.background = `conic-gradient(${gradientString.join(", ")})`;

    let html = "";
    currentWheelLayout.forEach(item => {
      const rot = item.startDeg + 30;
      const media = item.img
        ? `<img src="${esc(item.img)}" alt="">`
        : `<div style="font-size:30px;margin-top:4px;" class="${item.extraClass || ""}">${item.icon}</div>`;
      html += `<div class="fs-icon-container" style="transform: rotate(${rot}deg);">
        <div class="fs-slice-text">${item.label}</div>
        <div class="fs-slice-odds">${item.odds}</div>
        ${media}
      </div>`;
    });
    wheel.innerHTML = html;
  }

  function checkSpinTimer() {
    if (game.spinsLeft === undefined) { game.spinsLeft = 2; game.lastSpinReset = 0; }
    game.spinsLeft = Number(game.spinsLeft) || 0;
    game.lastSpinReset = Number(game.lastSpinReset) || 0;

    if (game.spinsLeft < 2 && game.lastSpinReset > 0 && Date.now() >= game.lastSpinReset) {
      game.spinsLeft = 2;
      game.lastSpinReset = 0;
      unsavedProgress = true;
      saveLocal();
      if (game.username && !game.username.startsWith("Invité") && !game.banned) saveGameToServer();
    }

    const textEl = $id("cc-spin-timer-text");
    const btnSpin = $id("cc-btn-spin");
    if (textEl) {
      if (game.spinsLeft >= 2) {
        textEl.innerText = "Tours dispo : 2/2";
      } else {
        const diff = Math.max(0, Math.ceil((game.lastSpinReset - Date.now()) / 1000));
        const m = Math.floor(diff / 60);
        const s = diff % 60;
        textEl.innerText = `Tours dispo : ${game.spinsLeft}/2 (Recharge dans ${m}:${String(s).padStart(2, "0")})`;
      }
    }
    if (btnSpin) {
      btnSpin.disabled = game.spinsLeft < 1 || game.cookies < 5000000000 || isSpinning;
    }
  }

  function getWheelPrize() {
    if (!Array.isArray(game.companions)) game.companions = [];
    const r = Math.random() * 100;
    if (r <= 0.0003) {
      if (Math.random() <= 0.10) return { id: "jayden_shiny", name: "Compagnon JAYDEN (SHINY ✨)" };
      return { id: "jayden", name: "Compagnon JAYDEN (Secret)" };
    }
    if (r <= 0.0018) return { id: "dan_shiny", name: "Compagnon DAN (SHINY ✨)" };
    if (r <= 2.0018) return { id: "dan", name: "Compagnon DAN (Mythique)" };
    if (r <= 17.0018) return { id: "algaz", name: "Compagnon ALGAZ (Épique)" };
    if (r <= 52.0018) return { id: "7_5b", name: "7.5 Billions Cookies" };
    return { id: "2_5b", name: "2.5 Billions Cookies" };
  }

  function awardWheelPrize(prize) {
    if (prize.id === "2_5b") {
      game.cookies = ccValidateNum(game.cookies) + 2500000000;
      game.totalCookies = ccValidateNum(game.totalCookies) + 2500000000;
    } else if (prize.id === "7_5b") {
      game.cookies = ccValidateNum(game.cookies) + 7500000000;
      game.totalCookies = ccValidateNum(game.totalCookies) + 7500000000;
    } else {
      if (!Array.isArray(game.companions)) game.companions = [];
      game.companions.push(prize.id);
    }
  }

  function launchWheelSpinAnimation() {
    if (isSpinning || !wheelPendingPrize) return;
    isSpinning = true;
    const swipeText = $id("cc-swipe-text");
    const wheelScaleWrapper = $id("cc-wheel-scale-wrapper");
    const launchBtn = $id("cc-btn-wheel-launch");
    if (swipeText) swipeText.innerText = "La roue tourne…";
    if (launchBtn) launchBtn.disabled = true;

    const spins = 5;
    let prizeFamilyId = wheelPendingPrize.id;
    if (prizeFamilyId === "jayden_shiny") prizeFamilyId = "jayden";
    let targetSlice = currentWheelLayout.find(s => s.id === prizeFamilyId) || currentWheelLayout[0];

    const randomOffset = (Math.random() * 40) - 20;
    const sliceCenter = targetSlice.startDeg + 30;
    const finalWheelAngle = (360 - sliceCenter + randomOffset) % 360;
    const targetDeg = (360 * spins) + finalWheelAngle;

    if (wheelScaleWrapper) {
      wheelScaleWrapper.style.transition = "transform 4s cubic-bezier(0.15, 0.9, 0.25, 1), box-shadow 1.5s ease-in-out";
      wheelScaleWrapper.style.transform = `rotate(${targetDeg}deg)`;
    }

    const isRareLanded = ["dan", "dan_shiny", "jayden", "jayden_shiny"].includes(prizeFamilyId);
    if (isRareLanded && wheelScaleWrapper) {
      setTimeout(() => {
        wheelScaleWrapper.classList.add("wheel-zoom-effect");
        wheelScaleWrapper.style.transform = `rotate(${targetDeg}deg) scale(1.08)`;
      }, 2500);
    }

    setTimeout(async () => {
      const wonPrize = wheelPendingPrize;
      wheelPendingPrize = null;
      isSpinning = false;
      if (launchBtn) launchBtn.disabled = false;
      $id("cc-wheel-modal")?.classList.add("hidden");
      if (wheelScaleWrapper) {
        wheelScaleWrapper.classList.remove("wheel-zoom-effect");
        wheelScaleWrapper.style.transform = "rotate(0deg)";
      }

      if (wonPrize) {
        awardWheelPrize(wonPrize);
        unsavedProgress = true;
        saveLocal();
        await saveGameToServer();
        recalculateStats();
        updateUI();
        renderCompanions();
        renderWheelVisuals();
        checkSpinTimer();
        await ccShowDialog({
          title: "🎉 Roue Cosmique",
          message: `Tu as gagné :\n- ${wonPrize.name}\n\n(Ton solde a été mis à jour)`
        });
      }
    }, 4200);
  }

  // =========================================================================
  // MARCHÉ NOIR (TRADES)
  // =========================================================================
  function updateHiddenTradeInput() {
    const amount = parseFloat($id("cc-trade-cookies-amount")?.value) || 0;
    const unit = parseFloat($id("cc-trade-cookies-unit")?.value) || 1;
    let total = Math.floor(amount * unit);
    if (total > game.cookies) total = Math.floor(game.cookies);
    const hid = $id("cc-trade-my-cookies-input");
    if (hid) hid.value = String(total);
    window.ccDebounceUpdateOffer();
  }

  window.ccDebounceUpdateOffer = () => {
    if (tradeUpdateTimeout) clearTimeout(tradeUpdateTimeout);
    tradeUpdateTimeout = setTimeout(sendOfferUpdate, 450);
  };

  async function sendOfferUpdate() {
    if (!currentTradeDocId || !currentTradeData) return;
    let cookiesInput = Math.floor(ccValidateNum($id("cc-trade-my-cookies-input")?.value));
    if (cookiesInput > game.cookies) {
      cookiesInput = Math.floor(game.cookies);
      if ($id("cc-trade-my-cookies-input")) $id("cc-trade-my-cookies-input").value = String(cookiesInput);
    }
    const selectedComps = [];
    document.querySelectorAll(".cc-trade-comp-check:checked").forEach(cb => selectedComps.push(cb.value));

    const isSender = currentTradeData.senderId === game.saveCode;
    const updates = isSender
      ? { senderOffer: { cookies: cookiesInput, comps: selectedComps }, senderReady: false, receiverReady: false }
      : { receiverOffer: { cookies: cookiesInput, comps: selectedComps }, senderReady: false, receiverReady: false };

    try {
      await updateDoc(doc(getCookieDb(), "stmg_trades", currentTradeDocId), updates);
    } catch (_) {}
  }

  function setupTradeListeners() {
    if (!game.saveCode) return;
    const fdb = getCookieDb();

    if (tradeListenerReceiver) tradeListenerReceiver();
    const qReceiver = query(collection(fdb, "stmg_trades"), where("receiverId", "==", game.saveCode));
    tradeListenerReceiver = onSnapshot(qReceiver, (snap) => {
      snap.forEach(d => {
        const t = d.data();
        if (t.status === "pending" && !appJustLoaded) {
          const senderEl = $id("cc-incoming-trade-sender");
          if (senderEl) senderEl.innerText = t.senderName || "Un joueur";
          currentTradeDocId = d.id;
          $id("cc-incoming-trade-modal")?.classList.add("active");
        }
        if (t.status === "active") {
          if (t.senderReady && t.receiverReady) {
            updateDoc(doc(fdb, "stmg_trades", d.id), { status: "completed" }).catch(() => {});
          } else {
            $id("cc-incoming-trade-modal")?.classList.remove("active");
            currentTradeDocId = d.id;
            currentTradeData = t;
            if (!isTradeModalOpen) openActiveTradeModal();
            else syncTradeUI(false);
          }
        }
        if (t.status === "completed" && !t.receiverProcessed) {
          processTradeCompletion(d.id, t, false);
        }
        if (t.status === "cancelled" && isTradeModalOpen && currentTradeDocId === d.id) {
          $id("cc-active-trade-modal")?.classList.remove("active");
          isTradeModalOpen = false;
          currentTradeDocId = null;
          currentTradeData = null;
          if (!appJustLoaded) ccShowDialog({ title: "Échange annulé", message: "L'échange a été annulé." });
        }
      });
    });

    if (tradeListenerSender) tradeListenerSender();
    const qSender = query(collection(fdb, "stmg_trades"), where("senderId", "==", game.saveCode));
    tradeListenerSender = onSnapshot(qSender, (snap) => {
      snap.forEach(d => {
        const t = d.data();
        if (t.status === "active") {
          if (t.senderReady && t.receiverReady) {
            updateDoc(doc(fdb, "stmg_trades", d.id), { status: "completed" }).catch(() => {});
          } else {
            currentTradeDocId = d.id;
            currentTradeData = t;
            if (!isTradeModalOpen) openActiveTradeModal();
            else syncTradeUI(true);
          }
        }
        if (t.status === "completed" && !t.senderProcessed) {
          processTradeCompletion(d.id, t, true);
        }
        if (t.status === "cancelled" && isTradeModalOpen && currentTradeDocId === d.id) {
          $id("cc-active-trade-modal")?.classList.remove("active");
          isTradeModalOpen = false;
          currentTradeDocId = null;
          currentTradeData = null;
          if (!appJustLoaded) ccShowDialog({ title: "Échange annulé", message: "L'échange a été annulé." });
        }
      });
    });
  }

  async function renderTradePlayersList() {
    const listDiv = $id("cc-trade-players-list");
    if (!listDiv) return;
    if (!game.saveCode) {
      listDiv.innerHTML = `<p class="caption" style="text-align:center;">Connecte-toi avec Google ou un Code Secret pour échanger avec d'autres joueurs.</p>`;
      return;
    }
    if (allLeaderboardPlayers.length === 0) {
      await loadLeaderboards();
    }
    listDiv.innerHTML = "";
    const validPlayers = allLeaderboardPlayers.filter(p => p.id !== game.saveCode && !p.banned);
    if (validPlayers.length === 0) {
      listDiv.innerHTML = `<p class="caption" style="text-align:center;">Aucun joueur disponible pour l'instant.</p>`;
      return;
    }
    validPlayers.forEach(p => {
      const card = document.createElement("div");
      card.className = "trade-player-card";
      const gHTML = p.groupId ? getGroupHTML(p.groupId) : "";
      const avHtml = renderCCAvatarHTML(p.dnbUsername || p.username, p.displayName || p.username, p.profilePic || p.dnbAvatar || "", "cc-avatar-sm");
      card.innerHTML = `
        <div class="trade-player-left">
          ${avHtml}
          <div style="min-width:0;">
            <div style="font-weight:800;font-size:14px;">${escapeHTML(p.displayName || p.username)}${gHTML}</div>
            <div class="caption">${ccFormatNumber(p.score)} Cookies</div>
          </div>
        </div>
        <button type="button" class="btn-pill btn-sm">Proposer</button>
      `;
      card.querySelector("button").onclick = () => initTrade(p.id, p.displayName || p.username);
      listDiv.appendChild(card);
    });
  }

  async function initTrade(targetId, targetName) {
    if (!game.saveCode) {
      await ccShowDialog({ title: "Connexion requise", message: "Connecte-toi avec un Code ou Google pour proposer un échange." });
      return;
    }
    try {
      const ref = doc(collection(getCookieDb(), "stmg_trades"));
      await setDoc(ref, {
        senderId: game.saveCode,
        senderName: game.displayName || game.username,
        receiverId: targetId,
        receiverName: targetName,
        status: "pending",
        senderOffer: { cookies: 0, comps: [] },
        receiverOffer: { cookies: 0, comps: [] },
        senderReady: false,
        receiverReady: false,
        senderProcessed: false,
        receiverProcessed: false,
        chat: [],
        timestamp: serverTimestamp()
      });
      await ccShowDialog({ title: "Demande envoyée", message: `🚀 Demande d'échange envoyée à ${targetName} !` });
    } catch (_) {
      await ccShowDialog({ title: "Erreur", message: "Impossible d'envoyer la demande d'échange." });
    }
  }

  function openActiveTradeModal() {
    if (!currentTradeData) return;
    isTradeModalOpen = true;
    const isSender = currentTradeData.senderId === game.saveCode;
    const targetName = isSender ? currentTradeData.receiverName : currentTradeData.senderName;
    if ($id("cc-trade-target-name")) $id("cc-trade-target-name").innerText = targetName || "Joueur";
    if ($id("cc-trade-cookies-amount")) $id("cc-trade-cookies-amount").value = "";
    if ($id("cc-trade-cookies-unit")) $id("cc-trade-cookies-unit").value = "1";
    if ($id("cc-trade-my-cookies-input")) $id("cc-trade-my-cookies-input").value = "0";

    const myCompsList = $id("cc-trade-my-comps-list");
    if (myCompsList) {
      myCompsList.innerHTML = "";
      if (!Array.isArray(game.companions)) game.companions = [];
      game.companions.forEach(c => {
        const compData = companionsDB[c];
        if (!compData) return;
        const label = document.createElement("label");
        label.className = "cc-trade-comp-pill";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.value = c;
        cb.className = "cc-trade-comp-check";
        cb.onchange = window.ccDebounceUpdateOffer;
        label.appendChild(cb);
        label.appendChild(document.createTextNode(` ${compData.name}`));
        myCompsList.appendChild(label);
      });
      if (game.companions.length === 0) {
        myCompsList.innerHTML = `<span class="caption">Aucun compagnon</span>`;
      }
    }

    syncTradeUI(isSender);
    $id("cc-active-trade-modal")?.classList.add("active");
  }

  function syncTradeUI(isSender) {
    if (!currentTradeData) return;
    const theirOffer = isSender ? currentTradeData.receiverOffer : currentTradeData.senderOffer;
    const amIReady = isSender ? currentTradeData.senderReady : currentTradeData.receiverReady;
    const areTheyReady = isSender ? currentTradeData.receiverReady : currentTradeData.senderReady;

    if ($id("cc-trade-their-cookies")) $id("cc-trade-their-cookies").innerText = ccFormatNumber(theirOffer?.cookies || 0);
    const theirCompsText = (theirOffer?.comps || []).map(c => companionsDB[c]?.name || c).join(", ");
    if ($id("cc-trade-their-comps")) $id("cc-trade-their-comps").innerText = theirCompsText || "Aucun";

    const tBox = $id("cc-their-trade-box");
    const tReady = $id("cc-trade-their-ready");
    if (tBox && tReady) {
      tBox.classList.toggle("ready", !!areTheyReady);
      tReady.className = `cc-trade-status ${areTheyReady ? "ready" : "not-ready"}`;
      tReady.innerText = areTheyReady ? "✅ Prêt !" : "❌ Pas prêt";
    }

    const myBox = $id("cc-my-trade-box");
    if (myBox) myBox.classList.toggle("ready", !!amIReady);
    if ($id("cc-trade-cookies-amount")) $id("cc-trade-cookies-amount").disabled = !!amIReady;
    if ($id("cc-trade-cookies-unit")) $id("cc-trade-cookies-unit").disabled = !!amIReady;
    document.querySelectorAll(".cc-trade-comp-check").forEach(cb => { cb.disabled = !!amIReady; });
    if ($id("cc-trade-my-ready-check")) $id("cc-trade-my-ready-check").checked = !!amIReady;

    const tcb = $id("cc-trade-chat-box");
    if (tcb) {
      tcb.innerHTML = "";
      (currentTradeData.chat || []).forEach(msg => {
        const isMe = msg.senderId === game.saveCode;
        const align = isMe ? "right" : "left";
        const color = isMe ? "var(--primary)" : "var(--secondary)";
        tcb.innerHTML += `<div style="text-align:${align};">
          <div style="font-size:11px;font-weight:800;color:${color};">${escapeHTML(msg.name || "Joueur")}</div>
          <span style="background:var(--card-bg);border:1px solid var(--hl);padding:4px 9px;border-radius:10px;display:inline-block;font-size:12.5px;max-width:85%;text-align:left;">${escapeHTML(msg.text || "")}</span>
        </div>`;
      });
      tcb.scrollTop = tcb.scrollHeight;
    }
  }

  async function processTradeCompletion(docId, tradeData, isSender) {
    if (window["ccTradeProcessed_" + docId]) return;
    window["ccTradeProcessed_" + docId] = true;

    const myOffer = isSender ? tradeData.senderOffer : tradeData.receiverOffer;
    const theirOffer = isSender ? tradeData.receiverOffer : tradeData.senderOffer;

    const cookiesGiven = ccValidateNum(myOffer?.cookies || 0);
    const cookiesReceived = ccValidateNum(theirOffer?.cookies || 0);
    let newCookies = ccValidateNum(game.cookies) - cookiesGiven + cookiesReceived;
    if (newCookies < 0) newCookies = 0;

    game.cookies = newCookies;
    if (cookiesReceived > 0) game.totalCookies = ccValidateNum(game.totalCookies) + cookiesReceived;
    if (!Array.isArray(game.companions)) game.companions = [];

    if (Array.isArray(myOffer?.comps)) {
      myOffer.comps.forEach(c => {
        const idx = game.companions.indexOf(c);
        if (idx > -1) game.companions.splice(idx, 1);
        if (game.equippedCompanion === c && !game.companions.includes(c)) {
          game.equippedCompanion = null;
        }
      });
    }
    if (Array.isArray(theirOffer?.comps)) {
      theirOffer.comps.forEach(c => game.companions.push(c));
    }

    const wasOpen = isTradeModalOpen && currentTradeDocId === docId;
    if (wasOpen) {
      $id("cc-active-trade-modal")?.classList.remove("active");
      isTradeModalOpen = false;
      currentTradeDocId = null;
      currentTradeData = null;
    }

    const updates = isSender ? { senderProcessed: true } : { receiverProcessed: true };
    try { await updateDoc(doc(getCookieDb(), "stmg_trades", docId), updates); } catch (_) {}

    unsavedProgress = true;
    saveLocal();
    await saveGameToServer();
    recalculateStats();
    updateUI();
    renderCompanions();

    if (wasOpen && !appJustLoaded) {
      await ccShowDialog({
        title: "✅ Échange terminé !",
        message: `Envoyé : ${ccFormatNumber(cookiesGiven)} cookies & ${(myOffer?.comps || []).length} compagnon(s)\nReçu : ${ccFormatNumber(cookiesReceived)} cookies & ${(theirOffer?.comps || []).length} compagnon(s)`
      });
    }
  }

  function saveLocal() {
    try { localStorage.setItem("danCookieSave_v6", JSON.stringify(game)); } catch (_) {}
  }

  function generateUniqueCode(pseudo) {
    return `${pseudo}-${Math.floor(Math.random() * 90000) + 10000}`;
  }

  async function saveGameToServer() {
    if (!game.saveCode || !game.username || game.username.startsWith("Invité") || game.banned) return;
    game.cookies = ccValidateNum(game.cookies);
    if (window.currentUser?.username) {
      game.dnbUsername = window.currentUser.username;
      game.dnbAvatar = window.currentUser.avatar || "";
      if (!game.profilePic && window.currentUser.avatar) {
        game.profilePic = window.currentUser.avatar;
      }
    }
    try {
      const fdb = getCookieDb();
      await setDoc(doc(fdb, "stmg_saves", game.saveCode), {
        saveData: JSON.stringify(game),
        lastUpdate: new Date().toISOString()
      });
      await setDoc(doc(fdb, "stmg_leaderboard", game.saveCode), {
        username: game.username,
        displayName: game.displayName || game.username,
        dnbUsername: game.dnbUsername || window.currentUser?.username || "",
        dnbAvatar: game.dnbAvatar || window.currentUser?.avatar || "",
        profilePic: game.profilePic || window.currentUser?.avatar || "",
        score: Math.floor(game.cookies),
        sugars: ccValidateNum(game.sugars || 0),
        cps: Math.floor(currentCps),
        playtime: game.playtime || 0,
        groupId: game.groupId || null,
        banned: !!game.banned
      }, { merge: true });
      saveLocal();
      unsavedProgress = false;
      $id("cc-reminder-text")?.classList.add("hidden");
    } catch (e) {
      console.error("Erreur save Cookie Clicker server:", e);
    }
  }

  function setupRealtimeListener() {
    if (!game.saveCode) return;
    if (realtimeListener) realtimeListener();
    realtimeListener = onSnapshot(doc(getCookieDb(), "stmg_leaderboard", game.saveCode), async (docSnap) => {
      if (!docSnap.exists()) return;
      const data = docSnap.data();

      if (data.banned && !game.banned) {
        game.banned = true;
        saveLocal();
        $id("cc-ban-screen")?.classList.remove("hidden");
      } else if (!data.banned && game.banned) {
        game.banned = false;
        saveLocal();
        $id("cc-ban-screen")?.classList.add("hidden");
      }

      if (data.forceSave && data.forceSave > (game.lastForceSave || 0)) {
        const isFirstLoad = !(game.lastForceSave > 0);
        game.lastForceSave = data.forceSave;
        saveLocal();
        if (!isFirstLoad && !game.banned) saveGameToServer();
      }

      if (data.forceGC && data.forceGC > (game.lastGCSync || 0)) {
        const isFirstLoad = !(game.lastGCSync > 0);
        game.lastGCSync = data.forceGC;
        saveLocal();
        if (!isFirstLoad && !game.banned) showGoldenCookie();
      }

      if (data.groupId !== undefined && data.groupId !== game.groupId) {
        game.groupId = data.groupId;
        saveLocal();
        updateUI();
        loadLeaderboards();
      }

      if (data.adminEditTimestamp && data.adminEditTimestamp > (game.lastAdminSync || 0)) {
        game.lastAdminSync = data.adminEditTimestamp;
        const saveSnap = await getDoc(doc(getCookieDb(), "stmg_saves", game.saveCode));
        if (saveSnap.exists()) {
          const parsed = JSON.parse(saveSnap.data().saveData);
          parsed.lastAdminSync = data.adminEditTimestamp;
          game = mergeSaveData(parsed);
          saveLocal();
          recalculateStats();
          updateUI();
          renderCompanions();
          checkSpinTimer();
          if (!appJustLoaded) {
            ccShowDialog({ title: "Mise à jour Admin", message: "⚠️ Tes données (ou tours de roue) ont été modifiées en direct par un Administrateur." });
          }
        }
      }
    });
  }

  async function executeLogin(code, parsedData) {
    $id("cc-login-code-modal")?.classList.remove("active");
    game = mergeSaveData(parsedData);
    game.saveCode = code;
    saveLocal();
    setupRealtimeListener();
    setupTradeListeners();
    await fetchGroups();
    finishLogin();
  }

  async function handleGoogleAuth() {
    try {
      const result = await signInWithPopup(getCookieAuth(), googleProvider);
      const user = result.user;
      const fdb = getCookieDb();
      const docSnap = await getDoc(doc(fdb, "stmg_saves", user.uid));
      if (docSnap.exists()) {
        const parsed = JSON.parse(docSnap.data().saveData);
        await executeLogin(user.uid, parsed);
      } else {
        game = mergeSaveData({});
        game.saveCode = user.uid;
        game.username = user.displayName || (user.email ? user.email.split("@")[0] : "Joueur");
        game.displayName = game.username;
        game.profilePic = user.photoURL || window.currentUser?.avatar || "";
        saveLocal();
        await saveGameToServer();
        setupRealtimeListener();
        setupTradeListeners();
        await fetchGroups();
        finishLogin();
      }
    } catch (error) {
      await ccShowDialog({
        title: "Connexion Google",
        message: "Impossible de finaliser la connexion Google : " + (error?.message || "Erreur inconnue")
      });
    }
  }

  async function processImport(code) {
    if (code === "...............................................................................") {
      ccIsAdmin = true;
      $id("cc-btn-open-admin")?.classList.remove("hidden");
      $id("cc-subtab-admin")?.classList.remove("hidden");
      await fetchGroups();
      renderAdminGroups();
      loadAdminData();
      window.switchCCSubTab("admin");
      return;
    }
    try {
      const docSnap = await getDoc(doc(getCookieDb(), "stmg_saves", code));
      if (!docSnap.exists()) {
        await ccShowDialog({ title: "Code introuvable", message: "❌ Aucun compte trouvé pour ce Code Secret." });
        return;
      }
      const parsed = JSON.parse(docSnap.data().saveData);
      if (parsed.password && parsed.password !== "") {
        $id("cc-check-pwd").value = "";
        $id("cc-pwd-modal")?.classList.add("active");
        $id("cc-btn-verify-pwd").onclick = async () => {
          if ($id("cc-check-pwd").value === parsed.password) {
            $id("cc-pwd-modal")?.classList.remove("active");
            await executeLogin(code, parsed);
          } else {
            await ccShowDialog({ title: "Erreur", message: "Mot de passe incorrect." });
          }
        };
        $id("cc-btn-cancel-pwd").onclick = () => {
          $id("cc-pwd-modal")?.classList.remove("active");
        };
        return;
      }
      await executeLogin(code, parsed);
    } catch (e) {
      await ccShowDialog({ title: "Erreur de connexion", message: "Impossible d'importer ce code pour l'instant." });
    }
  }

  function startChat() {
    if (chatListener) chatListener();
    initialChatLoad = true;
    const q = query(collection(getCookieDb(), "stmg_chat"), orderBy("timestamp", "desc"), limit(25));
    chatListener = onSnapshot(q, (snap) => {
      const box = $id("cc-chat-box");
      if (!box) return;
      box.innerHTML = "";
      const msgs = [];
      snap.forEach(d => msgs.push({ id: d.id, ...d.data() }));
      msgs.reverse().forEach(m => {
        const adminBtns = ccIsAdmin
          ? `<button type="button" class="btn-ghost btn-sm" onclick="window.ccDeleteChatMessage('${esc(m.id)}')">SUPPR</button> <button type="button" class="btn-danger btn-sm" onclick="window.ccBanChatMessage('${esc(m.id)}','${esc(m.userId)}')">BAN</button>`
          : "";
        const grpTag = m.groupId ? getGroupHTML(m.groupId) : "";
        const storedAv = m.profilePic || m.dnbAvatar || "";
        const avHtml = renderCCAvatarHTML(m.dnbUsername || m.userId, m.displayName || m.userId, storedAv, "cc-avatar-sm");
        box.innerHTML += `
          <div class="cc-chat-msg">
            <div class="cc-chat-author">
              <span class="cc-chat-author-left">${avHtml}<span>${escapeHTML(m.displayName || m.userId || "Joueur")}${grpTag}</span></span>
              <div>${adminBtns}</div>
            </div>
            <div>${escapeHTML(m.text || "")}</div>
          </div>`;
      });
      box.scrollTop = box.scrollHeight;

      const chatTabActive = $id("cc-tab-chat")?.classList.contains("active");
      if (!initialChatLoad && !chatTabActive && msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        if (lastMsg.userId !== game.username) {
          $id("cc-chat-badge")?.classList.remove("hidden");
        }
      }
      initialChatLoad = false;
    });
  }

  async function loadLeaderboards() {
    try {
      const fdb = getCookieDb();
      allLeaderboardPlayers = [];

      const qCook = query(collection(fdb, "stmg_leaderboard"), where("banned", "==", false), orderBy("score", "desc"), limit(10));
      const snapCook = await getDocs(qCook);
      const lbCook = $id("cc-lb-cookies");
      if (lbCook) {
        lbCook.innerHTML = "";
        let rank = 1;
        snapCook.forEach(d => {
          const dat = d.data();
          allLeaderboardPlayers.push({ id: d.id, ...dat });
          const grpStr = dat.groupId ? getGroupHTML(dat.groupId) : "";
          const storedAv = dat.profilePic || dat.dnbAvatar || "";
          const avHtml = renderCCAvatarHTML(dat.dnbUsername || dat.username, dat.displayName || dat.username, storedAv, "cc-avatar-sm");
          lbCook.innerHTML += `<div class="cc-lb-row ${rank === 1 ? "top-1" : rank === 2 ? "top-2" : rank === 3 ? "top-3" : ""}"><div class="cc-lb-rank">#${rank}</div><div class="cc-lb-name" title="${esc(dat.username)}">${avHtml}<span class="cc-lb-name-txt">${escapeHTML(dat.displayName || dat.username)}${grpStr}</span></div><div class="cc-lb-score">${ccFormatNumber(dat.score)}</div></div>`;
          rank++;
        });
      }

      const qCps = query(collection(fdb, "stmg_leaderboard"), where("banned", "==", false), orderBy("cps", "desc"), limit(10));
      const snapCps = await getDocs(qCps);
      const lbCps = $id("cc-lb-cps");
      if (lbCps) {
        lbCps.innerHTML = "";
        let rank = 1;
        snapCps.forEach(d => {
          const dat = d.data();
          const grpStr = dat.groupId ? getGroupHTML(dat.groupId) : "";
          const storedAv = dat.profilePic || dat.dnbAvatar || "";
          const avHtml = renderCCAvatarHTML(dat.dnbUsername || dat.username, dat.displayName || dat.username, storedAv, "cc-avatar-sm");
          lbCps.innerHTML += `<div class="cc-lb-row ${rank === 1 ? "top-1" : rank === 2 ? "top-2" : rank === 3 ? "top-3" : ""}"><div class="cc-lb-rank">#${rank}</div><div class="cc-lb-name" title="${esc(dat.username)}">${avHtml}<span class="cc-lb-name-txt">${escapeHTML(dat.displayName || dat.username)}${grpStr}</span></div><div class="cc-lb-score">${ccFormatNumber(dat.cps || 0)}/s</div></div>`;
          rank++;
        });
      }

      const groupScores = {};
      const allPlayersSnap = await getDocs(query(collection(fdb, "stmg_leaderboard"), where("banned", "==", false)));
      allPlayersSnap.forEach(d => {
        const dat = d.data();
        if (!allLeaderboardPlayers.find(p => p.id === d.id)) {
          allLeaderboardPlayers.push({ id: d.id, ...dat });
        }
        if (dat.groupId && groupsMap[dat.groupId]) {
          groupScores[dat.groupId] = (groupScores[dat.groupId] || 0) + (dat.score || 0);
        }
      });

      const sortedGroups = Object.keys(groupScores).map(id => ({ id, score: groupScores[id] })).sort((a, b) => b.score - a.score).slice(0, 10);
      const lbGroups = $id("cc-lb-groups");
      if (lbGroups) {
        lbGroups.innerHTML = "";
        let rankG = 1;
        sortedGroups.forEach(g => {
          lbGroups.innerHTML += `<div class="cc-lb-row ${rankG === 1 ? "top-1" : rankG === 2 ? "top-2" : rankG === 3 ? "top-3" : ""}"><div class="cc-lb-rank">#${rankG}</div><div class="cc-lb-name"><span class="cc-lb-name-txt">${getGroupHTML(g.id)}</span></div><div class="cc-lb-score">${ccFormatNumber(g.score)}</div></div>`;
          rankG++;
        });
        if (sortedGroups.length === 0) {
          lbGroups.innerHTML = '<p class="caption" style="text-align:center;">Aucun groupe actif pour le moment</p>';
        }
      }

      groupCpsBonus = 0;
      if (game.groupId) {
        const myGroupRank = sortedGroups.findIndex(g => g.id === game.groupId) + 1;
        if (myGroupRank === 1) groupCpsBonus = 50000000;
        else if (myGroupRank === 2) groupCpsBonus = 25000000;
        else if (myGroupRank === 3) groupCpsBonus = 10000000;
      }
      recalculateStats();
    } catch (e) {
      console.error("Erreur classements Cookie Clicker:", e);
    }
  }

  function renderAdminGroups() {
    const box = $id("cc-admin-groups-list");
    if (!box) return;
    let html = "";
    for (const id in groupsMap) {
      html += `<div style="display:flex; justify-content:space-between; align-items:center; background:var(--card-bg); border:1px solid var(--hl); padding:8px 12px; border-radius:10px;">
        <span>ID: <small class="caption">${escapeHTML(id)}</small> · Rendu: ${getGroupHTML(id)}</span>
        <button type="button" class="btn-danger btn-sm" onclick="window.ccDelGroup('${esc(id)}')">Suppr.</button>
      </div>`;
    }
    if (Object.keys(groupsMap).length === 0) html = `<p class="caption">Aucun groupe créé.</p>`;
    box.innerHTML = html;
  }

  async function loadAdminData() {
    await fetchGroups();
    renderAdminGroups();
    const sTable = document.querySelector("#cc-admin-saves-table tbody");
    if (!sTable) return;
    sTable.innerHTML = "";
    try {
      const lSnap = await getDocs(collection(getCookieDb(), "stmg_leaderboard"));
      lSnap.forEach(d => {
        const dat = d.data();
        const isBan = dat.banned;
        const banBtn = isBan
          ? `<button type="button" class="btn-ghost btn-sm" onclick="window.ccBanDoc('${esc(d.id)}', false)">Débannir</button>`
          : `<button type="button" class="btn-danger btn-sm" onclick="window.ccBanDoc('${esc(d.id)}', true)">Ban</button>`;
        const gcBtn = `<button type="button" class="btn-ghost btn-sm" title="Envoyer un Cookie Doré" onclick="window.ccSendGoldenCookie('${esc(d.id)}')"><img src="${imgCookieGolden}" alt="✨" style="width:18px;height:18px;object-fit:contain;vertical-align:middle;"></button>`;
        const wheelBtn = `<button type="button" class="btn-ghost btn-sm" title="Gérer la Roue" onclick="window.ccOpenWheelAdminModal('${esc(d.id)}')">🎡</button>`;
        const storedAv = dat.profilePic || dat.dnbAvatar || "";
        const avHtml = renderCCAvatarHTML(dat.dnbUsername || dat.username, dat.displayName || dat.username, storedAv, "cc-avatar-sm");
        let groupOptions = `<option value="">-- Aucun --</option>`;
        for (const gId in groupsMap) {
          groupOptions += `<option value="${esc(gId)}" ${dat.groupId === gId ? "selected" : ""}>${escapeHTML(groupsMap[gId].name)}</option>`;
        }
        const groupSelectHTML = `<select onchange="window.ccUpdatePlayerGroup('${esc(d.id)}', this.value)" style="background:var(--input-bg); color:var(--ink); border:1px solid var(--input-b); border-radius:8px; padding:4px 8px; font-size:12px;">${groupOptions}</select>`;
        sTable.innerHTML += `<tr>
          <td><span class="caption">${escapeHTML(d.id)}</span></td>
          <td style="${isBan ? "text-decoration:line-through;color:var(--danger);" : ""}"><span style="display:inline-flex;align-items:center;gap:6px;">${avHtml}<span>${escapeHTML(dat.displayName || dat.username)}</span></span></td>
          <td>${groupSelectHTML}</td>
          <td>${ccFormatNumber(dat.score)}</td>
          <td>${ccFormatNumber(dat.sugars || 0)}</td>
          <td>${ccFormatNumber(dat.cps || 0)}</td>
          <td style="display:flex;gap:4px;flex-wrap:wrap;">
            <button type="button" class="btn-ghost btn-sm" onclick="window.ccOpenEditModal('${esc(d.id)}')">Éditer</button>
            <button type="button" class="btn-danger btn-sm" onclick="window.ccDelDoc('${esc(d.id)}')">Suppr.</button>
            ${banBtn}
            ${gcBtn}
            ${wheelBtn}
          </td>
        </tr>`;
      });
    } catch (e) {
      sTable.innerHTML = '<tr><td colspan="7">Erreur Firebase</td></tr>';
    }
  }

  window.ccDelGroup = async (id) => {
    if (await ccShowDialog({ type: "confirm", title: "Supprimer le groupe", message: "Supprimer ce groupe ? Les joueurs le perdront." })) {
      await deleteDoc(doc(getCookieDb(), "stmg_groups", id));
      await fetchGroups();
      loadAdminData();
    }
  };
  window.ccUpdatePlayerGroup = async (userId, newGroupId) => {
    try {
      const finalGroupId = newGroupId === "" ? null : newGroupId;
      const fdb = getCookieDb();
      await updateDoc(doc(fdb, "stmg_leaderboard", userId), { groupId: finalGroupId });
      const s = await getDoc(doc(fdb, "stmg_saves", userId));
      if (s.exists()) {
        const p = JSON.parse(s.data().saveData);
        p.groupId = finalGroupId;
        await updateDoc(doc(fdb, "stmg_saves", userId), { saveData: JSON.stringify(p) });
      }
    } catch (_) {
      ccShowDialog({ title: "Erreur", message: "Erreur lors de la mise à jour du groupe." });
    }
  };
  window.ccDelDoc = async (id) => {
    if (await ccShowDialog({ type: "confirm", title: "Supprimer sauvegarde", message: `Supprimer définitivement ${id} ?` })) {
      const fdb = getCookieDb();
      await deleteDoc(doc(fdb, "stmg_saves", id));
      await deleteDoc(doc(fdb, "stmg_leaderboard", id));
      loadAdminData();
    }
  };
  window.ccBanDoc = async (id, status) => {
    if (await ccShowDialog({ type: "confirm", title: status ? "Bannir" : "Débannir", message: status ? "Bannir ce joueur ?" : "Débannir ce joueur ?" })) {
      const fdb = getCookieDb();
      await updateDoc(doc(fdb, "stmg_leaderboard", id), { banned: status });
      const saveRef = doc(fdb, "stmg_saves", id);
      const s = await getDoc(saveRef);
      if (s.exists()) {
        const p = JSON.parse(s.data().saveData);
        p.banned = status;
        await updateDoc(saveRef, { saveData: JSON.stringify(p) });
      }
      loadAdminData();
    }
  };
  window.ccSendGoldenCookie = async (id) => {
    if (!ccIsAdmin) return;
    try {
      await updateDoc(doc(getCookieDb(), "stmg_leaderboard", id), { forceGC: Date.now() });
      ccShowDialog({ title: "Cookie Doré envoyé", message: "✨ Cookie Doré envoyé au joueur !" });
    } catch (_) {
      ccShowDialog({ title: "Erreur", message: "Erreur lors de l'envoi du Cookie Doré." });
    }
  };

  window.ccOpenWheelAdminModal = async (id) => {
    const s = await getDoc(doc(getCookieDb(), "stmg_saves", id));
    if (!s.exists()) return;
    currentWheelEditId = id;
    currentWheelEditData = mergeSaveData(JSON.parse(s.data().saveData));
    $id("cc-admin-wheel-player-name").innerText = currentWheelEditData.displayName || currentWheelEditData.username || id;
    $id("cc-admin-wheel-spins").value = currentWheelEditData.spinsLeft !== undefined ? currentWheelEditData.spinsLeft : 2;
    $id("cc-admin-wheel-modal")?.classList.add("active");
  };

  window.ccAdminQuickAdd = async (id, type, amount) => {
    const fdb = getCookieDb();
    const s = await getDoc(doc(fdb, "stmg_saves", id));
    if (!s.exists()) return;
    const p = mergeSaveData(JSON.parse(s.data().saveData));
    if (type === "cookies") p.cookies = ccValidateNum(p.cookies) + amount;
    if (type === "sugars") p.sugars = ccValidateNum(p.sugars) + amount;
    await updateDoc(doc(fdb, "stmg_saves", id), { saveData: JSON.stringify(p) });
    await updateDoc(doc(fdb, "stmg_leaderboard", id), {
      score: p.cookies,
      sugars: p.sugars,
      adminEditTimestamp: Date.now()
    });
    if (type === "cookies" && $id("cc_edit_cookies")) {
      $id("cc_edit_cookies").value = Math.floor(p.cookies).toLocaleString("fullwide", { useGrouping: false });
    }
    if (type === "sugars" && $id("cc_edit_sugars")) {
      $id("cc_edit_sugars").value = p.sugars;
    }
    loadAdminData();
    ccShowDialog({ title: "Appliqué", message: "✅ Action appliquée en temps réel au joueur !" });
  };

  window.ccAdminWipeSave = async (id) => {
    if (!await ccShowDialog({ type: "confirm", title: "Remise à Zéro", message: "⚠️ Remettre ce compte totalement à ZÉRO ?" })) return;
    const fdb = getCookieDb();
    const s = await getDoc(doc(fdb, "stmg_saves", id));
    if (!s.exists()) return;
    const oldData = JSON.parse(s.data().saveData);
    const newData = mergeSaveData({
      username: oldData.username,
      displayName: oldData.displayName,
      saveCode: oldData.saveCode,
      password: oldData.password,
      profilePic: oldData.profilePic || "",
      dnbUsername: oldData.dnbUsername || "",
      dnbAvatar: oldData.dnbAvatar || "",
      banned: !!oldData.banned,
      groupId: oldData.groupId || null
    });
    await updateDoc(doc(fdb, "stmg_saves", id), { saveData: JSON.stringify(newData) });
    await updateDoc(doc(fdb, "stmg_leaderboard", id), { score: 0, cps: 0, sugars: 0, adminEditTimestamp: Date.now() });
    $id("cc-admin-edit-modal")?.classList.remove("active");
    loadAdminData();
    ccShowDialog({ title: "Réinitialisé", message: "✅ Compte réinitialisé !" });
  };

  window.ccOpenEditModal = async (id) => {
    const fdb = getCookieDb();
    const s = await getDoc(doc(fdb, "stmg_saves", id));
    if (!s.exists()) return;
    const editDat = mergeSaveData(JSON.parse(s.data().saveData));
    $id("cc-edit-player-name").innerText = editDat.username || editDat.displayName || id;
    const safeCookieStr = Math.floor(ccValidateNum(editDat.cookies)).toLocaleString("fullwide", { useGrouping: false });

    let html = `
      <div class="cc-admin-edit-grid">
        <div class="cc-admin-edit-card">
          <h4>📊 Statistiques</h4>
          <div class="input-group"><label>Cookies</label><input type="text" id="cc_edit_cookies" value="${esc(safeCookieStr)}"></div>
          <div class="input-group"><label>Sucres</label><input type="number" id="cc_edit_sugars" value="${ccValidateNum(editDat.sugars)}"></div>
          <div class="input-group"><label>Avatar (URL / Base64)</label><input type="text" id="cc_edit_profilePic" value="${esc(editDat.profilePic || "")}"></div>
          <button type="button" class="btn-ghost btn-sm del" style="width:100%;" onclick="document.getElementById('cc_edit_profilePic').value=''">🗑️ Vider l'Avatar</button>
        </div>
        <div class="cc-admin-edit-card">
          <h4>⚡ Actions Instantanées</h4>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <button type="button" class="btn-pill btn-sm" onclick="window.ccAdminQuickAdd('${esc(id)}', 'cookies', 1000000000)">+ 1 Billion Cookies</button>
            <button type="button" class="btn-ghost btn-sm" onclick="window.ccAdminQuickAdd('${esc(id)}', 'sugars', 10)">+ 10 Sucres</button>
            <button type="button" class="btn-danger btn-sm" onclick="window.ccAdminWipeSave('${esc(id)}')">⚠️ Remettre à Zéro</button>
          </div>
        </div>
      </div>
      <div class="cc-section-mini-title" style="margin-top:14px;">🐾 Compagnons possédés</div>
      <div class="cc-admin-b-grid">
    `;
    ["algaz", "dan", "dan_shiny", "jayden", "jayden_shiny"].forEach(c => {
      const qty = (editDat.companions || []).filter(x => x === c).length;
      html += `<div class="cc-admin-b-box">
        <strong style="font-size:12.5px;">${escapeHTML(companionsDB[c].name)}</strong>
        <input type="number" id="cc_edit_comp_${c}" value="${qty}" min="0">
      </div>`;
    });
    html += `</div><div class="cc-section-mini-title" style="margin-top:14px;">🏢 Bâtiments (Quantité & Niveau)</div><div class="cc-admin-b-grid">`;
    for (const key in buildingData) {
      const count = ccValidateNum(editDat.buildings[key]?.count || 0);
      const lvl = ccValidateNum(editDat.buildings[key]?.level || 0);
      html += `<div class="cc-admin-b-box">
        <strong style="font-size:12.5px;">${buildingData[key].icon} ${buildingData[key].name}</strong>
        <div class="cc-admin-b-inputs">
          <label>Qté <input type="number" id="cc_edit_b_${key}" value="${count}" min="0"></label>
          <label>Lvl <input type="number" id="cc_edit_b_lvl_${key}" value="${lvl}" min="0"></label>
        </div>
      </div>`;
    }
    html += `</div>`;

    $id("cc-edit-form-content").innerHTML = html;
    $id("cc-admin-edit-modal")?.classList.add("active");

    $id("cc-btn-save-admin-edit").onclick = async () => {
      editDat.cookies = ccValidateNum(parseFloat($id("cc_edit_cookies").value));
      editDat.sugars = ccValidateNum(parseFloat($id("cc_edit_sugars").value));
      editDat.profilePic = ($id("cc_edit_profilePic").value || "").trim();

      editDat.companions = [];
      ["algaz", "dan", "dan_shiny", "jayden", "jayden_shiny"].forEach(c => {
        const qty = parseInt($id(`cc_edit_comp_${c}`).value, 10) || 0;
        for (let i = 0; i < qty; i++) editDat.companions.push(c);
      });
      if (editDat.equippedCompanion && !editDat.companions.includes(editDat.equippedCompanion)) {
        editDat.equippedCompanion = null;
      }

      for (const key in buildingData) {
        const countVal = ccValidateNum(parseInt($id(`cc_edit_b_${key}`).value, 10));
        const lvlVal = ccValidateNum(parseInt($id(`cc_edit_b_lvl_${key}`).value, 10));
        editDat.buildings[key] = { count: countVal, level: lvlVal };
      }
      const newCps = calculateCpsForSave(editDat);
      await updateDoc(doc(fdb, "stmg_saves", id), { saveData: JSON.stringify(editDat) });
      await updateDoc(doc(fdb, "stmg_leaderboard", id), {
        score: editDat.cookies,
        sugars: editDat.sugars,
        cps: Math.floor(newCps),
        profilePic: editDat.profilePic || editDat.dnbAvatar || "",
        adminEditTimestamp: Date.now()
      });
      $id("cc-admin-edit-modal")?.classList.remove("active");
      loadAdminData();
      loadLeaderboards();
      ccShowDialog({ title: "Enregistré", message: "Compte modifié avec succès !" });
    };
  };

  window.ccDeleteChatMessage = async (msgId) => {
    if (!ccIsAdmin) return;
    if (await ccShowDialog({ type: "confirm", title: "Supprimer message", message: "Supprimer ce message du chat ?" })) {
      await deleteDoc(doc(getCookieDb(), "stmg_chat", msgId));
    }
  };
  window.ccBanChatMessage = async (msgId, userId) => {
    if (!ccIsAdmin) return;
    if (await ccShowDialog({ type: "confirm", title: "Bannir", message: "Supprimer ce message et bannir le joueur ?" })) {
      const fdb = getCookieDb();
      await deleteDoc(doc(fdb, "stmg_chat", msgId));
      const snap = await getDocs(query(collection(fdb, "stmg_leaderboard"), where("username", "==", userId)));
      snap.forEach(async d => {
        await updateDoc(doc(fdb, "stmg_leaderboard", d.id), { banned: true });
      });
    }
  };

  async function finishLogin() {
    const overlay = $id("cc-username-overlay");
    if (overlay) overlay.style.display = "none";
    $id("cc-btn-gear")?.classList.remove("hidden");
    $id("cc-shortcuts-bar")?.classList.remove("hidden");
    if (game.username === "admin1234" || game.username === "adminSSE22" || isAdminUser(window.currentUser)) {
      ccIsAdmin = true;
      $id("cc-btn-open-admin")?.classList.remove("hidden");
      $id("cc-subtab-admin")?.classList.remove("hidden");
    }
    startChat();
    renderCompanions();
    initStore();
    recalculateStats();
    updateUI();
    await loadLeaderboards();
  }

  function refreshDnbQuickLinkBtn() {
    const quickBtn = $id("cc-btn-quick-dnb");
    if (!quickBtn) return;
    const dnbName = window.currentUser?.username;
    if (dnbName && !game.username) {
      quickBtn.classList.remove("hidden");
      quickBtn.innerText = `⚡ Continuer avec mon compte DnB (${dnbName})`;
    } else {
      quickBtn.classList.add("hidden");
    }
  }

  async function signUpCookieAccount(pseudoInput) {
    const clean = String(pseudoInput || "").trim();
    if (clean.length < 3) {
      await ccShowDialog({ title: "Pseudo trop court", message: "Entre un pseudo d'au moins 3 caractères." });
      return;
    }
    const fdb = getCookieDb();
    const q = query(collection(fdb, "stmg_leaderboard"), where("username", "==", clean));
    const snap = await getDocs(q);
    if (!snap.empty) {
      await ccShowDialog({
        title: "Pseudo déjà enregistré",
        message: "Ce pseudo existe déjà sur Cookie Clicker ! Si c'est le tien, clique sur « Connexion Code » avec ton Code Secret."
      });
      return;
    }
    game = mergeSaveData({});
    game.username = clean;
    game.displayName = window.currentUser?.displayName || clean;
    game.profilePic = window.currentUser?.avatar || "";
    game.saveCode = (clean === "admin1234" || clean === "adminSSE22") ? clean : generateUniqueCode(clean);
    saveLocal();
    await saveGameToServer();
    setupRealtimeListener();
    setupTradeListeners();
    await fetchGroups();
    finishLogin();
  }

  function openLoginModal() {
    tempLoginCode = "";
    tempLoginData = null;
    if ($id("cc-login-input-code")) $id("cc-login-input-code").value = "";
    if ($id("cc-login-input-pwd")) $id("cc-login-input-pwd").value = "";
    $id("cc-login-code-step")?.classList.remove("hidden");
    $id("cc-login-pwd-step")?.classList.add("hidden");
    if ($id("cc-btn-submit-login")) $id("cc-btn-submit-login").innerText = "Vérifier";
    $id("cc-login-code-modal")?.classList.add("active");
  }

  function initCookieClickerOnce() {
    if (ccInitialized) return;
    ccInitialized = true;
    initStore();

    $id("cc-btn-mode-buy")?.addEventListener("click", (e) => {
      storeMode = "buy";
      e.target.classList.add("active");
      $id("cc-btn-mode-sell")?.classList.remove("sell-active");
      updateUI();
    });
    $id("cc-btn-mode-sell")?.addEventListener("click", (e) => {
      storeMode = "sell";
      e.target.classList.add("sell-active");
      $id("cc-btn-mode-buy")?.classList.remove("active");
      updateUI();
    });
    $id("cc-btn-mode-trade")?.addEventListener("click", () => {
      window.switchCCSubTab("trade");
    });

    $id("cc-btn-history")?.addEventListener("click", () => {
      const list = $id("cc-history-list");
      if (!list) return;
      list.innerHTML = "";
      if (!game.upgradesBought || game.upgradesBought.length === 0) {
        list.innerHTML = `<p class="caption" style="text-align:center;">Aucune amélioration achetée pour le moment.</p>`;
      } else {
        game.upgradesBought.forEach(upId => {
          const up = upgradeData.find(u => u.id === upId);
          if (up) {
            list.innerHTML += `<div class="cc-history-item">
              <div style="font-size:28px;">${up.icon}</div>
              <div>
                <div style="font-weight:800;font-size:14px;">${escapeHTML(up.desc)}</div>
                <div class="caption">Coût : ${ccFormatNumber(up.cost)}</div>
              </div>
            </div>`;
          }
        });
      }
      $id("cc-history-modal")?.classList.add("active");
    });

    const handleBigCookieClick = (clientX, clientY) => {
      if (!game.username || game.banned) return;
      game.cookies += clickPower;
      game.totalCookies += clickPower;
      unsavedProgress = true;

      const stage = $id("cc-cookie-stage");
      const rect = stage.getBoundingClientRect();
      const x = clientX ? (clientX - rect.left) : rect.width / 2;
      const y = clientY ? (clientY - rect.top) : rect.height / 2;

      const p = document.createElement("div");
      p.className = "click-particle";
      p.innerText = `+${ccFormatNumber(clickPower)}`;
      p.style.left = `${x}px`;
      p.style.top = `${y}px`;
      stage.appendChild(p);
      setTimeout(() => p.remove(), 950);
      spawnCrack(x, y);
      for (let i = 0; i < 3; i++) spawnCrumb(x, y);
      updateUI();
    };

    $id("cc-big-cookie")?.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      handleBigCookieClick(e.clientX, e.clientY);
    });
    $id("cc-big-cookie")?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleBigCookieClick(0, 0);
      }
    });
    window.addEventListener("resize", () => {
      if (ccInitialized && !$id("cc-easter-modal")?.classList.contains("hidden")) {
        updateOrbitingCursors(true);
      }
    });

    // Wheel CTA & Gestures
    $id("cc-btn-spin")?.addEventListener("click", async () => {
      if (game.spinsLeft < 1 || isSpinning) return;
      if (game.cookies < 5000000000) {
        await ccShowDialog({ title: "Fonds insuffisants", message: "Il te faut 5 Billions de Cookies pour tourner la roue !" });
        return;
      }
      game.cookies = ccValidateNum(game.cookies) - 5000000000;
      game.spinsLeft -= 1;
      if (game.spinsLeft === 1 || (!game.lastSpinReset || game.lastSpinReset <= Date.now())) {
        game.lastSpinReset = Date.now() + (5 * 60 * 1000);
      }
      unsavedProgress = true;
      saveLocal();
      saveGameToServer();
      recalculateStats();
      updateUI();
      checkSpinTimer();

      wheelPendingPrize = getWheelPrize();
      generateWheelLayout();
      renderWheelVisuals();

      const wrapper = $id("cc-wheel-scale-wrapper");
      if (wrapper) {
        wrapper.style.transition = "none";
        wrapper.style.transform = "rotate(0deg)";
        wrapper.classList.remove("wheel-zoom-effect");
      }
      if ($id("cc-swipe-text")) $id("cc-swipe-text").innerText = "👇 Glisse vers le bas (ou touche le bouton) pour tourner ! 👇";
      $id("cc-wheel-modal")?.classList.remove("hidden");
    });

    const wheelGestureArea = $id("cc-wheel-gesture-area");
    const onSwipeStart = (e) => {
      if (isSpinning || !wheelPendingPrize) return;
      wheelStartPosY = e.touches ? e.touches[0].clientY : e.clientY;
      wheelStartPosX = e.touches ? e.touches[0].clientX : e.clientX;
    };
    const onSwipeEnd = (e) => {
      if (isSpinning || !wheelPendingPrize) return;
      const endY = e.changedTouches ? e.changedTouches[0].clientY : e.clientY;
      const endX = e.changedTouches ? e.changedTouches[0].clientX : e.clientX;
      if (Math.abs(endY - wheelStartPosY) > 36 || Math.abs(endX - wheelStartPosX) > 36) {
        launchWheelSpinAnimation();
      }
    };
    wheelGestureArea?.addEventListener("mousedown", onSwipeStart);
    wheelGestureArea?.addEventListener("touchstart", onSwipeStart, { passive: true });
    wheelGestureArea?.addEventListener("mouseup", onSwipeEnd);
    wheelGestureArea?.addEventListener("touchend", onSwipeEnd, { passive: true });
    $id("cc-btn-wheel-launch")?.addEventListener("click", launchWheelSpinAnimation);

    // Trades events
    $id("cc-trade-cookies-amount")?.addEventListener("input", updateHiddenTradeInput);
    $id("cc-trade-cookies-unit")?.addEventListener("change", updateHiddenTradeInput);
    $id("cc-btn-decline-trade")?.addEventListener("click", async () => {
      if (currentTradeDocId) {
        try { await updateDoc(doc(getCookieDb(), "stmg_trades", currentTradeDocId), { status: "cancelled" }); } catch (_) {}
        $id("cc-incoming-trade-modal")?.classList.remove("active");
        currentTradeDocId = null;
        currentTradeData = null;
      }
    });
    $id("cc-btn-accept-trade")?.addEventListener("click", async () => {
      if (currentTradeDocId) {
        await updateDoc(doc(getCookieDb(), "stmg_trades", currentTradeDocId), { status: "active" });
      }
    });
    $id("cc-btn-send-trade-chat")?.addEventListener("click", async () => {
      const inp = $id("cc-trade-chat-input");
      const txt = inp?.value.trim();
      if (!txt || !currentTradeDocId) return;
      await updateDoc(doc(getCookieDb(), "stmg_trades", currentTradeDocId), {
        chat: arrayUnion({
          senderId: game.saveCode,
          name: game.displayName || game.username,
          text: txt,
          time: Date.now()
        })
      });
      inp.value = "";
    });
    $id("cc-trade-chat-input")?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") $id("cc-btn-send-trade-chat")?.click();
    });
    $id("cc-trade-my-ready-check")?.addEventListener("change", async (e) => {
      if (!currentTradeDocId || !currentTradeData) return;
      const ready = e.target.checked;
      const isSender = currentTradeData.senderId === game.saveCode;
      const myOfferCookies = Math.floor(ccValidateNum($id("cc-trade-my-cookies-input")?.value));
      if (ready && myOfferCookies > game.cookies) {
        await ccShowDialog({ title: "Solde insuffisant", message: "Tu ne peux pas valider : tu n'as plus assez de cookies !" });
        e.target.checked = false;
        if ($id("cc-trade-cookies-amount")) $id("cc-trade-cookies-amount").value = Math.floor(game.cookies);
        if ($id("cc-trade-cookies-unit")) $id("cc-trade-cookies-unit").value = "1";
        updateHiddenTradeInput();
        return;
      }
      const updates = isSender ? { senderReady: ready } : { receiverReady: ready };
      const bothReady = isSender ? (ready && currentTradeData.receiverReady) : (ready && currentTradeData.senderReady);
      if (bothReady) updates.status = "completed";
      try { await updateDoc(doc(getCookieDb(), "stmg_trades", currentTradeDocId), updates); } catch (_) {}
    });
    $id("cc-btn-cancel-active-trade")?.addEventListener("click", async () => {
      if (currentTradeDocId) {
        try { await updateDoc(doc(getCookieDb(), "stmg_trades", currentTradeDocId), { status: "cancelled" }); } catch (_) {}
        $id("cc-active-trade-modal")?.classList.remove("active");
        isTradeModalOpen = false;
        currentTradeDocId = null;
        currentTradeData = null;
      }
    });

    // Auth & Login
    $id("cc-btn-google-main")?.addEventListener("click", handleGoogleAuth);
    $id("cc-btn-login-google-only")?.addEventListener("click", () => {
      $id("cc-login-code-modal")?.classList.remove("active");
      handleGoogleAuth();
    });
    $id("cc-btn-link-google")?.addEventListener("click", async () => {
      try {
        const result = await signInWithPopup(getCookieAuth(), googleProvider);
        const user = result.user;
        const oldSaveCode = game.saveCode;
        if (oldSaveCode !== user.uid) {
          game.saveCode = user.uid;
          if (!game.profilePic) game.profilePic = user.photoURL || "";
          await saveGameToServer();
          setupRealtimeListener();
          setupTradeListeners();
          if (oldSaveCode && !oldSaveCode.includes(user.uid)) {
            const fdb = getCookieDb();
            try {
              await deleteDoc(doc(fdb, "stmg_saves", oldSaveCode));
              await deleteDoc(doc(fdb, "stmg_leaderboard", oldSaveCode));
            } catch (_) {}
          }
          await ccShowDialog({ title: "Compte lié", message: "✅ Compte lié à Google et sécurisé !" });
        } else {
          await ccShowDialog({ title: "Déjà lié", message: "Ce compte est déjà lié à cette adresse Google." });
        }
        $id("cc-settings-modal")?.classList.remove("active");
      } catch (error) {
        await ccShowDialog({ title: "Erreur Google", message: "Erreur lors de la liaison Google : " + (error?.message || "") });
      }
    });

    $id("cc-btn-signup")?.addEventListener("click", async () => {
      const btn = $id("cc-btn-signup");
      btn.disabled = true;
      btn.innerText = "Vérification…";
      try {
        await signUpCookieAccount($id("cc-username-input").value);
      } catch (_) {
        await ccShowDialog({ title: "Erreur", message: "Erreur serveur Firebase Cookie Clicker." });
      } finally {
        btn.disabled = false;
        btn.innerText = "Créer un code";
      }
    });

    $id("cc-btn-quick-dnb")?.addEventListener("click", async () => {
      if (!window.currentUser?.username) return;
      await signUpCookieAccount(window.currentUser.username);
    });

    $id("cc-btn-login-code")?.addEventListener("click", openLoginModal);
    $id("cc-btn-import-footer")?.addEventListener("click", openLoginModal);

    $id("cc-btn-submit-login")?.addEventListener("click", async () => {
      const btn = $id("cc-btn-submit-login");
      if (!tempLoginData) {
        const code = ($id("cc-login-input-code")?.value || "").trim();
        if (!code) return;
        if (code === "...............................................................................") {
          $id("cc-login-code-modal")?.classList.remove("active");
          ccIsAdmin = true;
          $id("cc-btn-open-admin")?.classList.remove("hidden");
          $id("cc-subtab-admin")?.classList.remove("hidden");
          window.switchCCSubTab("admin");
          return;
        }
        btn.innerText = "Recherche…";
        try {
          const docSnap = await getDoc(doc(getCookieDb(), "stmg_saves", code));
          if (docSnap.exists()) {
            const parsed = JSON.parse(docSnap.data().saveData);
            tempLoginCode = code;
            tempLoginData = parsed;
            if (parsed.password && parsed.password !== "") {
              $id("cc-login-code-step")?.classList.add("hidden");
              $id("cc-login-pwd-step")?.classList.remove("hidden");
              btn.innerText = "Déverrouiller";
            } else {
              await executeLogin(tempLoginCode, tempLoginData);
            }
          } else {
            btn.innerText = "Vérifier";
            await ccShowDialog({ title: "Introuvable", message: "❌ Code Secret introuvable." });
          }
        } catch (_) {
          btn.innerText = "Vérifier";
          await ccShowDialog({ title: "Erreur", message: "Erreur de connexion Firebase." });
        }
      } else {
        const pwd = $id("cc-login-input-pwd")?.value || "";
        if (pwd === tempLoginData.password) {
          await executeLogin(tempLoginCode, tempLoginData);
        } else {
          await ccShowDialog({ title: "Mot de passe incorrect", message: "❌ Mot de passe incorrect." });
        }
      }
    });
    $id("cc-login-input-code")?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") $id("cc-btn-submit-login")?.click();
    });
    $id("cc-login-input-pwd")?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") $id("cc-btn-submit-login")?.click();
    });

    $id("cc-btn-show-code")?.addEventListener("click", async () => {
      if (game.saveCode) {
        await ccShowDialog({ type: "prompt", title: "Ton Code Secret", message: "Copie et conserve précieusement ce code pour retrouver ta partie partout :", defaultValue: game.saveCode });
      } else {
        await ccShowDialog({ title: "Mode Invité", message: "Tu joues actuellement en Invité (sauvegarde locale uniquement)." });
      }
    });

    $id("cc-btn-guest")?.addEventListener("click", async () => {
      game = mergeSaveData({});
      game.username = "Invité";
      game.displayName = window.currentUser?.displayName || "Invité";
      game.profilePic = window.currentUser?.avatar || "";
      game.saveCode = "";
      const overlay = $id("cc-username-overlay");
      if (overlay) overlay.style.display = "none";
      $id("cc-shortcuts-bar")?.classList.remove("hidden");
      await fetchGroups();
      renderCompanions();
      recalculateStats();
      updateUI();
      loadLeaderboards();
    });

    $id("cc-btn-save-data")?.addEventListener("click", async () => {
      const btn = $id("cc-btn-save-data");
      btn.innerText = "⏳ Sauvegarde…";
      btn.disabled = true;
      await saveGameToServer();
      await loadLeaderboards();
      btn.innerText = "💾 Sauvegarder";
      btn.disabled = false;
      ccShowDialog({ title: "Sauvegarde en ligne", message: "✅ Partie sauvegardée dans Firebase !" });
    });

    $id("cc-btn-reset")?.addEventListener("click", async () => {
      if (await ccShowDialog({ type: "confirm", title: "Reset local", message: "Effacer ton cache local ? (Ton compte en ligne reste intact si tu as ton Code Secret)" })) {
        if (companionAutoClickInterval) { clearInterval(companionAutoClickInterval); companionAutoClickInterval = null; }
        game = JSON.parse(JSON.stringify(defaultSave));
        localStorage.removeItem("danCookieSave_v6");
        unsavedProgress = false;
        const overlay = $id("cc-username-overlay");
        if (overlay) overlay.style.display = "flex";
        $id("cc-shortcuts-bar")?.classList.add("hidden");
        refreshDnbQuickLinkBtn();
        renderCompanions();
        recalculateStats();
        updateUI();
      }
    });

    $id("cc-btn-ban-logout")?.addEventListener("click", () => {
      if (companionAutoClickInterval) { clearInterval(companionAutoClickInterval); companionAutoClickInterval = null; }
      game = JSON.parse(JSON.stringify(defaultSave));
      localStorage.removeItem("danCookieSave_v6");
      $id("cc-ban-screen")?.classList.add("hidden");
      const overlay = $id("cc-username-overlay");
      if (overlay) overlay.style.display = "flex";
      refreshDnbQuickLinkBtn();
      recalculateStats();
      updateUI();
    });

    // Settings + Profile Pic
    $id("cc-btn-gear")?.addEventListener("click", () => {
      $id("cc-set-display-name").value = game.displayName || game.username;
      $id("cc-set-pwd").value = game.password || "";
      tempProfilePicBase64 = game.profilePic || window.currentUser?.avatar || "";
      const preview = $id("cc-preview-profile-pic");
      const removeBtn = $id("cc-btn-remove-profile-pic");
      if ($id("cc-set-profile-pic-url")) $id("cc-set-profile-pic-url").value = "";
      if ($id("cc-set-profile-pic-file")) $id("cc-set-profile-pic-file").value = "";

      if (tempProfilePicBase64 && preview && removeBtn) {
        preview.src = tempProfilePicBase64;
        preview.classList.remove("hidden");
        removeBtn.classList.remove("hidden");
      } else {
        preview?.classList.add("hidden");
        removeBtn?.classList.add("hidden");
      }
      $id("cc-settings-modal")?.classList.add("active");
    });

    $id("cc-set-profile-pic-file")?.addEventListener("change", (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement("canvas");
          const MAX_SIZE = 150;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_SIZE) { height *= MAX_SIZE / width; width = MAX_SIZE; }
          } else {
            if (height > MAX_SIZE) { width *= MAX_SIZE / height; height = MAX_SIZE; }
          }
          canvas.width = Math.max(1, Math.round(width));
          canvas.height = Math.max(1, Math.round(height));
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          tempProfilePicBase64 = canvas.toDataURL("image/jpeg", 0.8);
          const preview = $id("cc-preview-profile-pic");
          if (preview) {
            preview.src = tempProfilePicBase64;
            preview.classList.remove("hidden");
          }
          $id("cc-btn-remove-profile-pic")?.classList.remove("hidden");
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });

    $id("cc-btn-remove-profile-pic")?.addEventListener("click", () => {
      tempProfilePicBase64 = "";
      $id("cc-preview-profile-pic")?.classList.add("hidden");
      $id("cc-btn-remove-profile-pic")?.classList.add("hidden");
      if ($id("cc-set-profile-pic-url")) $id("cc-set-profile-pic-url").value = "";
      if ($id("cc-set-profile-pic-file")) $id("cc-set-profile-pic-file").value = "";
    });

    $id("cc-btn-save-settings")?.addEventListener("click", async () => {
      game.displayName = $id("cc-set-display-name").value.trim() || game.username;
      game.password = $id("cc-set-pwd").value.trim();
      const urlInput = ($id("cc-set-profile-pic-url")?.value || "").trim();
      game.profilePic = urlInput || tempProfilePicBase64;
      $id("cc-settings-modal")?.classList.remove("active");
      saveLocal();
      await saveGameToServer();
      updateUI();
      loadLeaderboards();
    });

    // Admin actions
    $id("cc-btn-open-admin")?.addEventListener("click", () => window.switchCCSubTab("admin"));
    $id("cc-btn-refresh-admin")?.addEventListener("click", () => loadAdminData());
    $id("cc-btn-reset-wheel-timer")?.addEventListener("click", () => {
      if (currentWheelEditData) {
        currentWheelEditData.lastSpinReset = 0;
        ccShowDialog({ title: "Timer réinitialisé", message: "Timer remis à 0 sec ! Clique sur Sauvegarder pour appliquer au joueur." });
      }
    });
    $id("cc-btn-save-admin-wheel")?.addEventListener("click", async () => {
      if (!currentWheelEditData || !currentWheelEditId) return;
      currentWheelEditData.spinsLeft = parseInt($id("cc-admin-wheel-spins").value, 10) || 0;
      const fdb = getCookieDb();
      await updateDoc(doc(fdb, "stmg_saves", currentWheelEditId), { saveData: JSON.stringify(currentWheelEditData) });
      await updateDoc(doc(fdb, "stmg_leaderboard", currentWheelEditId), { adminEditTimestamp: Date.now() });
      $id("cc-admin-wheel-modal")?.classList.remove("active");
      ccShowDialog({ title: "Roue mise à jour", message: "Paramètres de roue appliqués au joueur !" });
    });

    $id("cc-btn-force-save-all")?.addEventListener("click", async () => {
      if (!ccIsAdmin) return;
      if (!await ccShowDialog({ type: "confirm", title: "Sauvegarde Globale", message: "⚠️ Forcer la sauvegarde de TOUS les joueurs connectés ?" })) return;
      const btn = $id("cc-btn-force-save-all");
      btn.innerText = "Envoi…";
      btn.disabled = true;
      try {
        const fdb = getCookieDb();
        const snap = await getDocs(collection(fdb, "stmg_leaderboard"));
        const now = Date.now();
        const promises = [];
        snap.forEach(d => {
          if (!d.data().banned) promises.push(updateDoc(doc(fdb, "stmg_leaderboard", d.id), { forceSave: now }));
        });
        await Promise.all(promises);
        ccShowDialog({ title: "Signal envoyé", message: "✅ Signal de sauvegarde globale envoyé !" });
      } catch (_) {
        ccShowDialog({ title: "Erreur", message: "Erreur lors de l'envoi du signal." });
      } finally {
        btn.innerText = "⚠️ Forcer Sauvegarde Globale";
        btn.disabled = false;
      }
    });

    $id("cc-btn-create-group")?.addEventListener("click", async () => {
      const name = $id("cc-new-group-name").value.trim();
      const color = $id("cc-new-group-color").value;
      if (!name) {
        ccShowDialog({ title: "Nom requis", message: "Donne un nom au groupe !" });
        return;
      }
      const btn = $id("cc-btn-create-group");
      btn.disabled = true;
      try {
        const id = "grp_" + Date.now();
        await setDoc(doc(getCookieDb(), "stmg_groups", id), { name, color });
        $id("cc-new-group-name").value = "";
        await fetchGroups();
        loadAdminData();
      } finally {
        btn.disabled = false;
      }
    });

    $id("cc-btn-send-chat")?.addEventListener("click", async () => {
      const inp = $id("cc-chat-input");
      const txt = inp?.value.trim();
      if (!txt || !game.username) return;
      const pic = game.profilePic || window.currentUser?.avatar || "";
      await setDoc(doc(collection(getCookieDb(), "stmg_chat")), {
        userId: game.username,
        displayName: game.displayName || game.username,
        dnbUsername: window.currentUser?.username || game.dnbUsername || "",
        dnbAvatar: window.currentUser?.avatar || game.dnbAvatar || "",
        profilePic: pic || null,
        groupId: game.groupId || null,
        text: txt,
        timestamp: serverTimestamp()
      });
      inp.value = "";
    });

    $id("cc-chat-input")?.addEventListener("keypress", (e) => {
      if (e.key === "Enter") $id("cc-btn-send-chat")?.click();
    });

    // Load saved local game & sync from server if saveCode exists
    const saved = localStorage.getItem("danCookieSave_v6");
    if (saved) {
      try {
        game = mergeSaveData(JSON.parse(saved));
      } catch (_) {}
    }

    if (game.username) {
      setupRealtimeListener();
      if (game.saveCode && !game.username.startsWith("Invité")) {
        setupTradeListeners();
        getDoc(doc(getCookieDb(), "stmg_saves", game.saveCode)).then(snap => {
          if (snap.exists()) {
            game = mergeSaveData(JSON.parse(snap.data().saveData));
            saveLocal();
            if (game.banned) $id("cc-ban-screen")?.classList.remove("hidden");
            else {
              renderCompanions();
              recalculateStats();
              updateUI();
            }
          }
        }).catch(() => {});
      }
      if (game.banned) {
        $id("cc-ban-screen")?.classList.remove("hidden");
      } else {
        fetchGroups().then(() => finishLogin());
      }
    } else {
      const overlay = $id("cc-username-overlay");
      if (overlay) overlay.style.display = "flex";
      refreshDnbQuickLinkBtn();
    }

    setInterval(() => {
      if (currentCps > 0 && game.username && !game.banned) {
        const toAdd = currentCps / 10;
        game.cookies += ccValidateNum(toAdd);
        game.totalCookies += ccValidateNum(toAdd);
        updateUI();
      }
      if (game.username && !game.banned) updateSugars();
    }, 100);

    setInterval(() => {
      if (game.username && !game.username.startsWith("Invité") && !game.banned) game.playtime++;
      if (unsavedProgress && game.saveCode) $id("cc-reminder-text")?.classList.remove("hidden");
      checkSpinTimer();
      saveLocal();
    }, 1000);

    window.addEventListener("beforeunload", () => {
      if (unsavedProgress && !game.banned && game.saveCode) saveGameToServer();
    });

    spawnGoldenCookieLoop();
  }

  window.switchCCSubTab = (tabName) => {
    document.querySelectorAll("#cc-nav-tabs .cc-subtab").forEach(b => {
      b.classList.toggle("active", b.dataset.cctab === tabName);
    });
    document.querySelectorAll("#cc-easter-modal .cc-tab-panel").forEach(p => {
      p.classList.toggle("active", p.id === `cc-tab-${tabName}`);
    });
    if (tabName === "game") {
      requestAnimationFrame(() => updateOrbitingCursors(true));
    }
    if (tabName === "wheel") {
      checkSpinTimer();
      renderWheelVisuals();
    }
    if (tabName === "comps") {
      renderCompanions();
    }
    if (tabName === "trade") {
      renderTradePlayersList();
    }
    if (tabName === "chat") {
      $id("cc-chat-badge")?.classList.add("hidden");
    }
    if (tabName === "rankings") loadLeaderboards();
    if (tabName === "admin" && ccIsAdmin) loadAdminData();
  };

  window.refreshCookieClickerThemeSync = () => {
    const sel = $id("cc-theme-quick-select");
    const theme = localStorage.getItem("dnb_theme") || document.documentElement.getAttribute("data-theme") || "light";
    if (sel) sel.value = theme;
    if (ccInitialized) {
      updateLiquidColor();
    }
  };

  window.refreshCookieClickerLinks = () => {
    refreshDnbQuickLinkBtn();
    window.refreshCookieClickerThemeSync();
    if (ccInitialized) {
      recalculateStats();
      updateUI();
      if ($id("cc-tab-rankings")?.classList.contains("active")) loadLeaderboards();
    } else {
      const reviz = getDnBRevizStudyBonus();
      const bonusEl = $id("cc-reviz-bonus-text");
      if (bonusEl) bonusEl.innerText = `Bonus Révision : +${reviz.totalPct}% (×${reviz.multiplier.toFixed(2)})`;
    }
  };

  window.openCookieClickerEasterEgg = () => {
    const modal = $id("cc-easter-modal");
    if (!modal) return;
    modal.classList.remove("hidden");
    initCookieClickerOnce();
    window.refreshCookieClickerLinks();
    requestAnimationFrame(() => updateOrbitingCursors(true));
  };

  window.closeCookieClickerEasterEgg = () => {
    const modal = $id("cc-easter-modal");
    if (!modal) return;
    if (unsavedProgress && game.saveCode && !game.banned) {
      saveGameToServer();
    }
    modal.classList.add("hidden");
    document.title = "DnB Reviz";
  };
})();
