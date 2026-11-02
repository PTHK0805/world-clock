import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { CloseIcon, ExternalLinkIcon, GlobeIcon, InfoIcon, MailIcon, RefreshIcon } from "./icons";
import { openExternal } from "../lib/window";
import type { Updater } from "../hooks/useUpdater";

const DEVELOPER = {
  name: "Phyo Thiha Kyaw",
  website: "phyothihakyaw.com",
  websiteUrl: "https://phyothihakyaw.com",
  email: "contact@phyothihakyaw.com",
};

interface AboutViewProps {
  onClose: () => void;
  onShowTour: () => void;
  updater: Updater;
}

export function AboutView({ onClose, onShowTour, updater }: AboutViewProps) {
  const [appVersion, setAppVersion] = useState("");
  const { status, version, progress, checkForUpdates, restart } = updater;

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  const updateLabel =
    status === "checking"
      ? "Checking for updates…"
      : status === "downloading"
        ? `Downloading v${version}…`
        : status === "uptodate"
          ? `Up to date${appVersion ? ` — v${appVersion}` : ""}`
          : status === "error"
            ? "Couldn't check — try again"
            : "Check for updates";

  return (
    <div
      className="about"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <div className="about__header">
        <p className="panel-hint">About</p>
        <button type="button" className="icon-btn icon-btn--tiny" onClick={onClose} title="Back to the clock">
          <CloseIcon size={12} />
        </button>
      </div>

      <div className="about__body">
        <div className="about__title">
          <span className="about__app">World Clock</span>
          {appVersion && <span className="about__version">v{appVersion}</span>}
        </div>

        <div className="about__dev">
          <span className="about__role">Developed by</span>
          <span className="about__person">{DEVELOPER.name}</span>
        </div>

        <div className="about__links">
          <button
            type="button"
            className="about__link"
            onClick={() => void openExternal(DEVELOPER.websiteUrl)}
            title={`Open ${DEVELOPER.website}`}
          >
            <span className="about__link-icon">
              <GlobeIcon />
            </span>
            <span className="about__link-text">{DEVELOPER.website}</span>
            <span className="about__link-open">
              <ExternalLinkIcon />
            </span>
          </button>
          <button
            type="button"
            className="about__link"
            onClick={() => void openExternal(`mailto:${DEVELOPER.email}`)}
            title={`Email ${DEVELOPER.email}`}
          >
            <span className="about__link-icon">
              <MailIcon />
            </span>
            <span className="about__link-text">{DEVELOPER.email}</span>
            <span className="about__link-open">
              <ExternalLinkIcon />
            </span>
          </button>
          <button
            type="button"
            className="about__link"
            onClick={onShowTour}
            title="Replay the guided tour"
          >
            <span className="about__link-icon">
              <InfoIcon />
            </span>
            <span className="about__link-text">Show the guided tour</span>
          </button>
        </div>

        <div className="about__updates">
          <span className="about__role">Updates</span>
          {status === "downloading" ? (
            <div className="about__progress">
              <span className="about__progress-track">
                <span className="about__progress-fill" style={{ width: `${progress}%` }} />
              </span>
              <span className="about__progress-label">{progress}%</span>
            </div>
          ) : status === "ready" ? (
            <button
              type="button"
              className="about__link about__link--accent"
              onClick={() => void restart()}
              title={`Restart to finish updating to v${version}`}
            >
              <span className="about__link-icon">
                <RefreshIcon />
              </span>
              <span className="about__link-text">Restart to update to v{version}</span>
              <span className="about__link-open">
                <RefreshIcon />
              </span>
            </button>
          ) : (
            <button
              type="button"
              className="about__link"
              onClick={() => void checkForUpdates()}
              disabled={status === "checking"}
              title="Check for updates"
            >
              <span className="about__link-icon">
                <RefreshIcon />
              </span>
              <span className="about__link-text">{updateLabel}</span>
              <span className="about__link-open">
                <RefreshIcon />
              </span>
            </button>
          )}
          {status === "ready" && (
            <p className="about__note">Downloaded and ready. Restarting installs it and brings the widget back.</p>
          )}
        </div>
      </div>
    </div>
  );
}
