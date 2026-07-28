# Homebrew Cask for ZenBot.
#
# This file belongs in Piyush's tap repo:  PIYUSH_GH_USERNAME/homebrew-tap → Casks/zenbot.rb
# Once it's there, anyone installs with:   brew install --cask PIYUSH_GH_USERNAME/tap/zenbot
#
# Before committing, replace PIYUSH_GH_USERNAME with the real GitHub username, and paste
# the DMG digest into `sha256`. On each release, bump `version` to the git tag (no leading
# "v") and refresh the digest:
#   shasum -a 256 ZenBot_<version>_universal.dmg
cask "zenbot" do
  version "0.2.5"
  sha256 "PASTE_THE_SHA256_OF_YOUR_DMG_HERE"

  url "https://github.com/PIYUSH_GH_USERNAME/zenbot/releases/download/v#{version}/ZenBot_#{version}_universal.dmg",
      verified: "github.com/PIYUSH_GH_USERNAME/zenbot/"
  name "ZenBot"
  desc "Jarvis-style AI that makes you take breaks, with guided eye-care"
  homepage "https://github.com/PIYUSH_GH_USERNAME/zenbot"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates false
  depends_on macos: ">= :catalina"

  app "ZenBot.app"

  caveats <<~EOS
    ZenBot is open-source and self-signed (not notarized), so the first time you open it
    macOS may say it "cannot be opened". To allow it just once:

      • Right-click ZenBot in Applications → Open → Open, or
      • run:  xattr -cr "/Applications/ZenBot.app"

    After that it opens normally. ZenBot then lives in your menu bar.
  EOS

  # Cleans up local data on `brew uninstall --zap`.
  zap trash: [
    "~/Library/Application Support/com.piyush-khanna-qmb.zenbot",
    "~/Library/Preferences/com.piyush-khanna-qmb.zenbot.plist",
    "~/Library/Saved Application State/com.piyush-khanna-qmb.zenbot.savedState",
    "~/Library/LaunchAgents/com.piyush-khanna-qmb.zenbot.plist",
  ]
end
