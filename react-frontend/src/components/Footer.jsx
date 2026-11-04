import { Brand } from "./Navbar";
import { routeHref } from "../lib/navigation";

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-top">
        <div>
          <Brand />
          <p>
            A clearer way to explore
            <br />
            fractional real estate.
          </p>
        </div>
        <div className="footer-links">
          <div>
            <span>Explore</span>
            <a href={routeHref("marketplace")}>Properties</a>
            <a href={routeHref("portfolio")}>Your portfolio</a>
            <a href={routeHref("marketplace", { mode: "sample" })}>
              Sample collection
            </a>
          </div>
          <div>
            <span>Learn</span>
            <a href="#journey">How it works</a>
            <a href="#understand">Understanding the risks</a>
            <a href={routeHref("admin")}>Administration</a>
          </div>
        </div>
        <div className="footer-note">
          <span className="badge neutral">Built for exploration</span>
          <p>
            A blockchain prototype using test funds. Tokens do not establish
            legal title. No rental income, refunds, or guaranteed returns.
          </p>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© {new Date().getFullYear()} BrickShare</span>
        <span>
          Architectural illustrations are placeholders, not property
          photographs.
        </span>
      </div>
    </footer>
  );
}
