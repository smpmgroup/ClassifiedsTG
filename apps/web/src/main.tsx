import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./i18n";
import "./style.css";
import "./wizard.css";
import "./admin.css";
import "./public.css";
import "./legal.css";
import "./enhancements.css";
import "./dashboard.css";
import { App } from "./App";
type ErrorBoundaryState = { failed: boolean };
class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error("Adnecta UI crashed", error);
  }
  render() {
    if (this.state.failed)
      return (
        <main className="fatal-error" role="alert">
          <div>AD</div>
          <h1>Не удалось открыть этот экран</h1>
          <p>
            Данные не потеряны. Обновите страницу; если ошибка повторится,
            обратитесь в поддержку.
          </p>
          <button onClick={() => window.location.reload()}>
            Обновить страницу
          </button>
          <a href="/support">Поддержка</a>
        </main>
      );
    return this.props.children;
  }
}

function ConnectivityNotice() {
  const [online, setOnline] = React.useState(navigator.onLine);
  React.useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online ? null : (
    <div className="connectivity-notice" role="status" aria-live="polite">
      Нет соединения. Введённые данные сохранятся, отправка продолжится после
      подключения.
    </div>
  );
}
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        initData: string;
        colorScheme: string;
        ready(): void;
        expand(): void;
        openTelegramLink?(url: string): void;
        openLink?(url: string): void;
        HapticFeedback?: {
          notificationOccurred(type: "success" | "warning" | "error"): void;
        };
        BackButton: {
          show(): void;
          hide(): void;
          onClick(cb: () => void): void;
          offClick(cb: () => void): void;
        };
      };
    };
  }
}
window.Telegram?.WebApp.ready();
window.Telegram?.WebApp.expand();
document.documentElement.lang =
  localStorage.getItem("adnecta-language") ||
  navigator.language.slice(0, 2) ||
  "en";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConnectivityNotice />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
