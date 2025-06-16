import { Browser, Page, BrowserContext } from 'playwright';

// Global variable to track recent tab order across helper functions
let recentTabOrder: Page[] = [];

// Helper function to update recent tab order
function updateRecentTabOrder(page: Page) {
  try {
    // Remove the page if it already exists in the order
    recentTabOrder = recentTabOrder.filter(p => p !== page);

    // Add the page to the front of the order
    recentTabOrder.unshift(page);

    // Keep only the last 10 tabs to prevent memory issues
    recentTabOrder = recentTabOrder.slice(0, 10);

    console.log(`Updated recent tab order. Current active: ${page.url()}`);
  } catch (error) {
    console.error("Error updating recent tab order:", error);
  }
}

// Helper function to get active page from browser with recent-order priority
async function getActivePage(browser: Browser): Promise<Page | null> {
  // First check if we have any recently accessed tabs
  for (const recentPage of recentTabOrder) {
    try {
      // Verify the page is still valid and accessible
      if (!recentPage.isClosed() && recentPage.url() !== 'about:blank') {
        return recentPage;
      }
    } catch (error) {
      // Page might be closed, continue to next
      continue;
    }
  }

  // Fallback to original logic if no recent tabs or they're invalid
  const contexts = browser.contexts();
  for (const context of contexts) {
    const pages = context.pages();
    for (const page of pages) {
      try {
        if (!page.isClosed() && page.url() !== 'about:blank') {
          updateRecentTabOrder(page);
          return page;
        }
      } catch (error) {
        continue;
      }
    }
  }

  // Return first available page if no non-blank page found
  if (contexts.length > 0 && contexts[0].pages().length > 0) {
    const firstPage = contexts[0].pages()[0];
    if (!firstPage.isClosed()) {
      updateRecentTabOrder(firstPage);
      return firstPage;
    }
  }
  return null;
}

// Helper function to safely get all tabs with error handling
async function getAllTabs(browser: Browser): Promise<Array<{ index: number, url: string, title: string, page: Page }>> {
  try {
    const contexts = browser.contexts();
    const tabInfo = [];
    let index = 0;
    
    if (!contexts || contexts.length === 0) {
      console.log("No browser contexts found");
      return [];
    }
    
    for (const context of contexts) {
      try {
        const pages = context.pages();
        if (!pages || pages.length === 0) {
          console.log("No pages found in context");
          continue;
        }
        
        for (const page of pages) {
          try {
            const url = page.url();
            const title = await page.title();
            tabInfo.push({ index, url, title, page });
            index++;
          } catch (pageError) {
            console.error(`Error getting page info for page ${index}:`, pageError);
            // Still increment index to maintain consistent numbering
            index++;
          }
        }
      } catch (contextError) {
        console.error("Error processing context:", contextError);
      }
    }
    
    return tabInfo;
  } catch (error) {
    console.error("Error getting all tabs:", error);
    return [];
  }
}

async function TakeScreenshot(browser: Browser) {
  const page = await getActivePage(browser);

  if (!page) {
    return {
      content: [{ type: "text", text: "No active page to screenshot" }],
      isError: true
    };
  }

  try {
    // Store original viewport size
    const originalViewport = page.viewportSize();

    // Set explicit viewport size before screenshot to maintain consistency
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Wait for page to be fully loaded and stable
    await page.waitForLoadState('networkidle');

    // Additional wait to ensure all dynamic content is rendered
    await new Promise(resolve => setTimeout(resolve, 1000));

    const screenshotOptions = {
      fullPage: true,
      type: 'png' as const,
      timeout: 10000 // 10 second timeout - sufficient for most pages
    };

    // Take full-page screenshot in headful mode and return PNG buffer
    const buffer = await page.screenshot(screenshotOptions);

    // Restore original viewport size
    if (originalViewport) {
      await page.setViewportSize(originalViewport);
    }

    return {
      content: [{ type: "image", data: Buffer.from(buffer).toString('base64'), mimeType: "image/png" }],
      isError: false
    };
  } catch (error) {
    // Attempt to restore viewport even if screenshot fails
    try {
      const originalViewport = page.viewportSize();
      if (originalViewport) {
        await page.setViewportSize(originalViewport);
      }
    } catch (restoreError) {
      // Ignore restore errors to avoid masking the original error
    }

    return {
      content: [{ type: "text", text: `Failed to take screenshot: ${(error as Error).message}` }],
      isError: true
    };
  }
}

export async function callNavigate(browser: Browser, url: string) {
  let page = await getActivePage(browser);

  if (!page) {
    const context = await browser.newContext();
    page = await context.newPage();
  }

  await page.goto(url);
  updateRecentTabOrder(page); // Update recent order after navigation

  return {
    content: [{ type: "text", text: `Navigated to ${url}` }],
    isError: false
  };
}

async function extractStructuredContent(page: Page, options = {}) {
  const defaultOptions = {
    maxParagraphLength: 1000,
    maxListItems: 100,
    maxLinks: 50,
    includeMetadata: true,
    filterEmptyContent: true,
    deduplicateContent: true
  };

  const config = { ...defaultOptions, ...options };

  return await page.evaluate((config) => {
    const content = {
      title: document.title || '',
      url: window.location.href,
      headings: [],
      paragraphs: [],
      lists: [],
      links: [],
      metadata: {}
    };

    // Add metadata if requested
    if (config.includeMetadata) {
      const metaTags = document.querySelectorAll('meta');
      metaTags.forEach(meta => {
        const name = meta.getAttribute('name') || meta.getAttribute('property');
        const content_val = meta.getAttribute('content');
        if (name && content_val) {
          content.metadata[name] = content_val;
        }
      });
    }

    // Extract headings with hierarchy and IDs
    const headings = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
    headings.forEach(heading => {
      const text = heading.innerText.trim();
      if (text.length > 0) {
        content.headings.push({
          level: parseInt(heading.tagName.charAt(1)),
          tag: heading.tagName.toLowerCase(),
          text: text,
          id: heading.id || null
        });
      }
    });

    // Extract paragraphs with length filtering
    const paragraphs = document.querySelectorAll('p');
    const seenParagraphs = new Set();

    paragraphs.forEach(p => {
      const text = p.innerText.trim();
      if (text.length > 0 && text.length <= config.maxParagraphLength) {
        if (!config.deduplicateContent || !seenParagraphs.has(text)) {
          content.paragraphs.push(text);
          if (config.deduplicateContent) {
            seenParagraphs.add(text);
          }
        }
      }
    });

    // Extract list items with better structure
    const lists = document.querySelectorAll('ul, ol');
    lists.forEach(list => {
      const listItems = list.querySelectorAll('li');
      const items = [];

      listItems.forEach(li => {
        const text = li.innerText.trim();
        if (text.length > 0) {
          items.push(text);
        }
      });

      if (items.length > 0 && content.lists.length < config.maxListItems) {
        content.lists.push({
          type: list.tagName.toLowerCase(),
          items: items.slice(0, 20) // Limit items per list
        });
      }
    });

    // Extract links with better filtering
    const links = document.querySelectorAll('a[href]');
    const seenUrls = new Set();
    let linkCount = 0;

    links.forEach(link => {
      if (linkCount >= config.maxLinks) return;

      const text = link.innerText.trim();
      const href = link.href;

      // Filter out navigation, footer, and duplicate links
      const isNavigation = link.closest('nav, header, footer') !== null;
      const isValidLink = href && (href.startsWith('http') || href.startsWith('/'));
      const hasText = text.length > 0 && text.length < 200;

      if (isValidLink && hasText && !isNavigation) {
        if (!config.deduplicateContent || !seenUrls.has(href)) {
          content.links.push({
            text: text,
            url: href,
            isExternal: !href.startsWith(window.location.origin)
          });
          if (config.deduplicateContent) {
            seenUrls.add(href);
          }
          linkCount++;
        }
      }
    });

    // Extract main content if available
    const mainContent = document.querySelector('main, article, [role="main"]');
    if (mainContent) {
      content.mainContentText = mainContent.innerText.trim().substring(0, 2000);
    }

    // Clean up empty arrays if requested
    if (config.filterEmptyContent) {
      Object.keys(content).forEach(key => {
        if (Array.isArray(content[key]) && content[key].length === 0) {
          delete content[key];
        }
      });
    }

    return content;
  }, config);
}

// Helper function for MCP usage
async function extractAndFormatContent(page: Page, options = {}) {
  try {
    const content = await extractStructuredContent(page, options);

    // Format for better readability
    let formatted = `# ${content.title}\n\n`;

    if (content.url) {
      formatted += `**URL:** ${content.url}\n\n`;
    }

    if (content.headings && content.headings.length > 0) {
      formatted += `## Headings\n`;
      content.headings.forEach(h => {
        formatted += `${'  '.repeat(h.level - 1)}- ${h.text}\n`;
      });
      formatted += '\n';
    }

    if (content.mainContentText) {
      formatted += `## Main Content\n${content.mainContentText}\n\n`;
    }

    if (content.paragraphs && content.paragraphs.length > 0) {
      formatted += `## Key Paragraphs\n`;
      content.paragraphs.slice(0, 5).forEach(p => {
        formatted += `- ${p}\n`;
      });
      formatted += '\n';
    }

    if (content.lists && content.lists.length > 0) {
      formatted += `## Lists\n`;
      content.lists.forEach((list, index) => {
        formatted += `### List ${index + 1} (${list.type})\n`;
        list.items.slice(0, 10).forEach(item => {
          formatted += `- ${item}\n`;
        });
        formatted += '\n';
      });
    }

    if (content.links && content.links.length > 0) {
      formatted += `## Important Links\n`;
      content.links.slice(0, 10).forEach(link => {
        formatted += `- [${link.text}](${link.url})${link.isExternal ? ' (external)' : ''}\n`;
      });
    }

    return {
      raw: content,
      formatted: formatted
    };
  } catch (error) {
    throw new Error(`Failed to extract content: ${error.message}`);
  }
}

export async function callOpenNewTab(browser: Browser, url?: string) {
  try {
    // First try to get the active page to use keyboard shortcut
    const activePage = await getActivePage(browser);

    if (activePage) {
      try {
        // Use keyboard shortcut to open new tab (Ctrl+T or Cmd+T)
        const isMac = process.platform === 'darwin';
        const modifier = isMac ? 'Meta' : 'Control';

        await activePage.keyboard.press(`${modifier}+t`);
        await activePage.waitForTimeout(1000); // Wait for new tab to open

        // Get the newly opened tab
        const contexts = browser.contexts();
        let newPage = null;

        for (const context of contexts) {
          const pages = context.pages();
          // Find the most recently created page
          newPage = pages[pages.length - 1];
          if (newPage && newPage !== activePage) {
            break;
          }
        }

        if (newPage && url) {
          await newPage.goto(url);
          updateRecentTabOrder(newPage);
          return {
            content: [{ type: "text", text: `Opened new tab with keyboard shortcut and navigated to ${url}` }],
            isError: false
          };
        } else if (newPage) {
          updateRecentTabOrder(newPage);
          return {
            content: [{ type: "text", text: `Opened new tab with keyboard shortcut (about:blank)` }],
            isError: false
          };
        }
      } catch (keyboardError) {
        console.log(`Keyboard shortcut failed: ${keyboardError.message}, falling back to programmatic creation`);
      }
    }

    // Fallback to programmatic tab creation
    const context = await browser.newContext();
    const page = await context.newPage();

    if (url) {
      await page.goto(url);
      updateRecentTabOrder(page);
      return {
        content: [{ type: "text", text: `Opened new tab and navigated to ${url}` }],
        isError: false
      };
    } else {
      updateRecentTabOrder(page);
      return {
        content: [{ type: "text", text: `Opened new tab (about:blank)` }],
        isError: false
      };
    }
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to open new tab: ${(error as Error).message}` }],
      isError: true
    };
  }
}

export async function callReloadPage(browser: Browser) {
  const page = await getActivePage(browser);

  if (!page) {
    return {
      content: [{ type: "text", text: "No active page to reload" }],
      isError: true
    };
  }

  try {
    await page.reload({ waitUntil: "networkidle" });
    return {
      content: [{ type: "text", text: `Page reloaded successfully` }],
      isError: false
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to reload page: ${(error as Error).message}` }],
      isError: true
    };
  }
}

export async function callGoBack(browser: Browser, options: any = {}) {
  const page = await getActivePage(browser);

  if (!page) {
    return {
      content: [{ type: "text", text: "No active page to navigate back from" }],
      isError: true
    };
  }

  try {
    const { targetUrl, targetTitle, steps } = options;
    const maxSteps = steps || (targetUrl || targetTitle ? 10 : 1); // Default to 1 step if no target specified
    let stepsTaken = 0;
    const initialUrl = page.url();

    console.log(`Starting back navigation. Target URL: ${targetUrl || 'none'}, Target Title: ${targetTitle || 'none'}, Max steps: ${maxSteps}`);

    for (let i = 0; i < maxSteps; i++) {
      try {
        // Check current state before going back
        const currentUrl = page.url();
        const currentTitle = await page.title();

        console.log(`Step ${i + 1}: Current URL: ${currentUrl}, Title: "${currentTitle}"`);

        // If we have a target URL or title, check if we've reached it
        if (targetUrl && currentUrl.toLowerCase().includes(targetUrl.toLowerCase())) {
          console.log(`Target URL "${targetUrl}" found in current URL: ${currentUrl}`);
          break;
        }

        if (targetTitle && currentTitle.toLowerCase().includes(targetTitle.toLowerCase())) {
          console.log(`Target title "${targetTitle}" found in current title: ${currentTitle}`);
          break;
        }

        // Try to go back
        await page.goBack({ waitUntil: 'networkidle', timeout: 10000 });
        stepsTaken++;

        // Wait a bit for the page to load
        await page.waitForTimeout(1000);

        const newUrl = page.url();
        const newTitle = await page.title();

        console.log(`After step ${stepsTaken}: New URL: ${newUrl}, Title: "${newTitle}"`);

        // Check if we've reached our target after going back
        if (targetUrl && newUrl.toLowerCase().includes(targetUrl.toLowerCase())) {
          console.log(`Reached target URL "${targetUrl}" at: ${newUrl}`);
          break;
        }

        if (targetTitle && newTitle.toLowerCase().includes(targetTitle.toLowerCase())) {
          console.log(`Reached target title "${targetTitle}": ${newTitle}`);
          break;
        }

        // If URL didn't change, we might be at the beginning of history
        if (newUrl === currentUrl) {
          console.log(`URL didn't change, likely at beginning of browser history`);
          break;
        }

      } catch (navigationError) {
        console.log(`Navigation step ${i + 1} failed: ${navigationError.message}`);
        break;
      }
    }

    const finalUrl = page.url();
    const finalTitle = await page.title();

    if (stepsTaken === 0) {
      return {
        content: [{
          type: "text",
          text: `Unable to navigate back. Already at target or beginning of history.\nCurrent URL: ${finalUrl}\nCurrent Title: "${finalTitle}"`
        }],
        isError: false
      };
    }

    let resultMessage = `Navigated back ${stepsTaken} step${stepsTaken === 1 ? '' : 's'}`;

    if (targetUrl && finalUrl.toLowerCase().includes(targetUrl.toLowerCase())) {
      resultMessage += `\nReached target URL: ${targetUrl}`;
    } else if (targetTitle && finalTitle.toLowerCase().includes(targetTitle.toLowerCase())) {
      resultMessage += `\nReached target title: ${targetTitle}`;
    } else if (targetUrl || targetTitle) {
      resultMessage += `\nTarget not found, stopped after ${stepsTaken} steps`;
    }

    resultMessage += `\nFinal URL: ${finalUrl}\nFinal Title: "${finalTitle}"`;

    return {
      content: [{ type: "text", text: resultMessage }],
      isError: false
    };

  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to navigate back: ${(error as Error).message}` }],
      isError: true
    };
  }
}

export async function callGoForward(browser: Browser, options: any = {}) {
  const page = await getActivePage(browser);

  if (!page) {
    return {
      content: [{ type: "text", text: "No active page to navigate forward from" }],
      isError: true
    };
  }

  try {
    const { targetUrl, targetTitle, steps } = options;
    const maxSteps = steps || (targetUrl || targetTitle ? 10 : 1); // Default to 1 step if no target specified
    let stepsTaken = 0;
    const initialUrl = page.url();

    console.log(`Starting forward navigation. Target URL: ${targetUrl || 'none'}, Target Title: ${targetTitle || 'none'}, Max steps: ${maxSteps}`);

    for (let i = 0; i < maxSteps; i++) {
      try {
        // Check current state before going forward
        const currentUrl = page.url();
        const currentTitle = await page.title();

        console.log(`Step ${i + 1}: Current URL: ${currentUrl}, Title: "${currentTitle}"`);

        // If we have a target URL or title, check if we've reached it
        if (targetUrl && currentUrl.toLowerCase().includes(targetUrl.toLowerCase())) {
          console.log(`Target URL "${targetUrl}" found in current URL: ${currentUrl}`);
          break;
        }

        if (targetTitle && currentTitle.toLowerCase().includes(targetTitle.toLowerCase())) {
          console.log(`Target title "${targetTitle}" found in current title: ${currentTitle}`);
          break;
        }

        // Try to go forward
        await page.goForward({ waitUntil: 'networkidle', timeout: 10000 });
        stepsTaken++;

        // Wait a bit for the page to load
        await page.waitForTimeout(1000);

        const newUrl = page.url();
        const newTitle = await page.title();

        console.log(`After step ${stepsTaken}: New URL: ${newUrl}, Title: "${newTitle}"`);

        // Check if we've reached our target after going forward
        if (targetUrl && newUrl.toLowerCase().includes(targetUrl.toLowerCase())) {
          console.log(`Reached target URL "${targetUrl}" at: ${newUrl}`);
          break;
        }

        if (targetTitle && newTitle.toLowerCase().includes(targetTitle.toLowerCase())) {
          console.log(`Reached target title "${targetTitle}": ${newTitle}`);
          break;
        }

        // If URL didn't change, we might be at the end of history
        if (newUrl === currentUrl) {
          console.log(`URL didn't change, likely at end of browser history`);
          break;
        }

      } catch (navigationError) {
        console.log(`Navigation step ${i + 1} failed: ${navigationError.message}`);
        break;
      }
    }

    const finalUrl = page.url();
    const finalTitle = await page.title();

    if (stepsTaken === 0) {
      return {
        content: [{
          type: "text",
          text: `Unable to navigate forward. Already at target or end of history.\nCurrent URL: ${finalUrl}\nCurrent Title: "${finalTitle}"`
        }],
        isError: false
      };
    }

    let resultMessage = `Navigated forward ${stepsTaken} step${stepsTaken === 1 ? '' : 's'}`;

    if (targetUrl && finalUrl.toLowerCase().includes(targetUrl.toLowerCase())) {
      resultMessage += `\nReached target URL: ${targetUrl}`;
    } else if (targetTitle && finalTitle.toLowerCase().includes(targetTitle.toLowerCase())) {
      resultMessage += `\nReached target title: ${targetTitle}`;
    } else if (targetUrl || targetTitle) {
      resultMessage += `\nTarget not found, stopped after ${stepsTaken} steps`;
    }

    resultMessage += `\nFinal URL: ${finalUrl}\nFinal Title: "${finalTitle}"`;

    return {
      content: [{ type: "text", text: resultMessage }],
      isError: false
    };

  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to navigate forward: ${(error as Error).message}` }],
      isError: true
    };
  }
}

export async function callSwitchTab(browser: Browser, targetTabName: string | null = null) {
  try {
    console.log(`callSwitchTab called with targetTabName: ${targetTabName}`);

    // Get all tabs with error handling
    const tabInfo = await getAllTabs(browser);
    console.log(`Found ${tabInfo.length} tabs`);

    if (tabInfo.length === 0) {
      return {
        content: [{
          type: "text",
          text: `No tabs found. Browser may not be properly initialized.`
        }],
        isError: true,
        tabs: []
      };
    }

    // List all tabs
    const tabList = tabInfo.map(tab =>
      `${tab.index}: "${tab.title}" - ${tab.url}`
    ).join('\n');

    // If no target tab specified, just return the list
    if (!targetTabName) {
      return {
        content: [{ type: "text", text: `Current tabs:\n${tabList}` }],
        isError: false,
        tabs: tabInfo
      };
    }

    // Find the target tab with safe filtering (check both title and URL)
    console.log(`Searching for tab containing: "${targetTabName}"`);
    const targetTab = tabInfo.find(tab => {
      const titleMatch = tab.title && tab.title.toLowerCase().includes(targetTabName.toLowerCase());
      const urlMatch = tab.url && tab.url.toLowerCase().includes(targetTabName.toLowerCase());
      console.log(`Checking tab "${tab.title}" (${tab.url}) - title matches: ${titleMatch}, url matches: ${urlMatch}`);
      return titleMatch || urlMatch;
    });

    if (!targetTab) {
      return {
        content: [{
          type: "text",
          text: `Tab "${targetTabName}" not found.\nCurrent tabs:\n${tabList}`
        }],
        isError: true
      };
    }

    // Switch to the target tab and update recent order
    console.log(`Switching to tab: "${targetTab.title}" - ${targetTab.url}`);
    await targetTab.page.bringToFront();
    updateRecentTabOrder(targetTab.page);

    return {
      content: [{
        type: "text",
        text: `Switched to tab: "${targetTab.title}" - ${targetTab.url}`
      }],
      isError: false,
      activeTab: targetTab
    };
  } catch (error) {
    console.error("Error in callSwitchTab:", error);
    return {
      content: [{
        type: "text",
        text: `Error managing tabs: ${(error as Error).message}`
      }],
      isError: true
    };
  }
}

export async function callGetPageContent(browser: Browser, options: any = {}) {
  const page = await getActivePage(browser);

  if (!page) {
    return {
      content: [{ type: "text", text: "No active page to extract content from" }],
      isError: true
    };
  }

  try {
    const result = await extractAndFormatContent(page, options);
    return {
      content: [{ type: "text", text: result.formatted }],
      isError: false
    };
  } catch (error) {
    return {
      content: [{ type: "text", text: `Failed to extract page content: ${(error as Error).message}` }],
      isError: true
    };
  }
}

export async function callGetHtml(browser: Browser) {
  const page = await getActivePage(browser);

  if (!page) {
    return {
      content: [{ type: "text", text: "No active page to get HTML from" }],
      isError: true
    };
  }

  const html = await page.content();
  return {
    content: [{ type: "text", text: html }],
    isError: false
  };
}

export async function callSearch(browser: Browser, searchText: string, options: any = {}) {
  const page = await getActivePage(browser);

  if (!page) {
    return {
      content: [{ type: "text", text: "No active page to perform search on" }],
      isError: true
    };
  }

  const defaultOptions = {
    clearExisting: true,
    typeDelay: 50,
    timeout: 5000,
    retryAttempts: 3,
    waitForNavigation: true,
    navigationTimeout: 10000
  };

  const config = { ...defaultOptions, ...options };

  try {
    console.log(`Starting search for: "${searchText}"`);

    // Enhanced search bar selectors with better prioritization
    const searchSelectors = [
      // High priority - semantic and standard selectors
      'input[type="search"]',
      'input[name="q"]',
      'input[name="query"]',
      'input[name="search"]',
      'input[role="searchbox"]',
      '[role="searchbox"]',

      // Medium priority - aria labels and placeholders
      'input[aria-label*="search" i]',
      'input[aria-label*="Search" i]',
      'input[placeholder*="search" i]',
      'input[placeholder*="Search" i]',
      'input[placeholder*="find" i]',

      // Lower priority - ID and class based
      '#search',
      '#searchbox',
      '#search-input',
      '#q',
      '.search-input',
      '.searchbox',
      '.search-field',
      'input[class*="search"]',
      'input[id*="search"]',

      // Fallback - broader selectors
      'form input[type="text"]',
      'header input[type="text"]',
      'nav input[type="text"]'
    ];

    const submitSelectors = [
      // High priority - semantic submit buttons
      'button[type="submit"]',
      'input[type="submit"]',

      // Medium priority - search-specific buttons
      'button[aria-label*="search" i]',
      'button[aria-label*="Search" i]',
      'button[title*="search" i]',
      'button[title*="Search" i]',

      // Lower priority - class and ID based
      '.search-button',
      '.search-btn',
      '#search-button',
      '#search-btn',
      'button[class*="search"]',
      'button[id*="search"]',

      // Fallback - form-based
      'form button:not([type="button"]):not([type="reset"])',
      'form input[type="image"]'
    ];

    const errors = [];
    let typeSuccess = false;
    let usedSelector = null;

    // Step 1: Find and type in search bar
    for (let attempt = 0; attempt < config.retryAttempts && !typeSuccess; attempt++) {
      for (const selector of searchSelectors) {
        try {
          const element = page.locator(selector).first();
          await element.waitFor({ timeout: config.timeout / searchSelectors.length });

          const isVisible = await element.isVisible();
          const isEnabled = await element.isEnabled();

          if (isVisible && isEnabled) {
            await element.scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);
            await element.focus();

            if (config.clearExisting) {
              await element.selectText();
              await page.keyboard.press('Backspace');
            }

            await element.type(searchText, { delay: config.typeDelay });

            const enteredText = await element.inputValue();

            if (enteredText === searchText) {
              console.log(`Successfully typed "${searchText}" in search bar using selector: ${selector}`);
              typeSuccess = true;
              usedSelector = selector;
              break;
            } else {
              errors.push(`Text verification failed for ${selector}. Expected: "${searchText}", Got: "${enteredText}"`);
            }
          } else {
            errors.push(`Element not interactable: ${selector} - visible: ${isVisible}, enabled: ${isEnabled}`);
          }
        } catch (error) {
          errors.push(`Selector ${selector} failed: ${error.message}`);
          continue;
        }
      }

      // Wait before retry
      if (attempt < config.retryAttempts - 1 && !typeSuccess) {
        await page.waitForTimeout(1000);
      }
    }

    if (!typeSuccess) {
      return {
        content: [{
          type: "text",
          text: `Failed to find accessible search bar. Errors: ${errors.slice(-5).join('; ')}`
        }],
        isError: true
      };
    }

    // Step 2: Try Enter key first (primary method)
    const initialUrl = page.url();
    console.log(`Initial URL: ${initialUrl}`);

    let submitted = false;
    let submitMethod = null;

    try {
      console.log('Trying Enter key first...');
      await page.keyboard.press('Enter');
      submitted = true;
      submitMethod = 'Enter key';
      console.log('Enter key pressed');

      // Wait for potential navigation/content update
      if (config.waitForNavigation) {
        try {
          // First try to wait for navigation
          await page.waitForLoadState('networkidle', { timeout: config.navigationTimeout });
          console.log('Navigation completed after Enter key');
        } catch (navError) {
          // If no navigation, wait for content update
          console.log('No navigation detected, waiting for content update...');
          await page.waitForTimeout(2000);
        }
      } else {
        await page.waitForTimeout(2000);
      }

      // Check if URL changed or search results appeared
      const finalUrl = page.url();
      const urlChanged = finalUrl !== initialUrl;
      const hasSearchResults = await page.locator('[class*="result"], [class*="search-result"], [id*="result"], .results, #results, [data-testid*="result"]').count() > 0;

      console.log(`URL changed: ${urlChanged}, Has search results: ${hasSearchResults}`);
      console.log(`Initial URL: ${initialUrl}`);
      console.log(`Final URL: ${finalUrl}`);

      // If Enter key worked (URL changed or results appeared), return success
      if (urlChanged || hasSearchResults) {
        return {
          content: [{
            type: "text",
            text: `Search completed successfully!\n` +
              `Search text: "${searchText}"\n` +
              `Used selector: ${usedSelector}\n` +
              `Submit method: ${submitMethod}\n` +
              `URL changed: ${urlChanged ? 'Yes' : 'No'}\n` +
              `Final URL: ${finalUrl}\n` +
              `Has search results: ${hasSearchResults ? 'Yes' : 'No'}`
          }],
          isError: false
        };
      }

      console.log('Enter key did not trigger search (no URL change or results), trying button fallback...');

    } catch (enterError) {
      console.log(`Enter key failed: ${enterError.message}, trying button fallback...`);
    }

    // Step 3: Fallback to button clicking
    let buttonSuccess = false;

    for (const selector of submitSelectors) {
      try {
        const element = page.locator(selector).first();
        await element.waitFor({ timeout: config.timeout / submitSelectors.length });

        if (await element.isVisible() && await element.isEnabled()) {
          await element.scrollIntoViewIfNeeded();
          await page.waitForTimeout(300);
          await element.click();
          buttonSuccess = true;
          submitMethod = `button: ${selector}`;
          console.log(`Search submitted using button: ${selector}`);
          break;
        }
      } catch (error) {
        continue;
      }
    }

    if (!buttonSuccess) {
      console.log('No submit button found, Enter key was the only option');
      submitMethod = 'Enter key (no button found)';
    }

    // Handle navigation/loading for button submission
    if (buttonSuccess && config.waitForNavigation) {
      try {
        await page.waitForLoadState('networkidle', { timeout: config.navigationTimeout });
      } catch (error) {
        // Some sites don't navigate, just update content dynamically
        console.log('Button submission: Navigation timeout, waiting for content update...');
        await page.waitForTimeout(2000);
      }
    }

    // Step 4: Final verification
    const finalUrl = page.url();
    const hasSearchResults = await page.locator('[class*="result"], [class*="search-result"], [id*="result"], .results, #results, [data-testid*="result"]').count() > 0;
    const urlChanged = finalUrl !== initialUrl;

    return {
      content: [{
        type: "text",
        text: `Search completed!\n` +
          `Search text: "${searchText}"\n` +
          `Used selector: ${usedSelector}\n` +
          `Submit method: ${submitMethod}\n` +
          `URL changed: ${urlChanged ? 'Yes' : 'No'}\n` +
          `Final URL: ${finalUrl}\n` +
          `Has search results: ${hasSearchResults ? 'Yes' : 'No'}`
      }],
      isError: false
    };

  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Search operation failed: ${error.message}`
      }],
      isError: true
    };
  }
}

export async function callFill(browser: Browser, selector: string, value: string) {
  const page = await getActivePage(browser);

  if (!page) {
    return {
      content: [{ type: "text", text: "No active page to fill input on" }],
      isError: true
    };
  }

  try {
    const element = page.locator(selector);
    await element.waitFor({ timeout: 10000 });
    await element.fill(value);
    
    return {
      content: [{
        type: "text",
        text: `Filled ${selector} with: ${value}`,
      }],
      isError: false,
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Failed to fill ${selector}: ${(error as Error).message}`,
      }],
      isError: true,
    };
  }
}

export async function callSelect(browser: Browser, selector: string, value: string) {
  const page = await getActivePage(browser);

  if (!page) {
    return {
      content: [{ type: "text", text: "No active page to select on" }],
      isError: true
    };
  }

  try {
    const element = page.locator(selector);
    await element.waitFor({ timeout: 10000 });
    await element.selectOption(value);
    
    return {
      content: [{
        type: "text",
        text: `Selected ${selector} with: ${value}`,
      }],
      isError: false,
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Failed to select ${selector}: ${(error as Error).message}`,
      }],
      isError: true,
    };
  }
}

export async function callHover(browser: Browser, selector: string) {
  const page = await getActivePage(browser);

  if (!page) {
    return {
      content: [{ type: "text", text: "No active page to hover on" }],
      isError: true
    };
  }

  try {
    const element = page.locator(selector);
    await element.waitFor({ timeout: 10000 });
    await element.hover();
    
    return {
      content: [{
        type: "text",
        text: `Hovered ${selector}`,
      }],
      isError: false,
    };
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Failed to hover ${selector}: ${(error as Error).message}`,
      }],
      isError: true,
    };
  }
}

export async function callClick(browser: Browser, selector: string, nth?: number) {
  const page = await getActivePage(browser);

  if (!page) {
    return {
      content: [{ type: "text", text: "No active page to click on" }],
      isError: true
    };
  }

  try {
    console.log(`Attempting to click selector: ${selector}${nth !== undefined ? ` (nth: ${nth})` : ''}`);

    // First, check how many elements match the selector
    const element = page.locator(selector);
    const count = await element.count();
    console.log(`Found ${count} elements matching selector: ${selector}`);

    if (count === 0) {
      return {
        content: [{ type: "text", text: `No elements found matching selector: ${selector}` }],
        isError: true
      };
    }

    if (count === 1) {
      // Single element - use original logic
      await element.waitFor({ timeout: 10000 });
      await element.scrollIntoViewIfNeeded();
      await element.click();
      console.log(`Successfully clicked single element using Playwright locator`);

      return {
        content: [{ type: "text", text: `Clicked on ${selector}` }],
        isError: false
      };
    }

    // Multiple elements found
    console.log(`Multiple elements found (${count})`);

    let targetIndex: number;
    let selectionMethod: string;

    if (nth !== undefined) {
      // nth parameter specified
      if (nth < 0 || nth >= count) {
        return {
          content: [{
            type: "text",
            text: `Invalid nth value: ${nth}. Must be between 0 and ${count - 1} (found ${count} elements)`
          }],
          isError: true
        };
      }
      targetIndex = nth;
      selectionMethod = `specified nth=${nth}`;
    } else {
      // Random selection
      targetIndex = Math.floor(Math.random() * count);
      selectionMethod = `randomly selected (${targetIndex} of ${count})`;
    }

    console.log(`Target index: ${targetIndex}, selection method: ${selectionMethod}`);

    // Try to click the target element
    try {
      const targetElement = element.nth(targetIndex);
      await targetElement.waitFor({ timeout: 5000 });

      const isVisible = await targetElement.isVisible();
      const isEnabled = await targetElement.isEnabled();

      if (!isVisible || !isEnabled) {
        console.log(`Target element ${targetIndex} not clickable - visible: ${isVisible}, enabled: ${isEnabled}`);

        // If specific nth was requested and it's not clickable, return error
        if (nth !== undefined) {
          return {
            content: [{
              type: "text",
              text: `Element ${nth} matching ${selector} is not clickable (visible: ${isVisible}, enabled: ${isEnabled})`
            }],
            isError: true
          };
        }

        // If random selection and target not clickable, try to find first clickable element
        console.log(`Random target not clickable, searching for first clickable element...`);
        for (let i = 0; i < count; i++) {
          try {
            const fallbackElement = element.nth(i);
            const fallbackVisible = await fallbackElement.isVisible();
            const fallbackEnabled = await fallbackElement.isEnabled();

            if (fallbackVisible && fallbackEnabled) {
              await fallbackElement.scrollIntoViewIfNeeded();
              await fallbackElement.click();
              console.log(`Successfully clicked fallback element ${i}`);

              return {
                content: [{
                  type: "text",
                  text: `Clicked on ${selector} (element ${i} of ${count} - fallback after random target ${targetIndex} was not clickable)`
                }],
                isError: false
              };
            }
          } catch (fallbackError) {
            continue;
          }
        }

        // No clickable elements found
        return {
          content: [{
            type: "text",
            text: `No clickable elements found among ${count} matches for ${selector}`
          }],
          isError: true
        };
      }

      // Target element is clickable
      await targetElement.scrollIntoViewIfNeeded();
      await targetElement.click();
      console.log(`Successfully clicked target element ${targetIndex} using ${selectionMethod}`);

      return {
        content: [{
          type: "text",
          text: `Clicked on ${selector} (element ${targetIndex} of ${count} - ${selectionMethod})`
        }],
        isError: false
      };

    } catch (targetError) {
      console.log(`Target element ${targetIndex} failed: ${targetError.message}`);

      // If specific nth was requested and failed, return error
      if (nth !== undefined) {
        return {
          content: [{
            type: "text",
            text: `Failed to click element ${nth} matching ${selector}: ${targetError.message}`
          }],
          isError: true
        };
      }

      // If random selection failed, try first available element as fallback
      console.log(`Random target failed, trying first available element...`);
      try {
        const firstElement = element.first();
        await firstElement.waitFor({ timeout: 5000 });
        await firstElement.scrollIntoViewIfNeeded();
        await firstElement.click();
        console.log(`Successfully clicked first element using fallback`);

        return {
          content: [{
            type: "text",
            text: `Clicked on ${selector} (first of ${count} elements - fallback after random selection failed)`
          }],
          isError: false
        };
      } catch (fallbackError) {
        return {
          content: [{
            type: "text",
            text: `Failed to click any of ${count} elements matching ${selector}. Random target error: ${targetError.message}, Fallback error: ${fallbackError.message}`
          }],
          isError: true
        };
      }
    }

  } catch (error) {
    console.error(`Click failed for ${selector}:`, error);

    // Provide more helpful error message for strict mode violations
    if (error.message.includes('strict mode violation')) {
      const match = error.message.match(/resolved to (\d+) elements/);
      const elementCount = match ? match[1] : 'multiple';

      return {
        content: [{
          type: "text",
          text: `Failed to click ${selector}: Found ${elementCount} matching elements. Try using a more specific selector or use the nth parameter (e.g., nth=0 for first element)`
        }],
        isError: true
      };
    }

    return {
      content: [{ type: "text", text: `Failed to click ${selector}: ${(error as Error).message}` }],
      isError: true
    };
  }
}