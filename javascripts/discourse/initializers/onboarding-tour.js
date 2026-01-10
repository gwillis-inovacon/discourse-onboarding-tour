import { withPluginApi } from "discourse/lib/plugin-api";
import I18n from "discourse-i18n";

const STORAGE_KEY_ANON = "discourse_tour_anonymous_completed";
const STORAGE_KEY_LOGGED_IN = "discourse_tour_logged_in_completed";

// Default step configs with inline text (custom steps from Tour Editor)
const DEFAULT_STEPS_ANONYMOUS = [
  { selector: "#search-button", title: "Search", description: "Find topics, posts, and users across the forum.", side: "bottom" },
  { selector: ".topic-list, .latest-topic-list", title: "Discussions", description: "Browse conversations and see what the community is talking about.", side: "top" },
  { selector: ".sign-up-button, .btn-primary.sign-up", title: "Join Us", description: "Create an account to participate in discussions.", side: "bottom" },
];

const DEFAULT_STEPS_LOGGED_IN = [
  { selector: ".header-sidebar-toggle, #toggle-hamburger-menu", title: "Navigation", description: "Browse categories, tags, and find your way around.", side: "bottom" },
  { selector: "#search-button", title: "Search", description: "Find topics, posts, and users across the forum.", side: "bottom" },
  { selector: ".header-dropdown-toggle.current-user", title: "Your Profile", description: "Access notifications, messages, bookmarks, and settings.", side: "bottom" },
  { selector: ".topic-list, .latest-topic-list", title: "Discussions", description: "Browse and join conversations with the community.", side: "top" },
  { selector: "#create-topic", title: "New Topic", description: "Start a new discussion and share your thoughts.", side: "top" },
];

// themePrefix is auto-injected by Discourse for theme components
function t(key) {
  return I18n.t(themePrefix(key));
}

// Get localized text from multi-language object with fallback
// Supports: { en: "...", es: "...", pt: "..." } or plain string
function getLocalizedText(textObj) {
  if (!textObj) return "";

  // If it's a plain string, return it
  if (typeof textObj === "string") return textObj;

  // If it's an object, pick the right language
  if (typeof textObj === "object") {
    const locale = I18n.currentLocale() || "en";
    const lang = locale.split("-")[0]; // "pt-BR" -> "pt"

    // Try user's language first
    if (textObj[lang]) return textObj[lang];

    // Fallback to English
    if (textObj.en) return textObj.en;

    // Fallback to first available
    const available = Object.values(textObj).find(v => v);
    if (available) return available;
  }

  return "";
}

function getStorageKey(isLoggedIn) {
  return isLoggedIn ? STORAGE_KEY_LOGGED_IN : STORAGE_KEY_ANON;
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

function setCookie(name, value, days) {
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${value}; expires=${expires}; path=/; SameSite=Lax`;
}

function hasCompletedTour(isLoggedIn) {
  const key = getStorageKey(isLoggedIn);
  const value = getCookie(key);
  console.log(`[Onboarding Tour] Checking completion: key=${key}, value=${value}, isCompleted=${value === "true"}`);
  return value === "true";
}

function markTourCompleted(isLoggedIn) {
  const key = getStorageKey(isLoggedIn);
  setCookie(key, "true", 365); // Expires in 1 year
  console.log(`[Onboarding Tour] Marked tour completed: ${key}`);
}

function parseStepsConfig(jsonString, defaults) {
  if (!jsonString || jsonString === "[]") {
    return defaults;
  }
  try {
    const parsed = JSON.parse(jsonString);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return defaults;
  } catch (e) {
    console.warn("[Onboarding Tour] Failed to parse steps config:", e);
    return defaults;
  }
}

function findElement(selector) {
  if (!selector || selector.trim() === "") {
    return null;
  }
  const selectors = selector.split(",").map(s => s.trim());
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function isMobileDevice() {
  return window.innerWidth < 768;
}

function shouldShowStep(step) {
  const device = step.device || "all";
  if (device === "all") return true;
  const isMobile = isMobileDevice();
  if (device === "mobile" && isMobile) return true;
  if (device === "desktop" && !isMobile) return true;
  return false;
}

function buildTourSteps(stepsConfig, themeSettings) {
  const steps = [];

  // Welcome step (no element) - use settings or fallback to translation
  steps.push({
    popover: {
      title: themeSettings.welcome_title || t("welcome_title"),
      description: themeSettings.welcome_description || t("welcome_description"),
    },
  });

  // Build steps from config
  for (const step of stepsConfig) {
    // Skip steps that shouldn't show on current device
    if (!shouldShowStep(step)) {
      console.log(`[Onboarding Tour] Skipping step (device: ${step.device}, current: ${isMobileDevice() ? 'mobile' : 'desktop'})`);
      continue;
    }

    const isCenteredStep = !step.selector || step.selector.trim() === "";

    // Get localized title and description from step config
    const title = getLocalizedText(step.title);
    const description = getLocalizedText(step.description);

    if (isCenteredStep) {
      // Centered modal step (no element)
      steps.push({
        popover: {
          title: title,
          description: description,
        },
      });
    } else {
      // Element-targeted step
      const element = findElement(step.selector);
      if (element) {
        steps.push({
          element: element,
          popover: {
            title: title,
            description: description,
            side: step.side || "bottom",
            align: step.align || "center",
          },
        });
      } else {
        console.log(`[Onboarding Tour] Element not found: ${step.selector}`);
      }
    }
  }

  // Done step (no element) - use settings or fallback to translation
  steps.push({
    popover: {
      title: themeSettings.done_title || t("done_title"),
      description: themeSettings.done_description || t("done_description"),
    },
  });

  return steps;
}

function startTour(stepsConfig, isLoggedIn, themeSettings) {
  if (typeof window.driver === "undefined") {
    console.warn("[Onboarding Tour] Driver.js not loaded");
    return;
  }

  const steps = buildTourSteps(stepsConfig, themeSettings);
  console.log("[Onboarding Tour] Starting tour with steps:", steps);

  if (steps.length === 0) {
    console.log("[Onboarding Tour] No steps found, skipping tour");
    return;
  }

  const driverObj = window.driver.js.driver({
    showProgress: true,
    animate: false,
    allowClose: true,
    overlayClickBehavior: "close",
    stagePadding: 0,
    stageRadius: 0,
    popoverOffset: 16,
    nextBtnText: t("next_button"),
    prevBtnText: t("prev_button"),
    doneBtnText: t("done_button"),
    onDestroyStarted: () => {
      markTourCompleted(isLoggedIn);
      driverObj.destroy();
    },
    steps: steps,
  });

  driverObj.drive();
}

function shouldShowTour(api, themeSettings, isLoggedIn) {
  if (!themeSettings.tour_enabled) {
    console.log("[Onboarding Tour] Tour is disabled in settings");
    return false;
  }

  if (hasCompletedTour(isLoggedIn)) {
    console.log("[Onboarding Tour] Tour already completed for this user type");
    return false;
  }

  if (isLoggedIn) {
    const currentUser = api.getCurrentUser();
    if (currentUser) {
      const trustLevel = currentUser.trust_level || 0;
      if (trustLevel > themeSettings.target_trust_level) {
        console.log("[Onboarding Tour] Trust level too high:", trustLevel);
        return false;
      }
    }
  }

  return true;
}

function isHomePage(url) {
  const homePatterns = [
    /^\/$/,
    /^\/latest\/?$/,
    /^\/top\/?$/,
    /^\/categories\/?$/,
    /^\/new\/?$/,
    /^\/unread\/?$/,
  ];
  return homePatterns.some((pattern) => pattern.test(url));
}

function getThemeSettings() {
  return {
    tour_enabled: settings.tour_enabled !== false,
    tour_delay_ms: settings.tour_delay_ms || 1500,
    target_trust_level: settings.target_trust_level ?? 4,
    tour_steps_anonymous: settings.tour_steps_anonymous || "[]",
    tour_steps_logged_in: settings.tour_steps_logged_in || "[]",
  };
}

export default {
  name: "onboarding-tour",

  initialize() {
    withPluginApi("1.0", (api) => {
      let tourTriggered = false;
      const themeSettings = getThemeSettings();
      const currentUser = api.getCurrentUser();
      const isLoggedIn = !!currentUser;

      console.log("[Onboarding Tour] Initializing. Logged in:", isLoggedIn);

      const stepsConfig = isLoggedIn
        ? parseStepsConfig(themeSettings.tour_steps_logged_in, DEFAULT_STEPS_LOGGED_IN)
        : parseStepsConfig(themeSettings.tour_steps_anonymous, DEFAULT_STEPS_ANONYMOUS);

      console.log("[Onboarding Tour] Using steps config:", stepsConfig);

      api.onPageChange((url) => {
        if (tourTriggered) {
          return;
        }

        if (!isHomePage(url)) {
          return;
        }

        if (!shouldShowTour(api, themeSettings, isLoggedIn)) {
          return;
        }

        tourTriggered = true;
        console.log("[Onboarding Tour] Starting tour in", themeSettings.tour_delay_ms, "ms");

        setTimeout(() => {
          startTour(stepsConfig, isLoggedIn, themeSettings);
        }, themeSettings.tour_delay_ms);
      });
    });
  },
};
