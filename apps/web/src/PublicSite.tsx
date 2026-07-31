import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { LanguageSelect } from "./LanguageSelect";
import logoSrc from "./assets/logo.png";
import mascotSrc from "./assets/mascot-nobg.png";
import {
  completePlatformTwoFactor,
  pollPlatformWebLogin,
  logoutPlatformSession,
  setPlatformToken,
  startPlatformWebLogin,
} from "./api";

// ─────────────────────────────────────────────────────────────────────────────
// FINANCIAL CONFIGURATION
// All financial values come from the /api/public/site endpoint (SiteData).
// The constant below is the only place to update the Stars→EUR estimate.
// 1 Telegram Star ≈ 0.012 EUR (roughly 12 EUR per 1 000 Stars).
// ─────────────────────────────────────────────────────────────────────────────
const STARS_TO_EUR_ESTIMATE = 0.012;

function formatNum(n: number): string {
  return Math.round(n).toLocaleString("ru-RU");
}

function formatEur(n: number): string {
  return Math.round(n).toLocaleString("ru-RU", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
type SiteData = {
  platformName: string;
  botUsername: string;
  plans: Array<{
    key: string;
    name: string;
    description: string;
    currency: string;
    unitAmount: number;
    interval: string;
    features: unknown;
  }>;
  documents: Array<{
    id: string;
    type: string;
    version: string;
    title: string;
    body: string;
    effectiveAt: string;
  }>;
  publication: {
    minimumStars: number;
    defaultCommissionPercent: number;
    holdDays: number;
    freeBoardSubscriptionStars: number;
    minimumPayoutStars: number;
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────────────────────────
const visitor = () => {
  const key = "boardVisitor";
  let value = localStorage.getItem(key);
  if (!value) {
    value = crypto.randomUUID().replaceAll("-", "");
    localStorage.setItem(key, value);
  }
  return value;
};

async function track(event: string, path = window.location.pathname) {
  try {
    await fetch("/api/public/conversion", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event,
        visitor: visitor(),
        path,
        referrer: document.referrer,
      }),
      keepalive: true,
    });
  } catch {
    /* Analytics must never block the product. */
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────────────────────────────────────
function Header() {
  const { t } = useTranslation();
  const [signedIn, setSignedIn] = useState(
    Boolean(sessionStorage.getItem("platformToken")),
  );
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/platform/me")
      .then((response) => setSignedIn(response.ok))
      .catch(() => undefined);
  }, []);

  const navLinks = [
    { href: "/#how", label: t("howItWorks") },
    { href: "/#features", label: t("featuresNav") },
    { href: "/#pricing", label: t("pricingNav") },
    { href: "/#faq", label: t("faqNav") },
  ];

  return (
    <header className={`public-header${menuOpen ? " menu-open" : ""}`}>
      <a className="public-brand" href="/" aria-label="ADNECTA">
        <img src={logoSrc} alt="ADNECTA" className="brand-logo" />
        <b>ADNECTA</b>
      </a>

      <nav aria-label="Main navigation">
        {navLinks.map(({ href, label }) => (
          <a key={href} href={href} onClick={() => setMenuOpen(false)}>
            {label}
          </a>
        ))}
      </nav>

      <div className="header-right">
        <LanguageSelect compact />
        <a
          className="public-login"
          href={signedIn ? "/owner" : "/login"}
          onClick={() =>
            void track(signedIn ? "dashboard_return" : "web_login_open")
          }
        >
          {signedIn ? t("openAdminDashboard") : t("telegramLogin")}
        </a>
      </div>

      <button
        className="header-menu-btn"
        aria-label={t(menuOpen ? "menuClose" : "menuOpen")}
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen((v) => !v)}
      >
        <span />
        <span />
        <span />
      </button>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────────────────────
function Footer() {
  const { t } = useTranslation();
  return (
    <div className="public-footer-wrap">
      <footer className="public-footer lp-container">
        <div className="footer-brand">
          <a className="public-brand" href="/" aria-label="ADNECTA">
            <img src={mascotSrc} alt="ADNECTA" className="brand-logo" />
            <b>ADNECTA</b>
          </a>
          <p>{t("footerSlogan")}</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="/#pricing">{t("pricingNav")}</a>
          <a href="/#how">{t("howItWorks")}</a>
          <a href="/support">{t("support")}</a>
          <a href="/terms">{t("terms")}</a>
          <a href="/privacy">{t("privacy")}</a>
          <a href="/prohibited">{t("prohibited")}</a>
        </nav>
        <small>
          {t("footerBeta")}{" "}
          <a
            className="service-owner-entry"
            href="/platform-login"
            aria-label={t("platformOwnerDashboard")}
          >
            ·
          </a>
          <br />
          <a href="mailto:info@adnecta.com" className="footer-email">info@adnecta.com</a>
          <br />
          ALL RIGHTS RESERVED. SMPM GROUP S.L. | B-16834756 | CARRER DE UNIO 8, 43001 TARRAGONA, ESPAÑA
        </small>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED CTA BUTTON
// ─────────────────────────────────────────────────────────────────────────────
function TelegramCta({ label, inverted }: { label?: string; inverted?: boolean }) {
  const { t } = useTranslation();
  return (
    <a
      className={`public-primary${inverted ? " public-primary-inv" : ""}`}
      href="/login"
      onClick={() => void track("web_signup_start")}
    >
      {label || t("connectCommunity")}
    </a>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LANDING SECTIONS
// ─────────────────────────────────────────────────────────────────────────────

function HeroSection() {
  const { t } = useTranslation();
  return (
    <section className="public-hero">
      <div className="hero-inner lp-container">
        <div className="hero-text">
          <p className="hero-epigraph">{t("heroEpigraph")}</p>
          <h1 className="hero-title">{t("heroTitle")}</h1>
          <p className="hero-lead">{t("heroLead")}</p>
          <div className="hero-actions">
            <a
              className="public-primary"
              href="/login"
              onClick={() => void track("hero_cta_click")}
            >
              {t("connectCommunity")}
            </a>
            <a href="#how" className="hero-link">{t("viewProcess")}</a>
          </div>
          <div className="hero-chips">
            <span>{t("heroBenefit1")}</span>
            <span>{t("heroBenefit2")}</span>
            <span>{t("heroBenefit3")}</span>
          </div>
        </div>
        <div className="hero-mascot" aria-hidden="true">
          <img src={mascotSrc} alt="" />
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  const { t } = useTranslation();
  return (
    <section className="public-problem">
      <div className="lp-container">
        <div className="section-label">{t("problemBadge")}</div>
        <h2>{t("problemTitle")}</h2>
        <p className="section-lead">{t("problemDesc")}</p>
        <div className="problem-comparison">
          <div className="problem-col problem-before">
            <h3>{t("problemColTitle")}</h3>
            <ul>
              {(["problemItem1","problemItem2","problemItem3","problemItem4","problemItem5"] as const).map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </div>
          <div className="problem-col problem-after">
            <h3>{t("solutionColTitle")}</h3>
            <ul>
              {(["solutionItem1","solutionItem2","solutionItem3","solutionItem4","solutionItem5","solutionItem6"] as const).map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function DemoSection() {
  const { t } = useTranslation();
  return (
    <section className="public-demo">
      <div className="lp-container demo-layout">
        <div className="demo-text">
          <div className="section-label">{t("demoBadge")}</div>
          <h2>{t("demoTitle")}</h2>
          <p>{t("demoDesc")}</p>
        </div>
        <div className="demo-visual" aria-hidden="true">
          <div className="demo-board">
            <header>
              <span>{t("demoGroupName")}</span>
              <small>{t("communityBoard")}</small>
            </header>
            <article>
              <i>🚲</i>
              <div>
                <b>{t("demoItem1Title")}</b>
                <small>{t("demoItem1Cat")}</small>
                <strong>{t("demoItem1Price")}</strong>
              </div>
            </article>
            <article>
              <i>💻</i>
              <div>
                <b>{t("demoItem2Title")}</b>
                <small>{t("demoItem2Cat")}</small>
                <strong>{t("negotiable")}</strong>
              </div>
            </article>
            <article>
              <i>🏠</i>
              <div>
                <b>{t("demoItem3Title")}</b>
                <small>{t("demoItem3Cat")}</small>
                <strong>{t("demoItem3Price")}</strong>
              </div>
            </article>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  const { t } = useTranslation();
  const cards = [
    { icon: "⚡", title: t("benefit1Title"), text: t("benefit1Text") },
    { icon: "🎛️", title: t("benefit2Title"), text: t("benefit2Text") },
    { icon: "⭐", title: t("benefit3Title"), text: t("benefit3Text") },
  ];
  return (
    <section className="public-features" id="features">
      <div className="lp-container">
        <p className="section-tag">{t("benefitsBadge")}</p>
        <h2 className="section-h2">{t("benefitsTitle")}</h2>
        <div className="features-grid">
          {cards.map(({ icon, title, text }) => (
            <article className="feature-card" key={title}>
              <span className="feature-icon" aria-hidden="true">{icon}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowSection() {
  const { t } = useTranslation();
  const steps = [
    { num: "01", title: t("howStep1Title"), text: t("howStep1Text") },
    { num: "02", title: t("howStep2Title"), text: t("howStep2Text") },
    { num: "03", title: t("howStep3Title"), text: t("howStep3Text") },
  ];
  return (
    <section className="public-how" id="how">
      <div className="lp-container">
        <p className="section-tag">{t("howBadge")}</p>
        <h2 className="section-h2 section-h2-inv">{t("howItWorksTitle")}</h2>
        <div className="how-steps">
          {steps.map(({ num, title, text }) => (
            <article className="how-step" key={num}>
              <div className="how-step-num" aria-hidden="true">{num}</div>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <div className="how-cta">
          <TelegramCta label={t("howCta")} />
        </div>
      </div>
    </section>
  );
}

function RolesSection() {
  const { t } = useTranslation();
  const roles = [
    { title: t("roleAdminTitle"), text: t("roleAdminText") },
    { title: t("roleModTitle"), text: t("roleModText") },
    { title: t("roleMemberTitle"), text: t("roleMemberText") },
  ];
  return (
    <section className="public-roles">
      <div className="lp-container">
        <div className="section-label">{t("rolesBadge")}</div>
        <h2>{t("rolesTitle")}</h2>
        <div className="roles-grid">
          {roles.map(({ title, text }) => (
            <article key={title}>
              <b>{title}</b>
              <p>{text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function AdminControlSection() {
  const { t } = useTranslation();
  const items = [
    t("adminItem1"), t("adminItem2"), t("adminItem3"), t("adminItem4"),
    t("adminItem5"), t("adminItem6"), t("adminItem7"), t("adminItem8"),
    t("adminItem9"), t("adminItem10"),
  ];
  return (
    <section className="public-admin-control">
      <div className="lp-container">
        <div className="section-label">{t("adminBadge")}</div>
        <h2>{t("adminTitle")}</h2>
        <ul className="admin-list">
          {items.map((item, i) => (
            <li key={i}>
              <span aria-hidden="true">✓</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function PricingSection({ data }: { data: SiteData }) {
  const { t } = useTranslation();
  const { minimumStars, defaultCommissionPercent, freeBoardSubscriptionStars } = data.publication;
  const communityShare = 100 - defaultCommissionPercent;

  return (
    <section className="public-pricing-inline" id="pricing">
      <div className="lp-container">
        <p className="section-tag">{t("pricingBadge")}</p>
        <h2 className="section-h2">{t("pricingTitle")}</h2>
        <p className="pricing-lead">{t("pricingLead")}</p>
        <div className="pricing-models">
          <article>
            <small>{t("pricingModel1Label")}</small>
            <h3>{t("model1Title")}</h3>
            <strong className="pricing-price">
              {t("pricingMinNote", { min: minimumStars })}
            </strong>
            <p className="pricing-commission">{t("pricingCommissionNote", { commission: defaultCommissionPercent })}</p>
            <ul>
              <li>✓ {t("model1Feature1", { share: communityShare })}</li>
              <li>✓ {t("model1Feature2")}</li>
              <li>✓ {t("model1Feature3")}</li>
            </ul>
          </article>
          <article className="pricing-featured">
            <small>{t("pricingModel2Label")}</small>
            <h3>{t("model2Title")}</h3>
            <strong className="pricing-price">
              {freeBoardSubscriptionStars}&nbsp;⭐
              <i>&nbsp;{t("pricingIntervalNote")}</i>
            </strong>
            <p className="pricing-commission">{t("model2Desc")}</p>
            <ul>
              <li>✓ {t("model2Feature1")}</li>
              <li>✓ {t("model2Feature2")}</li>
              <li>✓ {t("model2Feature3")}</li>
            </ul>
          </article>
        </div>
      </div>
    </section>
  );
}

function CalculatorSection({ data }: { data: SiteData }) {
  const { t } = useTranslation();
  const { minimumStars, defaultCommissionPercent } = data.publication;
  const defaultPrice = Math.max(minimumStars, 200);

  const [publications, setPublications] = useState(50);
  const [pricePerPub, setPricePerPub] = useState(defaultPrice);

  const commissionRate = defaultCommissionPercent / 100;
  const total = publications * pricePerPub;
  const commission = total * commissionRate;
  const communityMonthly = total - commission;
  const communityYearly = communityMonthly * 12;
  const eurMonthly = communityMonthly * STARS_TO_EUR_ESTIMATE;
  const eurYearly = communityYearly * STARS_TO_EUR_ESTIMATE;

  const handlePubs = (v: string) => {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= 1 && n <= 10000) setPublications(n);
  };

  const handlePrice = (v: string) => {
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= minimumStars && n <= 100000) setPricePerPub(n);
  };

  return (
    <section className="public-calculator">
      <div className="lp-container">
        <div className="section-label">{t("calcBadge")}</div>
        <h2>{t("calcTitle")}</h2>
        <div className="calc-layout">
          <div className="calc-inputs">
            <div className="calc-field">
              <label htmlFor="calc-pub">{t("calcPublicationsLabel")}</label>
              <input
                id="calc-pub"
                type="number"
                value={publications}
                min={1}
                max={10000}
                onChange={(e) => handlePubs(e.target.value)}
              />
            </div>
            <div className="calc-field">
              <label htmlFor="calc-price">{t("calcPriceLabel")}</label>
              <input
                id="calc-price"
                type="number"
                value={pricePerPub}
                min={minimumStars}
                max={100000}
                onChange={(e) => handlePrice(e.target.value)}
              />
              <small>min {minimumStars}&nbsp;⭐</small>
            </div>
          </div>
          <div className="calc-results">
            <div className="calc-row">
              <span>{t("calcTotal")}</span>
              <strong>{formatNum(total)}&nbsp;⭐</strong>
            </div>
            <div className="calc-row calc-row-dim">
              <span>{t("calcCommission", { rate: defaultCommissionPercent })}</span>
              <span>−{formatNum(commission)}&nbsp;⭐</span>
            </div>
            <div className="calc-row calc-row-main">
              <span>{t("calcCommunity")}</span>
              <div className="calc-main-value">
                <strong>{formatNum(communityMonthly)}&nbsp;⭐</strong>
                <em>{t("calcEurApprox", { eur: formatEur(eurMonthly) })}</em>
              </div>
            </div>
            <div className="calc-row">
              <span>{t("calcYearly")}</span>
              <div className="calc-yearly-value">
                <strong>{formatNum(communityYearly)}&nbsp;⭐</strong>
                <em>{t("calcEurApprox", { eur: formatEur(eurYearly) })}</em>
              </div>
            </div>
          </div>
        </div>
        <p className="calc-disclaimer">{t("calcDisclaimer")}</p>
      </div>
    </section>
  );
}

function ScenariosSection() {
  const { t } = useTranslation();
  const items = [
    { icon: "🏙️", key: "scenario1" as const },
    { icon: "🏠", key: "scenario2" as const },
    { icon: "💼", key: "scenario3" as const },
    { icon: "🚗", key: "scenario4" as const },
    { icon: "🛍️", key: "scenario5" as const },
    { icon: "🌍", key: "scenario6" as const },
    { icon: "👨‍👩‍👧", key: "scenario7" as const },
    { icon: "🎓", key: "scenario8" as const },
    { icon: "🔧", key: "scenario9" as const },
    { icon: "♟️", key: "scenario10" as const },
  ];
  return (
    <section className="public-scenarios">
      <div className="lp-container">
        <div className="section-label">{t("scenariosBadge")}</div>
        <h2>{t("scenariosTitle")}</h2>
        <div className="scenarios-grid">
          {items.map(({ icon, key }) => (
            <div className="scenario-item" key={key}>
              <span aria-hidden="true">{icon}</span>
              <p>{t(key)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TrustSection() {
  const { t } = useTranslation();
  return (
    <section className="public-trust">
      <div className="lp-container">
        <div className="section-label">{t("trustBadge")}</div>
        <h2>{t("trustTitle")}</h2>
        <p className="section-lead">{t("trustDesc")}</p>
        <div className="trust-grid">
          <div className="trust-col">
            <h3>{t("trustCanTitle")}</h3>
            <ul>
              <li>{t("trustCan1")}</li>
              <li>{t("trustCan2")}</li>
              <li>{t("trustCan3")}</li>
            </ul>
          </div>
          <div className="trust-col trust-col-cannot">
            <h3>{t("trustCannotTitle")}</h3>
            <ul>
              <li>{t("trustCannot1")}</li>
              <li>{t("trustCannot2")}</li>
              <li>{t("trustCannot3")}</li>
            </ul>
          </div>
        </div>
        <div className="trust-data">
          <h3>{t("trustDataTitle")}</h3>
          <ul>
            <li>{t("trustData1")}</li>
            <li>{t("trustData2")}</li>
            <li>{t("trustData3")}</li>
          </ul>
        </div>
      </div>
    </section>
  );
}

function FaqSection({ data }: { data: SiteData }) {
  const { t } = useTranslation();
  const { defaultCommissionPercent } = data.publication;
  const share = 100 - defaultCommissionPercent;

  const faqs = [
    { q: t("faqMembersRegister"), a: t("faqMembersRegisterAnswer") },
    { q: t("freeQuestion"), a: t("freeAnswer") },
    { q: t("moderationQuestion"), a: t("moderationAnswer") },
    { q: t("faqBotPermissions"), a: t("faqBotPermissionsAnswer") },
    { q: t("faqPayouts"), a: t("faqPayoutsAnswer", { share, hold: data.publication.holdDays, min: data.publication.minimumPayoutStars }) },
  ];

  return (
    <section className="public-faq" id="faq">
      <div className="faq-inner lp-container">
        <p className="section-tag">{t("faq")}</p>
        <h2 className="section-h2">{t("faqTitle")}</h2>
        {faqs.map(({ q, a }, i) => (
          <details key={i}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCtaSection() {
  const { t } = useTranslation();
  return (
    <section className="public-final">
      <div className="final-inner lp-container">
        <h2>{t("launchCommunity")}</h2>
        <p>{t("launchLead")}</p>
        <TelegramCta label={t("createAdminDashboard")} inverted />
        <small>{t("heroBenefit1")}</small>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LANDING PAGE
// ─────────────────────────────────────────────────────────────────────────────
function Landing({ data }: { data: SiteData }) {
  useEffect(() => {
    void track("landing_view");
  }, []);

  return (
    <>
      <HeroSection />
      <FeaturesSection />
      <HowSection />
      <PricingSection data={data} />
      <CalculatorSection data={data} />
      <FaqSection data={data} />
      <FinalCtaSection />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// /pricing PAGE
// ─────────────────────────────────────────────────────────────────────────────
function Pricing({ data }: { data: SiteData }) {
  const { t } = useTranslation();
  const { minimumStars, defaultCommissionPercent, holdDays, freeBoardSubscriptionStars, minimumPayoutStars } = data.publication;
  const communityShare = 100 - defaultCommissionPercent;

  useEffect(() => {
    void track("pricing_view");
  }, []);

  return (
    <main className="public-page">
      <small>{t("pricingPageBadge")}</small>
      <h1>{t("pricingPageTitle")}</h1>
      <p className="lead">{t("pricingPageLead")}</p>
      <div className="pricing-grid">
        <article>
          <small>{t("pricingModel1Label")}</small>
          <h2>{t("model1Title")}</h2>
          <strong>
            {t("pricingMinNote", { min: minimumStars })}
          </strong>
          <p>{t("pricingCommissionNote", { commission: defaultCommissionPercent })}</p>
          <ul>
            <li>✓ {t("model1Feature1", { share: communityShare })}</li>
            <li>✓ {t("model1Feature2")}</li>
            <li>✓ {t("model1Feature3")}</li>
          </ul>
        </article>
        <article>
          <small>{t("pricingModel2Label")}</small>
          <h2>{t("model2Title")}</h2>
          <strong>
            {freeBoardSubscriptionStars}&nbsp;⭐
            <i>&nbsp;{t("pricingIntervalNote")}</i>
          </strong>
          <p>{t("model2Desc")}</p>
          <ul>
            <li>✓ {t("model2Feature1")}</li>
            <li>✓ {t("model2Feature2")}</li>
            <li>✓ {t("model2Feature3")}</li>
          </ul>
        </article>
      </div>
      <div className="pricing-note">
        <p>{t("pricingPaymentsDesc", { hold: holdDays, min: minimumPayoutStars })}</p>
      </div>
      <TelegramCta />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// /docs PAGE
// ─────────────────────────────────────────────────────────────────────────────
function Docs({ data }: { data: SiteData }) {
  const { t } = useTranslation();
  useEffect(() => {
    void track("docs_view");
  }, []);
  return (
    <main className="public-page">
      <small>{t("docsPageBadge")}</small>
      <h1>{t("docsPageTitle")}</h1>
      <p className="lead">{t("docsPageLead")}</p>
      <div className="steps">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <article key={n}>
            <b>{n}</b>
            <div>
              <h2>{t(`docsStep${n}Title` as any)}</h2>
              <p>
                {n === 5
                  ? t("docsStep5Text", { stars: data.publication.freeBoardSubscriptionStars })
                  : t(`docsStep${n}Text` as any)}
              </p>
            </div>
          </article>
        ))}
      </div>
      <h2>{t("commissionAndPayouts")}</h2>
      <p>{t("commissionAndPayoutsDesc", { hold: data.publication.holdDays, min: data.publication.minimumPayoutStars })}</p>
      <TelegramCta label={t("startRegistration")} />
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// /support PAGE
// ─────────────────────────────────────────────────────────────────────────────
function Support({ data }: { data: SiteData }) {
  const { t } = useTranslation();
  return (
    <main className="public-page">
      <small>{t("support").toUpperCase()}</small>
      <h1>{t("supportTitle")}</h1>
      <div className="support-public">
        <article>
          <h2>{t("supportOwnerTitle")}</h2>
          <p>{t("supportOwnerText")}</p>
          <TelegramCta label={t("supportOwnerCta")} />
        </article>
        <article>
          <h2>{t("supportStarsTitle")}</h2>
          <p>{t("supportStarsText", { command: "/paysupport" })}</p>
          <a href={`https://t.me/${data.botUsername}`}>{t("supportStarsLink")}</a>
        </article>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WEB LOGIN
// ─────────────────────────────────────────────────────────────────────────────
function WebLogin({ platformOwner = false }: { platformOwner?: boolean }) {
  const { t } = useTranslation();
  const tokenPathPrefix = platformOwner ? "/platform-login/" : "/login/";
  const pathToken = window.location.pathname.startsWith(tokenPathPrefix)
    ? window.location.pathname.slice(tokenPathPrefix.length).split("/")[0]
    : "";
  const urlToken =
    pathToken ||
    new URLSearchParams(window.location.search).get("token") ||
    new URLSearchParams(window.location.hash.replace(/^#/, "")).get("token");
  const savedIntent = (() => {
    try {
      return JSON.parse(
        localStorage.getItem("platformWebLoginIntent") || "null",
      );
    } catch {
      return null;
    }
  })();
  const initialIntent = urlToken
    ? { ...savedIntent, token: urlToken }
    : savedIntent;
  const nextPath =
    platformOwner || initialIntent?.nextPath === "/platform-owner"
      ? "/platform-owner"
      : "/owner";
  const [intent, setIntent] = useState<any>(initialIntent);
  const [state, setState] = useState<
    "intro" | "waiting" | "two_factor" | "error"
  >(initialIntent ? "waiting" : "intro");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionIsolated, setSessionIsolated] = useState(platformOwner);

  useEffect(() => {
    if (platformOwner) return;
    void logoutPlatformSession().finally(() => setSessionIsolated(true));
  }, [platformOwner]);

  useEffect(() => {
    if (!urlToken) return;
    window.history.replaceState(
      {},
      "",
      platformOwner ? "/platform-login" : "/login",
    );
  }, []);

  useEffect(() => {
    if (!sessionIsolated || !intent || state !== "waiting") return;
    let active = true;
    const poll = async () => {
      try {
        const result = await pollPlatformWebLogin(intent.token);
        if (!active || result.status === "pending") return;
        if (result.requiresTwoFactor) {
          setChallenge(result.challengeToken);
          setState("two_factor");
          return;
        }
        setPlatformToken(result.accessToken);
        localStorage.removeItem("platformWebLoginIntent");
        if (window.location.hash || window.location.search)
          window.history.replaceState(
            {},
            "",
            platformOwner ? "/platform-login" : "/login",
          );
        void track("web_login_complete");
        window.location.assign(nextPath);
      } catch (e: any) {
        if (!active) return;
        setError(e.message);
        setState("error");
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [intent, state, nextPath, sessionIsolated]);

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const nextIntent = await startPlatformWebLogin(
        platformOwner ? "platform_owner" : "owner",
      );
      const storedIntent = { ...nextIntent, nextPath };
      localStorage.setItem(
        "platformWebLoginIntent",
        JSON.stringify(storedIntent),
      );
      setIntent(storedIntent);
      setState("waiting");
      void track("web_login_started");
      window.location.href = nextIntent.telegramAppUrl || nextIntent.botUrl;
    } catch (e: any) {
      setError(e.message);
      setState("error");
    } finally {
      setBusy(false);
    }
  };

  const finishTwoFactor = async (event: any) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await completePlatformTwoFactor(challenge, code);
      window.location.assign(nextPath);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="web-login">
      <LanguageSelect compact />
      <section>
        <small>
          {platformOwner
            ? String(t("platformOwnerDashboard")).toLocaleUpperCase()
            : String(t("communityAdminDashboard")).toLocaleUpperCase()}
        </small>
        <h1>
          {state === "two_factor"
            ? "Confirm security code"
            : platformOwner
              ? t("platformOwnerDashboard")
              : t("communityAdminDashboard")}
        </h1>
        {state === "intro" && (
          <>
            <p>
              {platformOwner
                ? "Это отдельный браузерный вход для управления всей платформой Adnecta. Личность и право доступа подтверждает ваш Telegram-аккаунт."
                : "Telegram подтвердит вашу личность. Мы не просим номер телефона, пароль или токен собственного бота."}
            </p>
            <ol>
              <li>
                Нажмите кнопку — откроется личный чат с <b>@AdnectaBot</b>.
              </li>
              <li>
                Нажмите «Запустить» или подтвердите вход в сообщении бота.
              </li>
              <li>Нажмите кнопку перехода в кабинет в сообщении бота.</li>
            </ol>
            <button
              className="public-primary"
              disabled={busy || !sessionIsolated}
              onClick={() => void start()}
            >
              {!sessionIsolated
                ? "Разделяем сессии…"
                : busy
                  ? "Открываем бота…"
                  : "Подтвердить вход через Telegram"}
              <span>↗</span>
            </button>
          </>
        )}
        {state === "waiting" && (
          <>
            <div className="login-waiting">
              <span>1</span>
              <div>
                <b>
                  {intent.botUsername
                    ? `Личный чат с @${intent.botUsername}`
                    : "Вход подтверждён в Telegram"}
                </b>
                <p>После ответа бота нажмите кнопку перехода в кабинет.</p>
              </div>
            </div>
            {intent.telegramAppUrl && (
              <a className="public-primary" href={intent.telegramAppUrl}>
                Открыть личный чат в Telegram <span>↗</span>
              </a>
            )}
            {intent.botUrl && (
              <a href={intent.botUrl} target="_blank" rel="noreferrer">
                Если приложение не открылось — открыть через t.me
              </a>
            )}
            <div className="login-pulse">
              <i />
              Ожидаем подтверждение…
            </div>
          </>
        )}
        {state === "two_factor" && (
          <form onSubmit={finishTwoFactor}>
            <p>Введите код подтверждения.</p>
            <input
              autoFocus
              value={code}
              onChange={(event) => setCode(event.target.value.trim())}
              autoComplete="one-time-code"
              placeholder="000000"
              minLength={6}
              maxLength={12}
              required
            />
            <button className="public-primary" disabled={busy}>
              {busy ? "Проверяем…" : "Войти"}
            </button>
          </form>
        )}
        {state === "error" && (
          <>
            <p className="login-error">{error}</p>
            <button
              onClick={() => {
                localStorage.removeItem("platformWebLoginIntent");
                window.history.replaceState(
                  {},
                  "",
                  platformOwner ? "/platform-login" : "/login",
                );
                setState("intro");
                setIntent(undefined);
              }}
            >
              Начать заново
            </button>
          </>
        )}
        <aside>
          <b>
            {platformOwner ? "Доступ владельца платформы" : "После регистрации"}
          </b>
          <span>
            {platformOwner
              ? "Сообщества → Stars → TON → выплаты → аудит"
              : "Сообщество → права бота → правила и цена → запуск"}
          </span>
        </aside>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LEGAL PAGES
// ─────────────────────────────────────────────────────────────────────────────
function Legal({ document }: { document?: SiteData["documents"][number] }) {
  useEffect(() => {
    void track("legal_view");
  }, [document?.type]);
  if (!document)
    return (
      <main className="public-page">
        <h1>Документ готовится</h1>
      </main>
    );
  return (
    <main className="public-page legal-page">
      <small>ВЕРСИЯ {document.version}</small>
      <h1>{document.title}</h1>
      <p className="legal-date">
        Действует с {new Date(document.effectiveAt).toLocaleDateString("ru")}
      </p>
      {document.body
        .split("\n")
        .filter(Boolean)
        .map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────────────────────────────────────
export function PublicSite() {
  const [data, setData] = useState<SiteData>();
  const path = window.location.pathname.replace(/\/$/, "") || "/";

  useEffect(() => {
    fetch("/api/public/site")
      .then((response) => response.json())
      .then(setData);
  }, [path]);

  const legalType = useMemo(() => path.slice(1), [path]);

  if (!data) return <div className="public-loading">Adnecta</div>;

  if (path === "/platform-login" || path.startsWith("/platform-login/"))
    return (
      <div className="public-site service-login">
        <WebLogin platformOwner />
      </div>
    );

  let content = <Landing data={data} />;
  if (path === "/pricing") content = <Pricing data={data} />;
  if (path === "/login" || path.startsWith("/login/"))
    content = <WebLogin />;
  if (path === "/docs") content = <Docs data={data} />;
  if (path === "/support") content = <Support data={data} />;
  if (["/terms", "/privacy", "/prohibited"].includes(path))
    content = (
      <Legal
        document={data.documents.find((item) => item.type === legalType)}
      />
    );

  return (
    <div className="public-site">
      <Header />
      {content}
      <Footer />
    </div>
  );
}
