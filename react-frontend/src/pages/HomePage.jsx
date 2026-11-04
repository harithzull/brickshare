import { sampleProperties } from "../data/samples";
import { routeHref } from "../lib/navigation";
import PropertyArt from "../components/PropertyArt";
import PropertyGrid from "../components/PropertyGrid";
import Icon from "../components/Icon";
import { LoadingSkeleton, Notice } from "../components/ui";

export default function HomePage({ market, navigate }) {
  const showLive = market.status === "ready" && market.properties.length > 0;
  const featured = showLive ? market.properties.slice(0, 3) : sampleProperties;
  return (
    <>
      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-line" />
            PROPERTY. A NEW PERSPECTIVE.
          </p>
          <h1>
            Big possibilities.
            <br />
            Smaller <span>fractions.</span>
          </h1>
          <p className="hero-description">
            Explore a more accessible approach to real estate. Discover
            properties, understand the numbers, and experience fractional
            investing on a transparent blockchain.
          </p>
          <div className="hero-actions">
            <a className="button primary large" href={routeHref("marketplace")}>
              Explore properties <Icon name="arrowUpRight" size={19} />
            </a>
            <a className="button text large" href="#journey">
              How it works{" "}
              <span className="play-icon" aria-hidden="true">
                ▶
              </span>
            </a>
          </div>
          <div className="hero-disclosure">
            <Icon name="info" size={16} />
            <span>
              A test-network experience. Real learning, no real investment.
            </span>
          </div>
        </div>
        <div className="hero-composition">
          <div className="hero-art-backdrop" />
          <div className="hero-architecture">
            <PropertyArt property={sampleProperties[0]} />
          </div>
          <div className="hero-image-label">
            <span className="live-dot" />
            Fictional property preview
          </div>
          <div className="hero-property-note">
            <div>
              <span className="eyebrow">FICTIONAL PROPERTY</span>
              <strong>The Canopy Residences</strong>
              <span>
                <Icon name="location" size={13} />
                Cyberjaya, Malaysia
              </span>
            </div>
            <a
              href={routeHref("property", { id: "sample-1", mode: "sample" })}
              className="circle-link"
              aria-label="Explore the fictional Canopy Residences"
            >
              <Icon name="arrowUpRight" />
            </a>
          </div>
          <div className="hero-token-note">
            <span className="token-note-icon">
              <Icon name="layers" size={21} />
            </span>
            <div>
              <strong>One property. Many fractions.</strong>
              <span>Explore how tokenization works.</span>
            </div>
          </div>
        </div>
      </section>
      <section className="principles-strip" aria-label="Platform principles">
        <div>
          <Icon name="building" />
          <span>Property, in smaller parts</span>
        </div>
        <div>
          <Icon name="globe" />
          <span>Transparent on-chain records</span>
        </div>
        <div>
          <Icon name="wallet" />
          <span>Your wallet. Your balances.</span>
        </div>
        <div>
          <Icon name="shield" />
          <span>Review before you sign</span>
        </div>
      </section>
      <section className="landing-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">FIND YOUR PERSPECTIVE</p>
            <h2>
              {showLive
                ? "Discover the collection."
                : "Get a feel for the possibilities."}
            </h2>
            <p className="section-description">
              {showLive
                ? "Explore listings recorded on your connected property network."
                : "A fictional collection to help you explore the experience."}
            </p>
          </div>
          <a
            className="button secondary"
            href={routeHref("marketplace", {
              mode: showLive ? "live" : "sample",
            })}
          >
            {showLive ? "View all properties" : "Explore sample collection"}
            <Icon name="arrowUpRight" size={17} />
          </a>
        </div>
        {market.status === "loading" ? (
          <LoadingSkeleton />
        ) : (
          <>
            {!showLive && (
              <Notice tone="sample" title="Fictional sample collection">
                Illustrative properties and prices. No purchases or real
                investments are available in this preview.
              </Notice>
            )}
            <PropertyGrid
              properties={featured}
              onSelect={(id) =>
                navigate("property", { id, mode: showLive ? "live" : "sample" })
              }
            />
          </>
        )}
      </section>
      <section className="journey-section" id="journey">
        <div className="journey-intro">
          <p className="eyebrow">LESS COMPLEXITY. MORE CLARITY.</p>
          <h2>
            From curious
            <br />
            to confident.
          </h2>
          <p>
            Understand each step before you make a move. Start with the
            property, explore its token supply, and keep a clear record of your
            activity.
          </p>
          <a href={routeHref("marketplace")} className="text-link">
            Start exploring <Icon name="arrow" size={18} />
          </a>
        </div>
        <ol className="journey-steps">
          {[
            {
              icon: "search",
              title: "Find a property that interests you",
              text: "Browse the collection, review the details, and inspect any supporting documents. No wallet connection needed.",
            },
            {
              icon: "layers",
              title: "Choose your fraction",
              text: "Select a quantity of tokens. Review your test ETH payment and estimated network fees before signing.",
            },
            {
              icon: "chart",
              title: "See the full picture",
              text: "Track token balances, your represented share of supply, and confirmed activity from your portfolio.",
            },
          ].map((step, i) => (
            <li key={step.title}>
              <span className="step-icon">
                <Icon name={step.icon} size={23} />
              </span>
              <div>
                <span className="step-number">0{i + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <section className="education-section" id="understand">
        <div className="education-heading">
          <p className="eyebrow">A LITTLE KNOWLEDGE GOES A LONG WAY</p>
          <h2>Clarity is part of the investment.</h2>
          <p>
            Before exploring fractional property, understand what the technology
            does—and what this prototype doesn’t.
          </p>
        </div>
        <div className="education-grid">
          <article>
            <span className="education-icon">
              <Icon name="layers" size={25} />
            </span>
            <h3>What is tokenization?</h3>
            <p>
              In this prototype, a listing is divided into a fixed number of
              tokens. Your wallet’s token balance represents a fraction of that
              supply.
            </p>
            <span className="education-tag">The fundamentals</span>
          </article>
          <article>
            <span className="education-icon">
              <Icon name="globe" size={25} />
            </span>
            <h3>What does blockchain add?</h3>
            <p>
              The contract records supply, balances, purchases, and transfers.
              Confirmed records can be read through the network, without relying
              on a private database.
            </p>
            <span className="education-tag">Transparent records</span>
          </article>
          <article>
            <span className="education-icon">
              <Icon name="shield" size={25} />
            </span>
            <h3>What should I understand?</h3>
            <p>
              Tokens here do not establish legal property ownership. There are
              no rental payments, refunds, or guaranteed returns. Only use test
              funds.
            </p>
            <span className="education-tag">Know the boundaries</span>
          </article>
        </div>
      </section>
      <section className="closing-cta">
        <div>
          <p className="eyebrow">YOUR NEXT CHAPTER STARTS WITH CURIOSITY</p>
          <h2>Take a closer look.</h2>
          <p>
            Explore the numbers. Understand the experience. Make your next move
            an informed one.
          </p>
        </div>
        <a className="button primary large" href={routeHref("marketplace")}>
          Explore properties <Icon name="arrowUpRight" size={18} />
        </a>
      </section>
    </>
  );
}
