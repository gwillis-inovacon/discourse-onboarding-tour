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

function openMobileSidebar() {
  // Try various sidebar toggle selectors used by Discourse
  const toggleSelectors = [
    ".header-sidebar-toggle button",
    ".header-sidebar-toggle",
    "#toggle-hamburger-menu",
    ".hamburger-dropdown",
    "[data-toggle='sidebar']"
  ];

  for (const selector of toggleSelectors) {
    const toggle = document.querySelector(selector);
    if (toggle) {
      // Check if sidebar is already open
      const sidebar = document.querySelector(".sidebar-wrapper.sidebar-visible, .sidebar-container.visible, .d-sidebar");
      if (sidebar && sidebar.offsetParent !== null) {
        console.log("[Onboarding Tour] Sidebar already open");
        return true;
      }

      console.log("[Onboarding Tour] Opening sidebar via:", selector);
      toggle.click();
      return true;
    }
  }

  console.log("[Onboarding Tour] Could not find sidebar toggle");
  return false;
}

function startTour(stepsConfig, isLoggedIn, themeSettings) {
  if (typeof window.driver === "undefined") {
    console.warn("[Onboarding Tour] Driver.js not loaded");
    return;
  }

  // Build step configs with sidebar info preserved
  const stepConfigs = buildTourStepConfigs(stepsConfig, themeSettings);
  console.log("[Onboarding Tour] Starting tour with step configs:", stepConfigs);

  if (stepConfigs.length === 0) {
    console.log("[Onboarding Tour] No steps found, skipping tour");
    return;
  }

  let currentStepIndex = 0;
  let driverObj = null;

  function showStep(index) {
    if (index < 0 || index >= stepConfigs.length) return;

    const config = stepConfigs[index];
    currentStepIndex = index;

    // Check if this step needs to open sidebar first
    if (config.openSidebar) {
      console.log("[Onboarding Tour] Opening sidebar for step", index);
      openMobileSidebar();

      // Wait for sidebar to render, then find element and show step
      setTimeout(() => {
        displayStep(config, index);
      }, 500);
    } else {
      displayStep(config, index);
    }
  }

  function displayStep(config, index) {
    // Build the actual Driver.js step
    const step = buildDriverStep(config);
    if (!step) {
      // Skip to next step if element not found
      console.log("[Onboarding Tour] Skipping step - element not found");
      if (index < stepConfigs.length - 1) {
        showStep(index + 1);
      }
      return;
    }

    // Destroy previous driver instance if exists
    if (driverObj) {
      driverObj.destroy();
    }

    const isLastStep = index === stepConfigs.length - 1;
    const isFirstStep = index === 0;

    // Add progress indicator to title
    const progress = `(${index + 1}/${stepConfigs.length}) `;
    if (step.popover && step.popover.title) {
      step.popover.title = progress + step.popover.title;
    }

    // Add navigation buttons and callbacks directly to the step popover
    step.popover.showButtons = isFirstStep ? ["next", "close"] : ["next", "previous", "close"];
    step.popover.nextBtnText = isLastStep ? t("done_button") : t("next_button");
    step.popover.prevBtnText = t("prev_button");
    step.popover.onNextClick = () => {
      if (isLastStep) {
        markTourCompleted(isLoggedIn);
        driverObj.destroy();
      } else {
        driverObj.destroy();
        showStep(index + 1);
      }
    };
    step.popover.onPrevClick = () => {
      if (!isFirstStep) {
        driverObj.destroy();
        showStep(index - 1);
      }
    };

    driverObj = window.driver.js.driver({
      showProgress: false,
      animate: false,
      allowClose: true,
      overlayClickBehavior: "close",
      stagePadding: 0,
      stageRadius: 0,
      popoverOffset: 16,
      onDestroyStarted: () => {
        markTourCompleted(isLoggedIn);
        driverObj.destroy();
      },
    });

    driverObj.highlight(step);
  }

  function buildDriverStep(config) {
    if (config.isCentered) {
      return {
        popover: {
          title: config.title,
          description: config.description,
        },
      };
    } else {
      const element = findElement(config.selector);
      if (!element) {
        console.log(`[Onboarding Tour] Element not found: ${config.selector}`);
        return null;
      }
      return {
        element: element,
        popover: {
          title: config.title,
          description: config.description,
          side: config.side || "bottom",
          align: config.align || "center",
        },
      };
    }
  }

  // Start with first step
  showStep(0);
}

function buildTourStepConfigs(stepsConfig, themeSettings) {
  const configs = [];

  // Welcome step
  configs.push({
    isCentered: true,
    title: themeSettings.welcome_title || t("welcome_title"),
    description: themeSettings.welcome_description || t("welcome_description"),
    openSidebar: false,
  });

  // Build step configs from user config
  for (const step of stepsConfig) {
    if (!shouldShowStep(step)) {
      continue;
    }

    const isCentered = !step.selector || step.selector.trim() === "";

    configs.push({
      isCentered: isCentered,
      selector: step.selector,
      title: getLocalizedText(step.title),
      description: getLocalizedText(step.description),
      side: step.side,
      align: step.align,
      openSidebar: step.openSidebar || false,
    });
  }

  // Done step
  configs.push({
    isCentered: true,
    title: themeSettings.done_title || t("done_title"),
    description: themeSettings.done_description || t("done_description"),
    openSidebar: false,
  });

  return configs;
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
