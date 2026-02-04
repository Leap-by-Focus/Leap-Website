// =======================================================================
// 🔍 ESLint Konfiguration für LEAP AI Server
// =======================================================================
// Fokus auf:
// - Syntaxfehler finden
// - Unbenutzte Variablen warnen
// - Best Practices für Node.js/ES Modules
// =======================================================================

export default [
    {
        // Ignorierte Dateien/Ordner (müssen am Anfang stehen!)
        ignores: [
            "node_modules/**",
            "leap-code/**",
            "scripts/leap-code/**",
            "*.json",
            "**/*.min.js"
        ]
    },
    {
        // Dateien die geprüft werden
        files: ["**/*.js"],
        
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: "module",
            globals: {
                // Node.js Globals
                console: "readonly",
                process: "readonly",
                Buffer: "readonly",
                __dirname: "readonly",
                __filename: "readonly",
                setTimeout: "readonly",
                clearTimeout: "readonly",
                setInterval: "readonly",
                clearInterval: "readonly",
                URL: "readonly",
                AbortController: "readonly"
            }
        },
        
        rules: {
            // 🚨 Fehler - Müssen behoben werden
            "no-undef": "error",                    // Undefinierte Variablen
            "no-unused-vars": ["warn", {            // Unbenutzte Variablen (Warnung)
                "argsIgnorePattern": "^_",          // _unused ist erlaubt
                "varsIgnorePattern": "^_"
            }],
            "no-const-assign": "error",             // const überschreiben
            "no-dupe-keys": "error",                // Doppelte Object-Keys
            "no-duplicate-case": "error",           // Doppelte switch-cases
            "no-empty": "warn",                     // Leere Blöcke
            "no-extra-semi": "error",               // Überflüssige Semikolons
            "no-func-assign": "error",              // Funktionen überschreiben
            "no-unreachable": "error",              // Unerreichbarer Code
            
            // ⚠️ Warnungen - Sollten behoben werden
            "no-console": "off",                    // console.log erlaubt (Server!)
            "prefer-const": "warn",                 // const statt let wenn möglich
            "eqeqeq": ["warn", "smart"],            // === statt == (außer null)
            
            // 📝 Style - Ausgeschaltet (zu viel Noise für bestehendes Projekt)
            "semi": "off",
            "quotes": "off",
            "indent": "off",
            "no-trailing-spaces": "off",
            "comma-dangle": "off"
        }
    }
];
