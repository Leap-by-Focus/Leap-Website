#!/bin/bash

# Zielordner
TARGET_DIR="./leap-code"

# Repo-URL
REPO_URL="https://github.com/Leap-by-Focus/Leap-VSCPlugin.git"

# Falls Repo noch nicht geklont wurde
if [ ! -d "$TARGET_DIR/.git" ]; then
    echo "Cloning Leap repo..."
    git clone "$REPO_URL" "$TARGET_DIR"
else
    echo "Pulling latest changes..."
    cd "$TARGET_DIR" && git pull origin main
fi