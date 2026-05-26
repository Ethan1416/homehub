#!/usr/bin/env bash
# Dev iteration loop for HomeHub. Edit Swift, run `./dev.sh`:
#   1. Regenerate xcodeproj from project.yml
#   2. Build & install on Mac (replaces /Applications/HomeHub.app)
#   3. Build & install on iPhone (if connected)
#   4. Tell macOS to refresh widget timelines so the new code renders now
#
# Args:  --mac    only build/install Mac
#        --ios    only build/install iPhone
#        --skip-gen   skip xcodegen (faster if project.yml unchanged)
set -e
cd "$(dirname "$0")"

DO_MAC=1
DO_IOS=1
DO_GEN=1
IPHONE_ID="00008130-000E75590AC3001C"

for arg in "$@"; do
  case "$arg" in
    --mac)       DO_IOS=0 ;;
    --ios)       DO_MAC=0 ;;
    --skip-gen)  DO_GEN=0 ;;
  esac
done

if [[ $DO_GEN -eq 1 ]]; then
  echo "▶ regenerating Xcode project from project.yml"
  /opt/homebrew/bin/xcodegen generate --quiet
fi

if [[ $DO_MAC -eq 1 ]]; then
  echo "▶ building for macOS"
  xcodebuild -project HomeHub.xcodeproj -scheme HomeHub \
    -configuration Release -destination 'platform=macOS' \
    -derivedDataPath ./build -allowProvisioningUpdates build \
    -quiet
  echo "▶ installing on Mac"
  killall HomeHub 2>/dev/null || true
  rm -rf /Applications/HomeHub.app
  cp -R build/Build/Products/Release/HomeHub.app /Applications/
  /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister \
    -f -R -trusted /Applications/HomeHub.app
  killall chronod 2>/dev/null || true
  open /Applications/HomeHub.app
  sleep 1
fi

if [[ $DO_IOS -eq 1 ]]; then
  # Confirm an iPhone is online (connected or available). We use the hardware
  # ECID for xcodebuild — it doesn't change even when devicectl's pairing UUID
  # rotates between sessions. The pairing UUID in $3 is NOT what xcodebuild
  # wants.
  if xcrun devicectl list devices 2>/dev/null \
      | awk '/^iPhone/ && ($4 == "connected" || $4 == "available") {found=1} END{exit !found}'; then
    DETECTED_ID="$IPHONE_ID"
    echo "▶ iPhone online — building for $DETECTED_ID"
    echo "▶ building for iPhone"
    xcodebuild -project HomeHub.xcodeproj -scheme HomeHub \
      -configuration Release \
      -destination "id=$DETECTED_ID" \
      -derivedDataPath ./build-ios \
      -allowProvisioningUpdates build \
      -quiet
    echo "▶ installing on iPhone"
    xcrun devicectl device install app \
      --device "$DETECTED_ID" \
      build-ios/Build/Products/Release-iphoneos/HomeHub.app \
      > /dev/null
    echo "▶ launch once to register the new widget extension"
    xcrun devicectl device process launch \
      --device "$DETECTED_ID" \
      com.ethan.homehub > /dev/null 2>&1 || true
  else
    echo "⚠ no iPhone connected (run 'xcrun devicectl list devices' to check); skipping iOS build"
  fi
fi

echo "✓ done"
