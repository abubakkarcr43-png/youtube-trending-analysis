/*
  Auth page UX helpers
  - Client-side validation (still backed by server-side validation in Flask)
  - Show inline field errors
  - Toggle password visibility
  - Show loading spinner during form submit
*/

(() => {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const spinner = $("#authSpinner");
  const showSpinner = (on) => {
    if (!spinner) return;
    spinner.classList.toggle("is-on", on);
    spinner.setAttribute("aria-hidden", String(!on));
  };

  const setFieldError = (name, msg) => {
    const el = document.querySelector(`[data-error-for="${name}"]`);
    if (!el) return;
    el.textContent = msg || "";
  };

  const clearErrors = () => {
    $$("[data-error-for]").forEach((e) => (e.textContent = ""));
  };

  const validateEmail = (email) => {
    const v = (email || "").trim();
    return v.includes("@") && v.includes(".") && v.length >= 6;
  };

  /** Login uses username (demo) or email (registered); do not require @ for username. */
  const validateLogin = (form) => {
    const username = (form.username?.value || form.email?.value || "").trim();
    const password = form.password?.value || "";
    let ok = true;

    if (username.length < 1) {
      setFieldError("username", "Enter your username.");
      ok = false;
    } else if (username.includes("@")) {
      if (!validateEmail(username)) {
        setFieldError("username", "Enter a valid email address.");
        ok = false;
      }
    }
    if (!password) {
      setFieldError("password", "Password is required.");
      ok = false;
    }
    return ok;
  };

  const validateRegister = (form) => {
    const name = (form.name?.value || "").trim();
    const email = form.email?.value || "";
    const password = form.password?.value || "";
    const confirm = form.confirm_password?.value || "";
    let ok = true;

    if (name.length < 2) {
      setFieldError("name", "Enter your full name.");
      ok = false;
    }
    if (!validateEmail(email)) {
      setFieldError("email", "Enter a valid email address.");
      ok = false;
    }
    if (password.length < 6) {
      setFieldError("password", "Password must be at least 6 characters.");
      ok = false;
    }
    if (confirm !== password) {
      setFieldError("confirm_password", "Passwords do not match.");
      ok = false;
    }
    return ok;
  };

  // Password visibility toggles
  $$(".field__toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const control = btn.closest(".field__control");
      const input = control?.querySelector("input");
      const icon = btn.querySelector("i");
      if (!input) return;
      const isPassword = input.type === "password";
      input.type = isPassword ? "text" : "password";
      if (icon) icon.className = isPassword ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
    });
  });

  // Form handlers
  const loginForm = $("#loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      clearErrors();
      const ok = validateLogin(loginForm);
      if (!ok) {
        e.preventDefault();
        return;
      }
      showSpinner(true);
    });
  }

  const registerForm = $("#registerForm");
  if (registerForm) {
    registerForm.addEventListener("submit", (e) => {
      clearErrors();
      const ok = validateRegister(registerForm);
      if (!ok) {
        e.preventDefault();
        return;
      }
      showSpinner(true);
    });
  }
})();

