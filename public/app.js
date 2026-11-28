const dateNode = document.querySelector("#today-date");
const statusNode = document.querySelector("#api-status");
const authForm = document.querySelector("#auth-form");
const authMessage = document.querySelector("#auth-message");
const authSubmit = document.querySelector("#auth-submit");
const loginTab = document.querySelector("#login-tab");
const signupTab = document.querySelector("#signup-tab");
const signedInState = document.querySelector("#signed-in-state");
const signedInEmail = document.querySelector("#signed-in-email");
const signoutButton = document.querySelector("#signout-button");
const authDescription = document.querySelector("#auth-description");
const authTabs = document.querySelector(".auth-tabs");
const resendButton = document.querySelector("#resend-confirmation");

let authMode = "login";
let authConfigured = false;

if (dateNode) {
  dateNode.textContent = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date());
}

function showMessage(message, success = false) {
  if (!authMessage) return;
  authMessage.textContent = message;
  authMessage.className = success ? "form-message success" : "form-message";
}

function setAuthMode(mode) {
  authMode = mode;
  loginTab?.classList.toggle("active", mode === "login");
  signupTab?.classList.toggle("active", mode === "signup");
  const password = document.querySelector("#auth-password");
  if (password) password.autocomplete = mode === "login" ? "current-password" : "new-password";
  if (authSubmit) authSubmit.textContent = mode === "login" ? "Sign in to GiGo" : "Create my account";
  showMessage("");
  if (resendButton) resendButton.hidden = mode !== "login";
}

// Supabase email confirmation returns session tokens in the URL fragment.
// Capture them before the normal API/session check, then remove them from browser history.
function captureConfirmationSession() {
  if (!window.location.hash || !window.location.hash.includes("access_token=")) return;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  if (accessToken && refreshToken) {
    storeSession({ access_token: accessToken, refresh_token: refreshToken });
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
    showMessage("Email confirmed. Your GiGo session is being verified.", true);
  }
}

function storeSession(session) {
  if (!session?.access_token || !session?.refresh_token) return false;
  sessionStorage.setItem("gigo_access_token", session.access_token);
  sessionStorage.setItem("gigo_refresh_token", session.refresh_token);
  return true;
}

function clearSession() {
  sessionStorage.removeItem("gigo_access_token");
  sessionStorage.removeItem("gigo_refresh_token");
}

async function api(path, options = {}) {
  const token = sessionStorage.getItem("gigo_access_token");
  const headers = new Headers(options.headers || {});
  headers.set("accept", "application/json");
  if (options.body) headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(path, { ...options, headers });
}

async function refreshSession() {
  const refreshToken = sessionStorage.getItem("gigo_refresh_token");
  if (!refreshToken) return false;
  try {
    const response = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    const payload = await response.json();
    if (!response.ok || !storeSession(payload?.data)) {
      clearSession();
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

async function loadIdentity() {
  let response = await api("/api/v1/me");
  if (response.status === 401 && await refreshSession()) response = await api("/api/v1/me");
  if (!response.ok) {
    clearSession();
    showLoginForm();
    return;
  }
  const payload = await response.json();
  showSignedIn(payload?.data?.email || "GiGo owner");
}

function showSignedIn(email) {
  if (authTabs) authTabs.hidden = true;
  if (authForm) authForm.hidden = true;
  if (authTabs) authTabs.hidden = true;
  if (signedInState) signedInState.hidden = false;
  if (signedInEmail) signedInEmail.textContent = email;
  if (authDescription) authDescription.textContent = "Your private GiGo account is connected.";
  const avatar = document.querySelector(".profile-avatar");
  if (avatar) avatar.textContent = String(email).slice(0, 1).toUpperCase();
  showMessage("");
}

function showLoginForm() {
  if (authTabs) authTabs.hidden = false;
  if (authForm) authForm.hidden = false;
  if (authTabs) authTabs.hidden = false;
  if (signedInState) signedInState.hidden = true;
  if (authDescription) authDescription.textContent = authConfigured
    ? "Sign in to your private GiGo owner account, or create your account to get started."
    : "Create your private owner account or sign in. Authentication becomes available after the Supabase connection is configured.";
}

async function checkApi() {
  if (!statusNode) return;
  try {
    const response = await fetch("/api/v1/status", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error("API unavailable");
    const payload = await response.json();
    if (payload?.data?.status !== "ok") throw new Error("Unexpected API response");
    statusNode.className = "api-status online";
    statusNode.innerHTML = "<i></i> API online";
    authConfigured = Boolean(payload.data.auth_configured);
    if (!authConfigured) {
      showLoginForm();
      showMessage("Supabase is not connected yet. GiGo cannot create or verify accounts until its project credentials are configured.");
      if (authSubmit) authSubmit.disabled = true;
      for (const field of authForm?.querySelectorAll("input") || []) field.disabled = true;
      return;
    }
    if (authSubmit) authSubmit.disabled = false;
    for (const field of authForm?.querySelectorAll("input") || []) field.disabled = false;
    const token = sessionStorage.getItem("gigo_access_token");
    if (token) await loadIdentity();
    else showLoginForm();
  } catch {
    statusNode.className = "api-status offline";
    statusNode.innerHTML = "<i></i> API not connected";
    showMessage("The GiGo API could not be reached. Authentication is unavailable.");
  }
}

resendButton?.addEventListener("click", async () => {
  const email = document.querySelector("#auth-email")?.value.trim();
  if (!email) return showMessage("Enter your account email first.");
  resendButton.disabled = true;
  try {
    const response = await fetch("/api/v1/auth/resend", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "Could not resend confirmation email.");
    showMessage("If this account is still awaiting confirmation, a new email has been requested. Check your inbox and spam folder.", true);
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "Could not resend confirmation email.");
  } finally {
    resendButton.disabled = false;
  }
});

loginTab?.addEventListener("click", () => setAuthMode("login"));
signupTab?.addEventListener("click", () => setAuthMode("signup"));

authForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!authConfigured) return;
  const email = document.querySelector("#auth-email")?.value.trim();
  const password = document.querySelector("#auth-password")?.value;
  if (!email || !password) return showMessage("Enter your email and password.");
  authSubmit.disabled = true;
  authSubmit.textContent = authMode === "login" ? "Signing in…" : "Creating account…";
  showMessage("");
  try {
    const response = await fetch(authMode === "login" ? "/api/v1/auth/login" : "/api/v1/auth/signup", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email, password })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error?.message || "The request could not be completed.");
    if (storeSession(payload?.data)) {
      await loadIdentity();
      showMessage(authMode === "signup" ? "Account created and signed in." : "Signed in successfully.", true);
    } else if (authMode === "signup") {
      setAuthMode("login");
      showMessage("Account created. Check your email for the confirmation link, then return here to sign in. If the link was sent before the redirect fix, request a new one below.", true);
      if (resendButton) resendButton.hidden = false;
    } else {
      throw new Error("The provider did not return a session. Check your email confirmation settings and try again.");
    }
  } catch (error) {
    showMessage(error instanceof Error ? error.message : "Something went wrong. Try again.");
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = authMode === "login" ? "Sign in to GiGo" : "Create my account";
  }
});

signoutButton?.addEventListener("click", async () => {
  signoutButton.disabled = true;
  const token = sessionStorage.getItem("gigo_access_token");
  try {
    if (token) {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: { authorization: `Bearer ${token}` }
      });
    }
  } finally {
    clearSession();
    showLoginForm();
    showMessage("You have signed out.", true);
    signoutButton.disabled = false;
    const avatar = document.querySelector(".profile-avatar");
    if (avatar) avatar.textContent = "O";
  }
});

captureConfirmationSession();
checkApi();
