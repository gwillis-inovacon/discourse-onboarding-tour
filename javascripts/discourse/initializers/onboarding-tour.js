import { withPluginApi } from "discourse/lib/plugin-api";

const STORAGE_KEY_ANON = "discourse_tour_anonymous_completed";
const STORAGE_KEY_LOGGED_IN = "discourse_tour_logged_in_completed";

// Default steps if no config provided
const DEFAULT_STEPS_ANONYMOUS = [
  { selector: "#search-button", title: "Search", description: "Find topics, posts, and users.", side: "bottom" },
  { selector: ".topic-list, .latest-topic-list", title: "Discussions", description: "Browse and join conversations.", side: "top" },
  { selector: ".sign-up-button, .btn-primary.sign-up", title: "Join Us", description: "Create an account to participate.", side: "bottom" },
];

const DEFAULT_STEPS_LOGGED_IN = [
  { selector: ".header-sidebar-toggle, #toggle-hamburger-menu", title: "Navigation", description: "Browse categories and tags.", side: "bottom" },
  { selector: "#search-button", title: "Search", description: "Find topics, posts, and users.", side: "bottom" },
  { selector: ".header-dropdown-toggle.current-user", title: "Your Profile", description: "Notifications, messages, and settings.", side: "bottom" },
  { selector: ".topic-list, .latest-topic-list", title: "Discussions", description: "Browse and join conversations.", side: "top" },
  { selector: "#create-topic", title: "New Topic", description: "Start a new discussion.", side: "top" },
];

function getStorageKey(isLoggedIn) {
  return isLoggedIn ? STORAGE_KEY_LOGGED_IN : STORAGE_KEY_ANON;
}

function hasCompletedTour(isLoggedIn) {
  try {
    return localStorage.getItem(getStorageKey(isLoggedIn)) === "true";
  } catch (e) {
    return false;
  }
}

function markTourCompleted(isLoggedIn) {
  try {
    localStorage.setItem(getStorageKey(isLoggedIn), "true");
  } catch (e) {
    // localStorage not available
  }
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
  // Handle comma-separated selectors (try each one)
  const selectors = selector.split(",").map(s => s.trim());
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function buildTourSteps(stepsConfig, welcomeTitle, welcomeDesc, doneTitle, doneDesc) {
  const steps = [];

  // Welcome step (no element) - only if title or description provided
  if (welcomeTitle || welcomeDesc) {
    steps.push({
      popover: {
        title: welcomeTitle || "Welcome!",
        description: welcomeDesc || "",
      },
    });
  }

  // Build steps from config
  for (const step of stepsConfig) {
    // Check if this is a centered step (no selector)
    const isCenteredStep = !step.selector || step.selector.trim() === "";

    if (isCenteredStep) {
      // Centered modal step (no element)
      steps.push({
        popover: {
          title: step.title || "",
          description: step.description || "",
        },
      });
    } else {
      // Element-targeted step
      const element = findElement(step.selector);
      if (element) {
        steps.push({
          element: element,
          popover: {
            title: step.title || "Feature",
            description: step.description || "",
            side: step.side || "bottom",
            align: step.align || "center",
          },
        });
      } else {
        console.log(`[Onboarding Tour] Element not found for selector: ${step.selector}`);
      }
    }
  }

  // Done step (no element) - only if title or description provided
  if (doneTitle || doneDesc) {
    steps.push({
      popover: {
        title: doneTitle || "Done!",
        description: doneDesc || "",
      },
    });
  }

  return steps;
}

function startTour(stepsConfig, isLoggedIn, themeSettings) {
  if (typeof window.driver === "undefined") {
    console.warn("[Onboarding Tour] Driver.js not loaded");
    return;
  }

  // Get welcome/done text based on user type
  const welcomeTitle = isLoggedIn
    ? themeSettings.welcome_title_logged_in
    : themeSettings.welcome_title_anonymous;
  const welcomeDesc = isLoggedIn
    ? themeSettings.welcome_description_logged_in
    : themeSettings.welcome_description_anonymous;
  const doneTitle = isLoggedIn
    ? themeSettings.done_title_logged_in
    : themeSettings.done_title_anonymous;
  const doneDesc = isLoggedIn
    ? themeSettings.done_description_logged_in
    : themeSettings.done_description_anonymous;

  const steps = buildTourSteps(stepsConfig, welcomeTitle, welcomeDesc, doneTitle, doneDesc);
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
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
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

  // Trust level check only applies to logged-in users
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
    welcome_title_anonymous: settings.welcome_title_anonymous || "Welcome!",
    welcome_description_anonymous: settings.welcome_description_anonymous || "Let us show you around.",
    done_title_anonymous: settings.done_title_anonymous || "You're All Set!",
    done_description_anonymous: settings.done_description_anonymous || "Create an account to join!",
    welcome_title_logged_in: settings.welcome_title_logged_in || "Welcome!",
    welcome_description_logged_in: settings.welcome_description_logged_in || "Let us show you around.",
    done_title_logged_in: settings.done_title_logged_in || "You're All Set!",
    done_description_logged_in: settings.done_description_logged_in || "Explore and enjoy!",
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

      // Parse the appropriate steps config
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
