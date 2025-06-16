export const toolsList = [
  {
    name: "navigate",
    description: "Navigate to a specific URL",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "URL to navigate to" }
      },
      required: ["url"]
    }
  },
  {
    name: "open_new_tab",
    description: "Open a new tab in the browser",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string", description: "Optional URL to navigate to in the new tab" }
      },
      required: []
    }
  },
  {
    name: "reload_page",
    description: "Reload the current webpage",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "go_back",
    description: "Navigate back in browser history until target is reached or specified number of steps",
    inputSchema: {
      type: "object",
      properties: {
        targetUrl: { type: "string", description: "Partial URL to navigate back to (optional)" },
        targetTitle: { type: "string", description: "Partial page title to navigate back to (optional)" },
        steps: { type: "number", description: "Number of steps to go back (optional, defaults to 1 if no target specified)" }
      },
      required: []
    }
  },
  {
    name: "go_forward",
    description: "Navigate forward in browser history until target is reached or specified number of steps",
    inputSchema: {
      type: "object",
      properties: {
        targetUrl: { type: "string", description: "Partial URL to navigate forward to (optional)" },
        targetTitle: { type: "string", description: "Partial page title to navigate forward to (optional)" },
        steps: { type: "number", description: "Number of steps to go forward (optional, defaults to 1 if no target specified)" }
      },
      required: []
    }
  },
  {
    name: "switch_tab",
    description: "Switch to a different tab by partial name/title match or list all tabs if no target specified",
    inputSchema: {
      type: "object",
      properties: {
        targetTabName: { type: "string", description: "Partial name/title of tab to switch to (case-insensitive, optional)" }
      },
      required: []
    }
  },
  {
    name: "search",
    description: "Find and use search functionality on the current page",
    inputSchema: {
      type: "object",
      properties: {
        searchText: { type: "string", description: "Text to search for" },
        clearExisting: { type: "boolean", description: "Clear existing text before typing", default: true },
        waitForNavigation: { type: "boolean", description: "Wait for navigation after search submission", default: true },
        timeout: { type: "number", description: "Timeout for finding search elements (ms)", default: 5000 },
        retryAttempts: { type: "number", description: "Number of retry attempts for finding search elements", default: 3 },
        typeDelay: { type: "number", description: "Delay between keystrokes when typing (ms)", default: 50 }
      },
      required: ["searchText"]
    }
  },
  {
    name: "get_page_content",
    description: "Extract structured and formatted content from the current webpage",
    inputSchema: {
      type: "object",
      properties: {
        maxParagraphLength: { type: "number", description: "Maximum length for paragraphs", default: 1000 },
        maxListItems: { type: "number", description: "Maximum number of list items to extract", default: 100 },
        maxLinks: { type: "number", description: "Maximum number of links to extract", default: 50 },
        includeMetadata: { type: "boolean", description: "Whether to include page metadata", default: true },
        filterEmptyContent: { type: "boolean", description: "Whether to filter out empty content sections", default: true },
        deduplicateContent: { type: "boolean", description: "Whether to remove duplicate content", default: true }
      },
      required: []
    }
  },
  {
    name: "get_html",
    description: "Extract the entire raw HTML from the current webpage",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "fill",
    description: "Fill out an input field using CSS selectors or Playwright text selectors",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or Playwright text selector (e.g., 'input[name=\"email\"]' or 'text=Email') for input field" },
        value: { type: "string", description: "Value to fill" }
      },
      required: ["selector", "value"]
    }
  },
  {
    name: "select",
    description: "Select an element on the page with Select tag using CSS selectors or Playwright text selectors",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or Playwright text selector (e.g., 'select[name=\"country\"]' or 'text=Country') for element to select" },
        value: { type: "string", description: "Value to select" }
      },
      required: ["selector", "value"]
    }
  },
  {
    name: "hover",
    description: "Hover an element on the page using CSS selectors or Playwright text selectors",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or Playwright text selector (e.g., '.dropdown-menu' or 'text=Menu') for element to hover" }
      },
      required: ["selector"]
    }
  },
  {
    name: "click",
    description: "Click on an element using CSS selectors or Playwright text selectors",
    inputSchema: {
      type: "object",
      properties: {
        selector: { type: "string", description: "CSS selector or Playwright text selector (e.g., 'button.submit' or 'text=뉴스홈') of the element to click" }
      },
      required: ["selector"]
    }
  }
];