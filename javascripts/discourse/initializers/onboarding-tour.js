import { withPluginApi } from "discourse/lib/plugin-api";
import { settings } from "discourse/lib/theme-settings-store";

const STORAGE_KEY = "discourse_onboarding_tour_completed";
const THEME_ID = parseInt(document.currentScript?.dataset?.themeId || "0", 10);

function getI18n(key) {
  if (typeof I18n !== "undefined" && I18n.t) {
    return I18n.t(`js.onboarding_tour.${key}`);
  }
  // Fallback text
  const fallbacks = {
    welcome_title: "Welcome to Our Community!",
    welcome_description: "Let us show you around. This quick tour will help you get started.",
    navigation_title: "Navigation Menu",
    navigation_description: "Click here to browse categories, tags, and find your way around the forum.",
    search_title: "Search",
    search_description: "Looking for something? Use search to find topics, posts, and users.",
    user_menu_title: "Your Profile",
    user_menu_description: "Access your notifications, messages, bookmarks, and profile settings here.",
    topic_list_title: "Topic List",
    topic_list_description: "Browse discussions here. Click any topic title to read and join the conversation.",
    new_topic_title: "Start a Discussion",
    new_topic_description: "Ready to share? Click here to create a new topic and start a conversation.",
    done_title: "You're All Set!",
    done_description: "That's the basics! Explore and don't hesitate to ask if you need help.",
    next_button: "Next",
    prev_button: "Back",
    done_button: "Done",
    replay_button: "Tour",
  };
  return fallbacks[key] || key;
}

function hasCompletedTour() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch (e) {
    return false;
  }
}

function markTourCompleted() {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch (e) {
    // localStorage not available
  }
}

function clearTourCompleted() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    // localStorage not available
  }
}

function findElement(selectors) {
  // Try multiple selectors, return first match
  for (const selector of selectors) {
    const el = document.querySelector(selector);
    if (el) return el;
  }
  return null;
}

function buildTourSteps() {
  const steps = [];

  // Welcome step (no element)
  steps.push({
    popover: {
      title: getI18n("welcome_title"),
      description: getI18n("welcome_description"),
    },
  });

  // Navigation menu
  const navElement = findElement([
    ".hamburger-dropdown",
    "#toggle-hamburger-menu",
    ".d-header .hamburger-panel",
    "[data-toggle='hamburger-menu']",
    ".header-sidebar-toggle",
  ]);
  if (navElement) {
    steps.push({
      element: navElement,
      popover: {
        title: getI18n("navigation_title"),
        description: getI18n("navigation_description"),
        side: "bottom",
        align: "start",
      },
    });
  }

  // Search
  const searchElement = findElement([
    "#search-button",
    ".d-header .search-dropdown",
    ".search-icon",
    "[data-toggle='search-menu']",
  ]);
  if (searchElement) {
    steps.push({
      element: searchElement,
      popover: {
        title: getI18n("search_title"),
        description: getI18n("search_description"),
        side: "bottom",
        align: "center",
      },
    });
  }

  // User menu
  const userElement = findElement([
    ".header-dropdown-toggle.current-user",
    ".d-header .current-user",
    "#current-user",
    ".user-menu-dropdown",
  ]);
  if (userElement) {
    steps.push({
      element: userElement,
      popover: {
        title: getI18n("user_menu_title"),
        description: getI18n("user_menu_description"),
        side: "bottom",
        align: "end",
      },
    });
  }

  // Topic list
  const topicListElement = findElement([
    ".topic-list",
    ".latest-topic-list",
    "#list-area",
    ".topic-list-body",
  ]);
  if (topicListElement) {
    steps.push({
      element: topicListElement,
      popover: {
        title: getI18n("topic_list_title"),
        description: getI18n("topic_list_description"),
        side: "top",
        align: "center",
      },
    });
  }

  // New topic button
  const newTopicElement = findElement([
    "#create-topic",
    "button.new-topic",
    "[data-action='createTopic']",
  ]);
  if (newTopicElement) {
    steps.push({
      element: newTopicElement,
      popover: {
        title: getI18n("new_topic_title"),
        description: getI18n("new_topic_description"),
        side: "top",
        align: "center",
      },
    });
  }

  // Done step (no element)
  steps.push({
    popover: {
      title: getI18n("done_title"),
      description: getI18n("done_description"),
    },
  });

  return steps;
}

function startTour() {
  if (typeof window.driver === "undefined") {
    console.warn("Driver.js not loaded");
    return;
  }

  const driverObj = window.driver.js.driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    overlayClickBehavior: "close",
    stagePadding: 8,
    stageRadius: 8,
    popoverOffset: 12,
    nextBtnText: getI18n("next_button"),
    prevBtnText: getI18n("prev_button"),
    doneBtnText: getI18n("done_button"),
    onDestroyStarted: () => {
      markTourCompleted();
      driverObj.destroy();
    },
    steps: buildTourSteps(),
  });

  driverObj.drive();
}

function shouldShowTour(api, themeSettings) {
  // Check if tour is enabled
  if (!themeSettings.tour_enabled) {
    console.log("[Onboarding Tour] Tour is disabled in settings");
    return false;
  }

  // Check if already completed
  if (hasCompletedTour()) {
    console.log("[Onboarding Tour] Tour already completed (localStorage)");
    return false;
  }

  // Check trust level
  const currentUser = api.getCurrentUser();
  if (currentUser) {
    const trustLevel = currentUser.trust_level || 0;
    console.log("[Onboarding Tour] User trust level:", trustLevel, "Max allowed:", themeSettings.target_trust_level);
    if (trustLevel > themeSettings.target_trust_level) {
      console.log("[Onboarding Tour] Trust level too high, skipping");
      return false;
    }
  }

  return true;
}

function isHomePage(url) {
  // Check if we're on the homepage or similar landing pages
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

function addReplayButton(api) {
  api.decorateWidget("header-icons:before", (helper) => {
    return helper.h(
      "button.tour-replay-button.btn.btn-icon.no-text",
      {
        onclick: () => {
          clearTourCompleted();
          setTimeout(startTour, 100);
        },
        title: getI18n("replay_button"),
      },
      getI18n("replay_button")
    );
  });
}

function getThemeSettings() {
  // Access theme component settings
  const themeSettings = settings.get(THEME_ID) || {};
  return {
    tour_enabled: themeSettings.tour_enabled !== false,
    tour_delay_ms: themeSettings.tour_delay_ms || 1500,
    target_trust_level: themeSettings.target_trust_level ?? 0,
    show_replay_button: themeSettings.show_replay_button || false,
  };
}

export default {
  name: "onboarding-tour",

  initialize() {
    withPluginApi("1.0", (api) => {
      let tourTriggered = false;
      const themeSettings = getThemeSettings();

      console.log("[Onboarding Tour] Initializing with settings:", themeSettings);

      // Add replay button if enabled
      if (themeSettings.show_replay_button) {
        addReplayButton(api);
      }

      api.onPageChange((url) => {
        console.log("[Onboarding Tour] Page change detected:", url);

        // Only trigger once per session
        if (tourTriggered) {
          console.log("[Onboarding Tour] Already triggered this session");
          return;
        }

        // Only on homepage
        if (!isHomePage(url)) {
          console.log("[Onboarding Tour] Not on homepage");
          return;
        }

        // Check all conditions
        if (!shouldShowTour(api, themeSettings)) {
          console.log("[Onboarding Tour] Conditions not met");
          return;
        }

        tourTriggered = true;
        console.log("[Onboarding Tour] Starting tour in", themeSettings.tour_delay_ms, "ms");

        // Delay to ensure DOM is ready
        setTimeout(() => {
          startTour();
        }, themeSettings.tour_delay_ms);
      });
    });
  },
};
