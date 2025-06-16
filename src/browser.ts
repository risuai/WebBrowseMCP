import { chromium, firefox, webkit, Browser } from 'playwright';
import { execSync, spawn } from 'child_process';
import { platform } from 'os';

const DEBUG_PORT = 9222;

function isPortInUse(port: number): boolean {
  try {
    if (platform() === 'win32') {
      const result = execSync(`netstat -an | findstr :${port}`, { encoding: 'utf8' });
      return result.includes(`${port}`);
    } else {
      execSync(`lsof -i :${port}`, { stdio: 'pipe' });
      return true;
    }
  } catch {
    return false;
  }
}

async function isBrowserDebuggingReady(): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${DEBUG_PORT}/json/version`, {
      signal: AbortSignal.timeout(2000)
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForBrowserReady(maxAttempts: number = 5): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    if (await isBrowserDebuggingReady()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return false;
}

async function waitForWebKitReady(maxAttempts: number = 5): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      // Try to create a test context to see if WebKit is ready
      const testBrowser = await webkit.launch({ headless: true });
      await testBrowser.close();
      return true;
    } catch {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  return false;
}

async function launchChromeWithDebugging(): Promise<void> {
  const chromeArgs = [
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--user-data-dir=/Users/misterms/Applications/mcp/chrome',
    '--use-gl=swiftshader'
  ];
  
  try {
    if (platform() === 'darwin') {
      spawn('open', ['-a', 'Google Chrome', '--args', ...chromeArgs], {
        detached: true,
        stdio: 'ignore'
      });
    } else if (platform() === 'win32') {
      const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      spawn(chromePath, chromeArgs, {
        detached: true,
        stdio: 'ignore'
      });
    } else {
      spawn('google-chrome', chromeArgs, {
        detached: true,
        stdio: 'ignore'
      });
    }
  } catch (error) {
    throw new Error(`Failed to launch Chrome: ${error.message}`);
  }
}

async function launchFirefoxWithDebugging(): Promise<void> {
  try {
    if (platform() === 'darwin') {
      spawn('open', ['-a', 'Firefox', '--args', '--start-debugger-server', DEBUG_PORT.toString()], {
        detached: true,
        stdio: 'ignore'
      });
    } else if (platform() === 'win32') {
      const firefoxPath = 'C:\\Program Files\\Mozilla Firefox\\firefox.exe';
      spawn(firefoxPath, ['--start-debugger-server', DEBUG_PORT.toString()], {
        detached: true,
        stdio: 'ignore'
      });
    } else {
      spawn('firefox', ['--start-debugger-server', DEBUG_PORT.toString()], {
        detached: true,
        stdio: 'ignore'
      });
    }
  } catch (error) {
    throw new Error(`Failed to launch Firefox: ${error.message}`);
  }
}

async function initChromeSmartly(): Promise<Browser> {
  if (isPortInUse(DEBUG_PORT)) {
    if (!(await isBrowserDebuggingReady())) {
      throw new Error("Port 9222 is occupied by non-browser debugging process");
    }
  } else {
    await launchChromeWithDebugging();
    
    const isReady = await waitForBrowserReady(5);
    if (!isReady) {
      throw new Error("Chrome failed to start within 5 seconds");
    }
  }
  
  try {
    const browser = await chromium.connectOverCDP({
      endpointURL: `http://localhost:${DEBUG_PORT}`,
    });
    return browser;
  } catch (error) {
    throw new Error(`Failed to connect to Chrome: ${error.message}`);
  }
}

async function initFirefoxSmartly(): Promise<Browser> {
  if (isPortInUse(DEBUG_PORT)) {
    if (!(await isBrowserDebuggingReady())) {
      throw new Error("Port 9222 is occupied by non-browser debugging process");
    }
  } else {
    await launchFirefoxWithDebugging();
    
    const isReady = await waitForBrowserReady(5);
    if (!isReady) {
      throw new Error("Firefox failed to start within 5 seconds");
    }
  }
  
  try {
    const browser = await firefox.connectOverCDP({
      endpointURL: `http://localhost:${DEBUG_PORT}`,
    });
    return browser;
  } catch (error) {
    throw new Error(`Failed to connect to Firefox: ${error.message}`);
  }
}

async function initWebKitSmartly(): Promise<Browser> {
  try {
    const browser = await webkit.launch({
      headless: false
    });
    
    // Wait for WebKit to be fully ready
    const isReady = await waitForWebKitReady(5);
    if (!isReady) {
      await browser.close();
      throw new Error("WebKit failed to start within 5 seconds");
    }
    
    return browser;
  } catch (error) {
    throw new Error(`Failed to launch WebKit: ${error.message}`);
  }
}

export async function initBrowser(browserType: 'chrome' | 'firefox' | 'webkit' = 'chrome'): Promise<Browser> {
  try {
    switch (browserType) {
      case 'chrome':
        return await initChromeSmartly();
        
      case 'firefox':
        return await initFirefoxSmartly();
        
      case 'webkit':
        return await initWebKitSmartly();
        
      default:
        throw new Error(`Unsupported browser type: ${browserType}`);
    }
  } catch (error) {
    if (browserType !== 'chrome') {
      return await initChromeSmartly();
    }
    throw error;
  }
}