import { withPluginApi } from "discourse/lib/plugin-api";

const STORAGE_KEY = "discourse_onboarding_tour_completed";

// Hardcoded strings (more reliable than I18n for theme components)
const TEXT = {
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
};

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

function findElement(selectors) {
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
      title: TEXT.welcome_title,
      description: TEXT.welcome_description,
    },
  });

  // Navigation menu
  const navElement = findElement([
    ".hamburger-dropdown",
    "#toggle-hamburger-menu",
    ".d-header .hamburger-panel",
    ".header-sidebar-toggle",
    ".sidebar-toggle",
  ]);
  if (navElement) {
    steps.push({
      element: navElement,
      popover: {
        title: TEXT.navigation_title,
        description: TEXT.navigation_description,
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
  ]);
  if (searchElement) {
    steps.push({
      element: searchElement,
      popover: {
        title: TEXT.search_title,
        description: TEXT.search_description,
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
  ]);
  if (userElement) {
    steps.push({
      element: userElement,
      popover: {
        title: TEXT.user_menu_title,
        description: TEXT.user_menu_description,
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
  ]);
  if (topicListElement) {
    steps.push({
      element: topicListElement,
      popover: {
        title: TEXT.topic_list_title,
        description: TEXT.topic_list_description,
        side: "top",
        align: "center",
      },
    });
  }

  // New topic button
  const newTopicElement = findElement([
    "#create-topic",
    "button.new-topic",
  ]);
  if (newTopicElement) {
    steps.push({
      element: newTopicElement,
      popover: {
        title: TEXT.new_topic_title,
        description: TEXT.new_topic_description,
        side: "top",
        align: "center",
      },
    });
  }

  // Done step (no element)
  steps.push({
    popover: {
      title: TEXT.done_title,
      description: TEXT.done_description,
    },
  });

  return steps;
}

function startTour(themeSettings) {
  if (typeof window.driver === "undefined") {
    console.warn("[Onboarding Tour] Driver.js not loaded");
    return;
  }

  const steps = buildTourSteps();
  console.log("[Onboarding Tour] Built steps:", steps);

  const driverObj = window.driver.js.driver({
    showProgress: true,
    animate: false,
    allowClose: true,
    overlayClickBehavior: "close",
    stagePadding: 0,
    stageRadius: 0,
    popoverOffset: 16,
    overlayColor: themeSettings.overlay_color,
    overlayOpacity: themeSettings.overlay_opacity,
    nextBtnText: TEXT.next_button,
    prevBtnText: TEXT.prev_button,
    doneBtnText: TEXT.done_button,
    onDestroyStarted: () => {
      markTourCompleted();
      driverObj.destroy();
    },
    steps: steps,
  });

  driverObj.drive();
}

function shouldShowTour(api, themeSettings) {
  if (!themeSettings.tour_enabled) {
    console.log("[Onboarding Tour] Tour is disabled in settings");
    return false;
  }

  if (hasCompletedTour()) {
    console.log("[Onboarding Tour] Tour already completed (localStorage)");
    return false;
  }

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
    target_trust_level: settings.target_trust_level ?? 0,
    overlay_color: settings.overlay_color || "#000000",
    overlay_opacity: parseFloat(settings.overlay_opacity) || 0.75,
  };
}

export default {
  name: "onboarding-tour",

  initialize() {
    withPluginApi("1.0", (api) => {
      let tourTriggered = false;
      const themeSettings = getThemeSettings();

      console.log("[Onboarding Tour] Initializing with settings:", themeSettings);

      api.onPageChange((url) => {
        console.log("[Onboarding Tour] Page change detected:", url);

        if (tourTriggered) {
          console.log("[Onboarding Tour] Already triggered this session");
          return;
        }

        if (!isHomePage(url)) {
          console.log("[Onboarding Tour] Not on homepage");
          return;
        }

        if (!shouldShowTour(api, themeSettings)) {
          console.log("[Onboarding Tour] Conditions not met");
          return;
        }

        tourTriggered = true;
        console.log("[Onboarding Tour] Starting tour in", themeSettings.tour_delay_ms, "ms");

        setTimeout(() => {
          startTour(themeSettings);
        }, themeSettings.tour_delay_ms);
      });
    });
  },
};
