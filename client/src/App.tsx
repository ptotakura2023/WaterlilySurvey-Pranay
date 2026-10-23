type User = {
  id: string;
  email: string;
  createdAt: string;
};

type Question = {
  id: string;
  text: string;
  type: string;
  isRequired: boolean;
  sortOrder: number;
};

type SurveySummary = {
  id: string;
  title: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  ownerId: string;
  _count: {
    questions: number;
    submissions: number;
  };
};

type Survey = Omit<SurveySummary, "_count"> & {
  questions: Question[];
};

type AppState = {
  auth: "checking" | "error" | "signed-out" | "signed-in";
  user: User | null;
  authMode: "login" | "register";
  view: "list" | "detail";
  surveys: SurveySummary[];
  surveysLoading: boolean;
  selectedSurvey: Survey | null;
  detailLoading: boolean;
  creatingSurvey: boolean;
  editingSurvey: boolean;
  busy: boolean;
  error: string;
  notice: string;
};

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:5000";

const state: AppState = {
  auth: "checking",
  user: null,
  authMode: "login",
  view: "list",
  surveys: [],
  surveysLoading: false,
  selectedSurvey: null,
  detailLoading: false,
  creatingSurvey: false,
  editingSurvey: false,
  busy: false,
  error: "",
  notice: "",
};

function escapeHtml(value: string): string {
  const replacements: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return value.replace(/[&<>"']/g, (character) => replacements[character]);
}

function displayError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body: { error?: unknown } = await response.json();
      if (typeof body.error === "string" && body.error) {
        message = body.error;
      }
    } catch {
      // Keep the HTTP status message when the server does not return JSON.
    }
    throw new Error(message);
  }

  return response;
}

async function getJson<T>(path: string): Promise<T> {
  return request(path).then((response) => response.json() as Promise<T>);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : new Intl.DateTimeFormat(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}

function renderAuth(): string {
  if (state.auth === "checking") {
    return `
      <main class="auth-layout">
        <div class="loading-panel" role="status"><span class="spinner"></span>Checking your session…</div>
      </main>`;
  }

  if (state.auth === "error") {
    return `
      <main class="auth-layout">
        <section class="auth-card">
          <a class="brand" href="#" aria-label="Waterlily home"><span class="brand-mark">w</span> waterlily</a>
          <h1>We couldn't connect</h1>
          <p class="muted">Your session could not be checked. Make sure the API is running, then try again.</p>
          <p class="form-error" role="alert">${escapeHtml(state.error)}</p>
          <button class="button button-primary button-full" data-action="retry-session">Try again</button>
        </section>
      </main>`;
  }

  const isRegister = state.authMode === "register";
  return `
    <main class="auth-layout">
      <section class="auth-card">
        <a class="brand" href="#" aria-label="Waterlily home"><span class="brand-mark">w</span> waterlily</a>
        <p class="eyebrow">A little more listening goes a long way</p>
        <h1>${isRegister ? "Create your account" : "Welcome back"}</h1>
        <p class="muted">${isRegister ? "Start collecting thoughtful customer feedback." : "Sign in to manage your customer surveys."}</p>
        ${state.error ? `<p class="form-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
        <form data-form="auth" class="form-stack">
          <label for="email">Email address</label>
          <input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required maxlength="254" />
          <label for="password">Password</label>
          <input id="password" name="password" type="password" autocomplete="${isRegister ? "new-password" : "current-password"}" placeholder="${isRegister ? "At least 8 characters" : "Your password"}" required minlength="${isRegister ? "8" : "1"}" />
          <button class="button button-primary button-full" type="submit" ${state.busy ? "disabled" : ""}>
            ${state.busy ? "Please wait…" : isRegister ? "Create account" : "Sign in"}
          </button>
        </form>
        <p class="auth-switch">
          ${isRegister ? "Already have an account?" : "New to Waterlily?"}
          <button class="text-button" data-action="toggle-auth" ${state.busy ? "disabled" : ""}>${isRegister ? "Sign in" : "Create an account"}</button>
        </p>
      </section>
    </main>`;
}

function renderSurveyCard(survey: SurveySummary): string {
  const title = escapeHtml(survey.title);
  const description = survey.description
    ? `<p class="survey-description">${escapeHtml(survey.description)}</p>`
    : `<p class="survey-description muted">No description yet</p>`;

  return `
    <article class="survey-card">
      <button class="survey-card-main" data-action="open-survey" data-id="${escapeHtml(survey.id)}">
        <span class="survey-card-icon" aria-hidden="true">✳</span>
        <span class="survey-card-copy">
          <span class="survey-card-title">${title}</span>
          ${description}
          <span class="survey-meta">${survey._count.questions} ${survey._count.questions === 1 ? "question" : "questions"} <span aria-hidden="true">·</span> Updated ${formatDate(survey.updatedAt)}</span>
        </span>
        <span class="arrow" aria-hidden="true">↗</span>
      </button>
    </article>`;
}

function renderSurveyForm(editing: boolean): string {
  const survey = state.selectedSurvey;
  return `
    <form class="survey-form" data-form="${editing ? "edit-survey" : "create-survey"}">
      <div class="form-heading">
        <div>
          <p class="eyebrow">${editing ? "Survey details" : "New survey"}</p>
          <h2>${editing ? "Update survey" : "Create a survey"}</h2>
        </div>
        <button class="icon-button" type="button" data-action="${editing ? "cancel-edit" : "cancel-create"}" aria-label="Close">×</button>
      </div>
      <label for="survey-title">Title</label>
      <input id="survey-title" name="title" required maxlength="200" value="${editing && survey ? escapeHtml(survey.title) : ""}" placeholder="e.g. Customer feedback" />
      <label for="survey-description">Description <span class="label-optional">Optional</span></label>
      <textarea id="survey-description" name="description" maxlength="5000" rows="3" placeholder="What is this survey about?">${editing && survey?.description ? escapeHtml(survey.description) : ""}</textarea>
      <div class="form-actions">
        <button class="button button-secondary" type="button" data-action="${editing ? "cancel-edit" : "cancel-create"}">Cancel</button>
        <button class="button button-primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Saving…" : editing ? "Save changes" : "Create survey"}</button>
      </div>
    </form>`;
}

function renderList(): string {
  const content = state.surveysLoading
    ? `<div class="loading-panel" role="status"><span class="spinner"></span>Loading your surveys…</div>`
    : state.error && state.surveys.length === 0
      ? `<div class="empty-state"><h2>Surveys couldn't be loaded</h2><p>${escapeHtml(state.error)}</p><button class="button button-secondary" data-action="reload-surveys">Try again</button></div>`
    : state.surveys.length === 0
      ? `
        <section class="empty-state">
          <div class="empty-illustration" aria-hidden="true">✳</div>
          <h2>Your survey space is ready</h2>
          <p>You don't have any surveys yet. Create one to get started. If you expected the sample survey, it may not be seeded for this account.</p>
          <button class="button button-primary" data-action="new-survey">Create your first survey</button>
        </section>`
      : `<div class="survey-list">${state.surveys.map(renderSurveyCard).join("")}</div>`;

  return `
    <section class="page-content">
      <div class="page-heading">
        <div>
          <p class="eyebrow">Your workspace</p>
          <h1>Surveys</h1>
          <p class="muted">A clear view of what your customers are telling you.</p>
        </div>
        <button class="button button-primary" data-action="new-survey">＋ New survey</button>
      </div>
      ${state.error ? `<p class="notice notice-error" role="alert">${escapeHtml(state.error)} <button class="text-button" data-action="reload-surveys">Try again</button></p>` : ""}
      ${state.notice ? `<p class="notice notice-success" role="status">${escapeHtml(state.notice)}</p>` : ""}
      ${state.creatingSurvey ? renderSurveyForm(false) : ""}
      ${content}
    </section>`;
}

function renderDetail(): string {
  if (state.detailLoading) {
    return `<section class="page-content"><div class="loading-panel" role="status"><span class="spinner"></span>Loading survey…</div></section>`;
  }

  if (!state.selectedSurvey) {
    return `
      <section class="page-content">
        <button class="back-link" data-action="back-to-surveys"><span aria-hidden="true">←</span> All surveys</button>
        <div class="empty-state">
          <h2>Survey couldn't be loaded</h2>
          <p>${escapeHtml(state.error || "The survey may have been removed or is no longer available to this account.")}</p>
          <button class="button button-secondary" data-action="back-to-surveys">Back to surveys</button>
        </div>
      </section>`;
  }

  const survey = state.selectedSurvey;
  const questions = [...survey.questions]
    .sort((first, second) => first.sortOrder - second.sortOrder)
    .map(
      (question, index) => `
        <li class="question-item">
          <span class="question-number">${String(index + 1).padStart(2, "0")}</span>
          <div class="question-copy">
            <p>${escapeHtml(question.text)}</p>
            <span class="question-type">${escapeHtml(question.type)} <span aria-hidden="true">·</span> ${question.isRequired ? "Required" : "Optional"}</span>
          </div>
        </li>`,
    )
    .join("");

  return `
    <section class="page-content">
      <button class="back-link" data-action="back-to-surveys"><span aria-hidden="true">←</span> All surveys</button>
      ${state.error ? `<p class="notice notice-error" role="alert">${escapeHtml(state.error)}</p>` : ""}
      ${state.notice ? `<p class="notice notice-success" role="status">${escapeHtml(state.notice)}</p>` : ""}
      <div class="detail-heading">
        <div class="survey-card-icon large" aria-hidden="true">✳</div>
        <div class="detail-title">
          <p class="eyebrow">Survey details</p>
          <h1>${escapeHtml(survey.title)}</h1>
          <p class="muted">${survey.description ? escapeHtml(survey.description) : "No description added."}</p>
          <span class="survey-meta">Created ${formatDate(survey.createdAt)}</span>
        </div>
        <div class="detail-actions">
          <button class="button button-secondary" data-action="edit-survey">Edit details</button>
          <button class="button button-danger-quiet" data-action="delete-survey">Delete</button>
        </div>
      </div>
      ${state.editingSurvey ? renderSurveyForm(true) : ""}
      <div class="section-heading">
        <div>
          <p class="eyebrow">What you'll ask</p>
          <h2>Questions <span class="count-pill">${survey.questions.length}</span></h2>
        </div>
      </div>
      ${
        survey.questions.length
          ? `<ol class="question-list">${questions}</ol>`
          : `<div class="inline-empty"><p>This survey doesn't have any questions yet.</p><span>Question editing isn't available in the current survey API.</span></div>`
      }
    </section>`;
}

function render(): void {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) {
    throw new Error("App root element #app was not found");
  }

  if (state.auth !== "signed-in") {
    root.innerHTML = renderAuth();
    return;
  }

  root.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <a class="brand" href="#" aria-label="Waterlily home" data-action="back-to-surveys"><span class="brand-mark">w</span> waterlily</a>
        <div class="account-menu">
          <span class="user-email">${escapeHtml(state.user?.email ?? "")}</span>
          <button class="button button-secondary button-small" data-action="logout" ${state.busy ? "disabled" : ""}>Sign out</button>
        </div>
      </header>
      <main>${state.view === "detail" ? renderDetail() : renderList()}</main>
      <footer class="app-footer"><span>Waterlily</span><span>Make space for every voice.</span></footer>
    </div>`;
}

async function checkSession(): Promise<void> {
  state.auth = "checking";
  state.error = "";
  render();
  try {
    const result = await getJson<{ user: User }>("/api/auth/me");
    state.user = result.user;
    state.auth = "signed-in";
    state.error = "";
    render();
    await loadSurveys();
  } catch (error) {
    if (error instanceof Error && error.message === "Not authenticated") {
      state.auth = "signed-out";
      state.user = null;
    } else {
      state.auth = "error";
      state.error = displayError(error);
    }
    render();
  }
}

async function loadSurveys(): Promise<void> {
  state.surveysLoading = true;
  state.error = "";
  render();
  try {
    const result = await getJson<{ surveys: SurveySummary[] }>("/api/surveys");
    state.surveys = result.surveys;
  } catch (error) {
    state.error = displayError(error);
  } finally {
    state.surveysLoading = false;
    render();
  }
}

async function openSurvey(id: string): Promise<void> {
  state.view = "detail";
  state.selectedSurvey = null;
  state.detailLoading = true;
  state.error = "";
  state.notice = "";
  render();
  try {
    const result = await getJson<{ survey: Survey }>(`/api/surveys/${encodeURIComponent(id)}`);
    state.selectedSurvey = result.survey;
  } catch (error) {
    state.error = displayError(error);
  } finally {
    state.detailLoading = false;
    render();
  }
}

async function handleSubmit(event: SubmitEvent): Promise<void> {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const kind = form.dataset.form;
  if (!kind) {
    return;
  }
  event.preventDefault();
  state.error = "";
  state.notice = "";

  const formData = new FormData(form);
  if (kind === "auth") {
    state.busy = true;
    render();
    const path = state.authMode === "register" ? "/api/auth/register" : "/api/auth/login";
    try {
      const result = await request(path, {
        method: "POST",
        body: JSON.stringify({
          email: formData.get("email"),
          password: formData.get("password"),
        }),
      });
      const body: { user: User } = await result.json();
      state.user = body.user;
      state.auth = "signed-in";
      state.busy = false;
      render();
      await loadSurveys();
    } catch (error) {
      state.busy = false;
      state.error = displayError(error);
      render();
    }
    return;
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const payload = { title, description: description || null };
  state.busy = true;
  render();
  try {
    if (kind === "create-survey") {
      const response = await request("/api/surveys", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const result: { survey: Survey } = await response.json();
      state.creatingSurvey = false;
      state.view = "detail";
      await loadSurveys();
      await openSurvey(result.survey.id);
      state.notice = "Survey created.";
    } else if (kind === "edit-survey" && state.selectedSurvey) {
      await request(`/api/surveys/${encodeURIComponent(state.selectedSurvey.id)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      state.editingSurvey = false;
      await loadSurveys();
      await openSurvey(state.selectedSurvey.id);
      state.notice = "Survey details updated.";
    }
  } catch (error) {
    state.error = displayError(error);
  } finally {
    state.busy = false;
    render();
  }
}

async function handleClick(event: MouseEvent): Promise<void> {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const button = target.closest<HTMLElement>("[data-action]");
  if (!button || button instanceof HTMLButtonElement && button.disabled) {
    return;
  }

  const action = button.dataset.action;
  state.error = "";
  state.notice = "";
  switch (action) {
    case "toggle-auth":
      state.authMode = state.authMode === "login" ? "register" : "login";
      state.error = "";
      render();
      break;
    case "retry-session":
      await checkSession();
      break;
    case "new-survey":
      state.creatingSurvey = true;
      render();
      document.querySelector<HTMLInputElement>("#survey-title")?.focus();
      break;
    case "cancel-create":
      state.creatingSurvey = false;
      render();
      break;
    case "cancel-edit":
      state.editingSurvey = false;
      render();
      break;
    case "edit-survey":
      state.editingSurvey = true;
      render();
      document.querySelector<HTMLInputElement>("#survey-title")?.focus();
      break;
    case "open-survey":
      if (button.dataset.id) {
        await openSurvey(button.dataset.id);
      }
      break;
    case "back-to-surveys":
      state.view = "list";
      state.selectedSurvey = null;
      state.editingSurvey = false;
      state.error = "";
      state.notice = "";
      render();
      break;
    case "reload-surveys":
      await loadSurveys();
      break;
    case "delete-survey":
      if (
        state.selectedSurvey &&
        window.confirm(`Delete "${state.selectedSurvey.title}"? This cannot be undone.`)
      ) {
        state.busy = true;
        render();
        try {
          await request(`/api/surveys/${encodeURIComponent(state.selectedSurvey.id)}`, {
            method: "DELETE",
          });
          state.view = "list";
          state.selectedSurvey = null;
          state.notice = "Survey deleted.";
          await loadSurveys();
        } catch (error) {
          state.error = displayError(error);
        } finally {
          state.busy = false;
          render();
        }
      }
      break;
    case "logout":
      state.busy = true;
      render();
      try {
        await request("/api/auth/logout", { method: "POST" });
        state.user = null;
        state.surveys = [];
        state.selectedSurvey = null;
        state.auth = "signed-out";
        state.authMode = "login";
      } catch (error) {
        state.error = displayError(error);
      } finally {
        state.busy = false;
        render();
      }
      break;
  }
}

export function mountApp(): void {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) {
    throw new Error("App root element #app was not found");
  }

  root.addEventListener("submit", (event) => {
    void handleSubmit(event as SubmitEvent);
  });
  root.addEventListener("click", (event) => {
    void handleClick(event);
  });
  render();
  void checkSession();
}