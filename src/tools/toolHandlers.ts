import { Browser } from 'playwright';
import * as helpers from './toolHelpers.ts';

export async function handleToolCall(
  toolName: string,
  toolArguments: any,
  browser: Browser,
  httpOnlySession: { consoleLogs: string[], initialized: boolean }
) {
  switch (toolName) {
    case 'navigate':
      return await helpers.callNavigate(browser, toolArguments.url);
    case 'open_new_tab':
      return await helpers.callOpenNewTab(browser, toolArguments.url);
    case 'reload_page':
      return await helpers.callReloadPage(browser);
    case 'go_back':
      return await helpers.callGoBack(browser, toolArguments);
    case 'go_forward':
      return await helpers.callGoForward(browser, toolArguments);
    case 'switch_tab':
      return await helpers.callSwitchTab(browser, toolArguments.targetTabName);
    case 'get_page_content':
      return await helpers.callGetPageContent(browser, toolArguments);
    case 'get_html':
      return await helpers.callGetHtml(browser);
    case 'search':
      return await helpers.callSearch(browser, toolArguments.searchText, toolArguments);
    case 'fill':
      return await helpers.callFill(browser, toolArguments.selector, toolArguments.value);
    case 'select':
      return await helpers.callSelect(browser, toolArguments.selector, toolArguments.value);
    case 'hover':
      return await helpers.callHover(browser, toolArguments.selector);
    case 'click':
      return await helpers.callClick(browser, toolArguments.selector);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}