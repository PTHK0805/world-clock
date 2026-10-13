import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { CloseIcon, DownloadIcon, ExternalLinkIcon, GlobeIcon, MailIcon, RefreshIcon } from "./icons";
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
  updater: Updater;
}

export function AboutView({ onClose, updater }: AboutViewProps) {
  const [appVersion, setAppVersion] = useState("");
  const { status, version, progress, checkForUpdates, install } = updater;

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => {});
  }, []);

  const updateLabel =
    status === "checking"
      ? "Checking for updates…"
      : status === "available"
        ? `Update to v${version}`
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
          ) : (
            <button
              type="button"
              className={`about__link${status === "available" ? " about__link--accent" : ""}`}
              onClick={() => (status === "available" ? void install() : void checkForUpdates())}
              disabled={status === "checking"}
              title={status === "available" ? `Install World Clock v${version}` : "Check for updates"}
            >
              <span className="about__link-icon">
                {status === "available" ? <DownloadIcon /> : <RefreshIcon />}
              </span>
              <span className="about__link-text">{updateLabel}</span>
              <span className="about__link-open">
                {status === "available" ? <DownloadIcon /> : <RefreshIcon />}
              </span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
