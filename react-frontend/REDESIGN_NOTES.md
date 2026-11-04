# Premium frontend redesign — delivery notes

## Result

BrickShare now has a light PropTech interface with navy typography, restrained
green actions, self-hosted Plus Jakarta Sans, white panels, and original
architectural illustrations. The existing application and contract interactions
were refactored and extended; no replacement blockchain implementation was introduced.

The landing page explains the prototype before asking visitors to connect.
The marketplace keeps live and fictional sources explicit. Property details
separate research from transaction preparation. The investor dashboard shows
real wallet holdings and allocation at listing prices. The administrator
workspace separates listing management, property creation, and treasury actions.

## Files created

Paths below are relative to `react-frontend/` unless otherwise noted.

```text
DESIGN.md
REDESIGN_NOTES.md
public/favicon.svg
public/fonts/plus-jakarta-sans.ttf
public/fonts/OFL.txt
src/components/ActivityList.jsx
src/components/CreatePropertyForm.jsx
src/components/Footer.jsx
src/components/Icon.jsx
src/components/Navbar.jsx
src/components/PortfolioAllocation.jsx
src/components/PropertyGrid.jsx
src/components/TransactionModal.jsx
src/components/TransactionStatus.jsx
src/components/TransferForm.jsx
src/components/ui.jsx
src/hooks/useBrickShare.js
src/hooks/useNavigation.js
src/lib/navigation.js
src/pages/AdminPage.jsx
src/pages/HomePage.jsx
src/pages/MarketplacePage.jsx
src/pages/PortfolioPage.jsx
src/pages/PropertyDetailsPage.jsx
src/styles/dashboards.css
src/styles/foundations.css
src/styles/layout.css
src/styles/properties.css
src/styles/responsive.css
src/styles/transactions.css
```

## Files modified

```text
../README.md
../USE_CASES.md
README.md
index.html
src/App.jsx
src/App.css
src/components/PropertyArt.jsx
src/components/PropertyCard.jsx
src/lib/marketplace.js
test/marketplace.test.mjs
```

The existing use-case document was retained and updated for the new administrator
status controls. No Git commits or remote publication were performed as part of this redesign.

## Shared components and behavior

- `ui.jsx`: Button, PageHeader, StatCard, PropertyStatusBadge,
  SubscriptionProgress, Notice, EmptyState, LoadingSkeleton, and RiskNote.
- Navigation/footer: shared brand, expected-network indicator, wallet display,
  app disconnect, and mobile menu.
- Property presentation: cards/grid, source/status badges, authentic-image
  support, and three labeled architectural fallback variants.
- Investor presentation: individual holding cards, reference-price allocation,
  confirmed activity, and a transfer form.
- Administrator presentation: section navigation, listings table, creation
  form, existing-contract activation/deactivation, and treasury controls.
- Transaction UI: native modal focus containment, Escape cancellation,
  payment/fee review, state feedback, and acknowledgement for sensitive actions.

The original signing, BigNumber arithmetic, gas estimation, receipt confirmation,
event reading, and wallet-context protections remain in use. No Solidity contract,
ABI, permission model, dependency manifest, lockfile, or deployment configuration
was changed. A new bounded percentage calculation supports allocation geometry;
monetary amounts remain integers throughout aggregation.

## Responsive and accessibility checks

Browser checks exercised public pages, the investor dashboard, and administration
at widths of **1440, 1024, 768, and 375 pixels**, without page-level horizontal
overflow. Mobile navigation was exercised, and the withdrawal dialog was checked
at a 375-pixel viewport. Wide tables scroll inside their own container.

Keyboard checks exercised native modal focus containment and Escape cancellation.
Form labels were checked in the exercised view. A computed foreground/background
text-contrast audit on landing, marketplace, portfolio, administration, creation,
and transaction review views met the applicable 4.5:1 or large-text 3:1 target.
This is focused verification, not a comprehensive accessibility certification.

CSS supports reduced motion; property-section scrolling and page transitions
respect that preference. Error/success/pending states have text and icons in
addition to color. Sensitive-state colors retain appropriate contrast.

## Verification results

| Check | Result |
| --- | --- |
| `npm test` | 19 contract tests passed |
| `npm run test:frontend` | 9 frontend tests passed |
| `npm run build` | Production build passed; details/portfolio/admin split into lazy-loaded bundles |
| Public browser flows | Landing, wallet-free reads, filters, sample isolation, documents, and deep-link refresh passed |
| Investor browser flows | Local-chain purchases, review cancellation, holdings, allocation, sent/received history, and transfers passed |
| Wallet protections | Account-change reset, permission states, wrong-network feedback, network switching, and rejection handling passed |
| Administrator browser flows | Creation, activation/deactivation, treasury withdrawal, and acknowledgement requirements passed |
| Browser exceptions | No uncaught exceptions in the completed verification run |

Browser transaction checks used a headless browser with an injected EIP-1193 test
wallet backed by unlocked accounts on an isolated temporary Hardhat chain. They
were actual local-chain transactions, not manual MetaMask-extension interactions.
The temporary frontend, chain, and browser processes were stopped, and the original
local deployment metadata was restored after verification.

## Remaining limits and suggested next work

- A manual MetaMask-extension pass is still needed before a presentation or release.
- Real photographs and public documents need to be supplied through the existing
  presentation metadata. Illustrations and sample documents are clearly labeled.
- Portfolio reference values are not market prices, investment returns, or redemption values.
- This remains a test-network prototype without legal property title transfer,
  rent distributions, campaign escrow, or investor refunds.
- Add repeatable browser automation to CI when the repository's CI workflow is
  established. The isolated browser harness used for this delivery was temporary.
- Validate with keyboard and screen-reader users for broader accessibility coverage.

## Run locally

For a visual preview without a chain, run `npm run dev` from the root and choose
the sample collection. For live interaction, use separate root terminals:

```sh
npm run node
npm run deploy:local
npm run dev
```

See [DESIGN.md](DESIGN.md) for architecture and [the root README](../README.md)
for the complete setup and MetaMask network instructions.
