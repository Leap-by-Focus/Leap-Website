// build_leap_interpreter.js
import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import url from "url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirnameLocal = path.dirname(__filename);

// ❗ Dein echtes Plugin liegt NICHT im Repo, sondern HIER:
const PLUGIN_ROOT = "/Users/veselinovicluka/Desktop/Github/Leap/Leap-VSCPlugin";

// Java Source Ordner
const SRC = path.join(PLUGIN_ROOT, "java-src", "leap");

// Output Ordner
const OUT = path.join(PLUGIN_ROOT, "java-classes");

// Ziel JAR
const JAR = path.join(PLUGIN_ROOT, "leap-interpreter.jar");

// Output Ordner erzeugen
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// Check: gibt es Java Dateien?
if (!fs.existsSync(SRC)) {
  console.error("❌ SRC-Pfad existiert nicht:", SRC);
  process.exit(1);
}

console.log("🧱 Kompiliere Leap Interpreter...");
execSync(`javac -d "${OUT}" ${SRC}/*.java`, {
  stdio: "inherit"
});

// Manifest erzeugen
const manifest = "Main-Class: leap.Main\n";
fs.writeFileSync(path.join(OUT, "MANIFEST.MF"), manifest);

// JAR erstellen
console.log("📦 Erstelle leap-interpreter.jar ...");
execSync(`jar cfm "${JAR}" "${path.join(OUT, "MANIFEST.MF")}" -C "${OUT}" .`, {
  stdio: "inherit"
});

console.log("✅ Interpreter gebaut:", JAR);