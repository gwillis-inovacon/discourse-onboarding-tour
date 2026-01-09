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
  // Handle comma-separated selectors (try each one)
  const selectors = selector.split(",").map(s => s.trim());
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function buildTourSteps(stepsConfig) {
  const steps = [];

  // Welcome step (no element)
  steps.push({
    popover: {
      title: "Welcome!",
      description: "Let us show you around. This quick tour will help you get started.",
    },
  });

  // Build steps from config
  for (const step of stepsConfig) {
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

  // Done step (no element)
  steps.push({
    popover: {
      title: "You're All Set!",
      description: "That's the basics. Explore and enjoy!",
    },
  });

  return steps;
}

function startTour(stepsConfig, isLoggedIn) {
  if (typeof window.driver === "undefined") {
    console.warn("[Onboarding Tour] Driver.js not loaded");
    return;
  }

  const steps = buildTourSteps(stepsConfig);
  console.log("[Onboarding Tour] Starting tour with steps:", steps);

  if (steps.length <= 2) {
    console.log("[Onboarding Tour] No valid steps found, skipping tour");
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
          startTour(stepsConfig, isLoggedIn);
        }, themeSettings.tour_delay_ms);
      });
    });
  },
};
