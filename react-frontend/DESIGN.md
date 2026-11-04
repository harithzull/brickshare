# BrickShare frontend design and architecture

## Visual system

The interface uses navy (`#14283F`), investment green (`#16856A`), an off-white
canvas (`#F7F8F6`), white panels, and muted slate text. Shared CSS tokens define
color, spacing, borders, and radii in `src/styles/foundations.css`; `src/App.css`
imports the focused foundation, layout, property, dashboard, transaction, and
responsive stylesheets. Navigation, cards, inputs,
transaction states, and dashboards use the same component vocabulary.

Plus Jakarta Sans is self-hosted in `public/fonts/` with its SIL Open Font License
in `OFL.txt`. No font request is sent to a third-party CDN at runtime. Existing
architectural SVG illustrations and authentic operator-supplied images remain
supported; illustrations are explicitly labeled and no competitor assets are used.

## Pages and navigation

- `pages/HomePage.jsx`: product introduction, clearly labeled property previews,
  educational journey, and prototype limitations.
- `pages/MarketplacePage.jsx`: live/sample source selection, search, filters,
  availability, and recoverable loading/empty/error states.
- `pages/PropertyDetailsPage.jsx`: research content, documents, fixed token supply,
  risk information, and a purchase panel.
- `pages/PortfolioPage.jsx`: real wallet holdings, reference-price allocation,
  confirmed purchase/transfer activity, and transfers.
- `pages/AdminPage.jsx`: operator navigation, property overview, creation,
  activation/deactivation, and treasury withdrawal.

Hash URLs (`#/marketplace`, `#/portfolio`, `#/admin`, `#/property/1`) allow
refresh, deep links, and browser back/forward without requiring server rewrites.
Sample links explicitly carry `?catalog=sample`. The landing page is `#/`.
No routing or chart dependency was added. Dashboard/detail code is lazy-loaded.

## Logic boundaries

- `hooks/useBrickShare.js` contains the existing wallet connection, network
  switching, transaction preparation, gas estimate, receipt handling, and action
  validation extracted from the original App. It also exposes the contract's
  existing `setPropertyStatus` function to the administrator UI.
- `hooks/useMarketplace.js` retains read-only RPC loading, source metadata,
  event history, and account isolation.
- `lib/marketplace.js` retains precise BigNumber calculations. Portfolio allocation
  is weighted by tokens multiplied by listing price, not raw token quantities.
  Only bounded percentages are converted to numbers for SVG chart geometry.
- `App.jsx` composes navigation, pages, global notices, and transaction UI.
- `components/ui.jsx` supplies shared buttons, page headers, status badges,
  stats, notices, loading skeletons, empty states, progress bars, and risk notes.
- Dedicated components cover navigation/footer, property cards/grid,
  allocation, activity, forms, and transaction modal/status.

No Solidity contract, ABI, permission model, or deployment configuration was changed.

## Trust and interaction behavior

Live reads, fictional samples, token balances, and reference-price values have
distinct labels. The landing page's fictional preview is explicitly identified;
the live marketplace never silently substitutes sample results on a network error.
No yields, market performance, property valuation, title verification, or legal
rights are fabricated. Allocation is a current reference snapshot, not a performance chart.

All writes retain payment/fee review and wallet-context checks. Success requires
a successful receipt. Deactivation and treasury withdrawal add an acknowledgement
checkbox before wallet submission. Account/network changes clear wallet context
and unsubmitted reviews, with reconnection guidance.

## Responsive and accessibility behavior

Navigation collapses to a labeled disclosure on small screens. Property grids,
dashboard cards, admin navigation, forms, and transaction dialogs reflow. Tables
are contained in keyboard-focusable scroll regions rather than overflowing the page.
The purchase panel is sticky on larger screens and follows the research content
on mobile. No returns or balance charts are invented for empty accounts.

Controls use semantic labels, visible focus states, text alongside status colors,
native modal focus containment and Escape cancellation, live transaction feedback,
and reduced-motion CSS. Hash navigation moves focus to the main content.

## Verification commands

```sh
npm test
npm run test:frontend
npm run build
```

The frontend suite checks exact purchase amounts, supply percentages, filters,
safe document URLs, wallet-free reads, log pagination/deduplication, portfolio
allocation precision, and sample-safe deep links. Browser verification and any
remaining limits are reported separately with the implementation handoff.
