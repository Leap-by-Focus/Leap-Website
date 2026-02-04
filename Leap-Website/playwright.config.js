// =======================================================================
// 🎭 PLAYWRIGHT CONFIG — UI Test Konfiguration
// =======================================================================
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    // Test-Verzeichnis
    testDir: './tests/e2e',
    
    // Parallele Ausführung
    fullyParallel: true,
    
    // Fehler bei console.error in Tests
    forbidOnly: !!process.env.CI,
    
    // Retries bei Fehlern
    retries: process.env.CI ? 2 : 0,
    
    // Anzahl paralleler Worker
    workers: process.env.CI ? 1 : undefined,
    
    // Reporter
    reporter: [
        ['html', { outputFolder: 'playwright-report' }],
        ['json', { outputFile: 'test-results/results.json' }],
        process.env.CI ? ['github'] : ['list']
    ],
    
    // Globale Einstellungen
    use: {
        // Base URL für Tests
        baseURL: 'http://localhost:8081',
        
        // Screenshots bei Fehlern
        screenshot: 'only-on-failure',
        
        // Videos bei Fehlern
        video: 'retain-on-failure',
        
        // Trace bei Fehlern
        trace: 'retain-on-failure',
        
        // Timeout für Actions
        actionTimeout: 10000,
    },
    
    // Projekte (Browser-Konfigurationen)
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        // Optional: Firefox und Safari
        // {
        //     name: 'firefox',
        //     use: { ...devices['Desktop Firefox'] },
        // },
        // {
        //     name: 'webkit',
        //     use: { ...devices['Desktop Safari'] },
        // },
    ],
    
    // Webserver vor Tests starten
    webServer: {
        command: 'cd ai && node server.js',
        url: 'http://localhost:8081/api/health',
        reuseExistingServer: !process.env.CI,
        timeout: 30000,
    },
    
    // Timeout pro Test
    timeout: 60000,
    
    // Expect Timeout
    expect: {
        timeout: 10000,
    },
});
