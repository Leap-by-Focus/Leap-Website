// =======================================================================
// 🎭 AI CHAT E2E TESTS — Chat-Flow Automatisierung
// =======================================================================
import { test, expect } from '@playwright/test';

// =============================================
// 🏠 PAGE LOAD TESTS
// =============================================
test.describe('AI Chat - Seitenladung', () => {
    
    test('Seite lädt korrekt', async ({ page }) => {
        await page.goto('/html/ai.html');
        
        // Prüfe ob wichtige Elemente vorhanden sind
        await expect(page.locator('#messageBox')).toBeVisible();
        await expect(page.locator('#userInput')).toBeVisible();
        await expect(page.locator('#sendMessage')).toBeVisible();
    });
    
    test('Willkommensnachricht wird angezeigt', async ({ page }) => {
        await page.goto('/html/ai.html');
        
        // Prüfe ob Leap AI Titel vorhanden
        await expect(page.locator('.chat-header h1')).toContainText('Leap AI');
    });
});

// =============================================
// 💬 CHAT FLOW TESTS
// =============================================
test.describe('AI Chat - Chat Flow', () => {
    
    test('Hallo eingeben -> Senden -> Antwort erhalten', async ({ page }) => {
        await page.goto('/html/ai.html');
        
        // 1. Warte bis Message-Box geladen
        const messageBox = page.locator('#messageBox');
        await expect(messageBox).toBeVisible();
        
        // 2. Zähle bestehende Bubbles
        const initialBubbles = await page.locator('.msg').count();
        
        // 3. Text eingeben
        const input = page.locator('#userInput');
        await input.fill('Hallo');
        
        // 4. Senden klicken
        const sendBtn = page.locator('#sendMessage');
        await expect(sendBtn).toBeEnabled();
        await sendBtn.click();
        
        // 5. Warte auf User-Bubble
        await expect(page.locator('.msg.user').last()).toContainText('Hallo');
        
        // 6. Warte auf Typing-Indicator (optional, kann schnell verschwinden)
        // await expect(page.locator('.typing-indicator')).toBeVisible({ timeout: 5000 });
        
        // 7. Warte auf AI-Antwort (max 30 Sekunden für LLM)
        await expect(page.locator('.msg.ai').last()).toBeVisible({ timeout: 30000 });
        
        // 8. Prüfe ob mehr Bubbles als vorher
        const finalBubbles = await page.locator('.msg').count();
        expect(finalBubbles).toBeGreaterThan(initialBubbles);
    });
    
    test('Leere Eingabe -> Senden deaktiviert', async ({ page }) => {
        await page.goto('/html/ai.html');
        
        const input = page.locator('#userInput');
        const sendBtn = page.locator('#sendMessage');
        
        // Input leer -> Button sollte deaktiviert sein
        await input.fill('');
        await expect(sendBtn).toBeDisabled();
        
        // Text eingeben -> Button aktiviert
        await input.fill('Test');
        await expect(sendBtn).toBeEnabled();
        
        // Text löschen -> Button wieder deaktiviert
        await input.fill('');
        await expect(sendBtn).toBeDisabled();
    });
    
    test('Enter drücken sendet Nachricht', async ({ page }) => {
        await page.goto('/html/ai.html');
        
        const input = page.locator('#userInput');
        const initialBubbles = await page.locator('.msg.user').count();
        
        // Text eingeben und Enter drücken
        await input.fill('Test mit Enter');
        await input.press('Enter');
        
        // Warte auf User-Bubble
        await expect(page.locator('.msg.user').last()).toContainText('Test mit Enter');
        
        const finalBubbles = await page.locator('.msg.user').count();
        expect(finalBubbles).toBeGreaterThan(initialBubbles);
    });
});

// =============================================
// 🔧 CODE EXECUTION TESTS
// =============================================
test.describe('AI Chat - Code Ausführung', () => {
    
    test('Code-Block hat Run-Button', async ({ page }) => {
        await page.goto('/html/ai.html');
        
        // Frage nach Code
        const input = page.locator('#userInput');
        await input.fill('Zeig mir eine for-Schleife');
        await page.locator('#sendMessage').click();
        
        // Warte auf AI-Antwort mit Code
        await expect(page.locator('.msg.ai').last()).toBeVisible({ timeout: 30000 });
        
        // Prüfe ob Code-Block mit Run-Button erscheint
        const codeWrapper = page.locator('.code-wrapper').first();
        
        // Wenn Code generiert wurde, sollte Run-Button da sein
        const hasCode = await codeWrapper.isVisible().catch(() => false);
        if (hasCode) {
            await expect(codeWrapper.locator('.run-btn')).toBeVisible();
            await expect(codeWrapper.locator('.copy-btn')).toBeVisible();
        }
    });
    
    test('Copy-Button kopiert Code', async ({ page, context }) => {
        // Clipboard-Berechtigung
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        
        await page.goto('/html/ai.html');
        
        // Frage nach einfachem Code
        await page.locator('#userInput').fill('print("Hallo")');
        await page.locator('#sendMessage').click();
        
        // Warte auf Antwort
        await expect(page.locator('.msg.ai').last()).toBeVisible({ timeout: 30000 });
        
        // Wenn Code-Block vorhanden, teste Copy
        const copyBtn = page.locator('.copy-btn').first();
        const hasCodeBlock = await copyBtn.isVisible().catch(() => false);
        
        if (hasCodeBlock) {
            await copyBtn.click();
            
            // Prüfe ob Button-Text sich ändert (Feedback)
            await expect(copyBtn).toContainText('✅', { timeout: 2000 });
        }
    });
});

// =============================================
// 👍👎 FEEDBACK TESTS
// =============================================
test.describe('AI Chat - Feedback System', () => {
    
    test('Feedback-Buttons erscheinen bei AI-Antwort', async ({ page }) => {
        await page.goto('/html/ai.html');
        
        // Sende Nachricht
        await page.locator('#userInput').fill('Was ist LEAP?');
        await page.locator('#sendMessage').click();
        
        // Warte auf AI-Antwort
        const aiMessage = page.locator('.msg.ai').last();
        await expect(aiMessage).toBeVisible({ timeout: 30000 });
        
        // Hover über AI-Nachricht
        await aiMessage.hover();
        
        // Feedback-Buttons sollten erscheinen
        await expect(aiMessage.locator('.feedback-buttons')).toBeVisible();
        await expect(aiMessage.locator('.feedback-positive')).toBeVisible();
        await expect(aiMessage.locator('.feedback-negative')).toBeVisible();
    });
    
    test('Positives Feedback funktioniert', async ({ page }) => {
        await page.goto('/html/ai.html');
        
        // Sende Nachricht und warte auf Antwort
        await page.locator('#userInput').fill('Hallo Leap');
        await page.locator('#sendMessage').click();
        
        const aiMessage = page.locator('.msg.ai').last();
        await expect(aiMessage).toBeVisible({ timeout: 30000 });
        
        // Hover und klicke 👍
        await aiMessage.hover();
        const thumbUp = aiMessage.locator('.feedback-positive');
        await thumbUp.click();
        
        // Prüfe ob "Danke" erscheint
        await expect(aiMessage.locator('.feedback-thanks')).toBeVisible({ timeout: 3000 });
        
        // Prüfe ob Button selected ist
        await expect(thumbUp).toHaveClass(/selected/);
    });
});

// =============================================
// 🖼️ IMAGE UPLOAD TESTS
// =============================================
test.describe('AI Chat - Bild Upload', () => {
    
    test('Bild-Upload Button ist vorhanden', async ({ page }) => {
        await page.goto('/html/ai.html');
        
        // Prüfe ob Image-Input existiert
        const imageInput = page.locator('#imageUpload');
        await expect(imageInput).toBeAttached();
    });
});

// =============================================
// 📱 RESPONSIVE TESTS
// =============================================
test.describe('AI Chat - Responsive', () => {
    
    test('Mobile Ansicht funktioniert', async ({ page }) => {
        // Setze Mobile Viewport
        await page.setViewportSize({ width: 375, height: 667 });
        await page.goto('/html/ai.html');
        
        // Chat sollte immer noch funktionieren
        await expect(page.locator('#messageBox')).toBeVisible();
        await expect(page.locator('#userInput')).toBeVisible();
    });
});
