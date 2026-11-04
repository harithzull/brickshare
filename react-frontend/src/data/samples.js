import { ethers } from "ethers";

// Fictional catalog for an explicitly selected, non-transactional preview.
export const sampleProperties = [
  {
    id: "sample-1",
    name: "The Canopy Residences",
    location: "Cyberjaya",
    total: "1000",
    available: "640",
    priceEth: "0.01",
    active: true,
    illustration: 0,
    description:
      "A fictional residential listing showing how fractional property information could be presented. No actual property, ownership rights, or investment is offered.",
  },
  {
    id: "sample-2",
    name: "Harbour House",
    location: "Penang",
    total: "2000",
    available: "520",
    priceEth: "0.025",
    active: true,
    illustration: 1,
    description:
      "A fictional coastal property used to demonstrate the marketplace. The supply, price, and subscription figures are illustrative test data.",
  },
  {
    id: "sample-3",
    name: "Parkside Studios",
    location: "Kuala Lumpur",
    total: "1500",
    available: "0",
    priceEth: "0.015",
    active: true,
    illustration: 2,
    description:
      "A fictional fully subscribed listing. This example demonstrates the sold-out state; it cannot be purchased or transferred.",
  },
].map((property) => ({
  ...property,
  sample: true,
  mine: "0",
  priceWei: ethers.utils.parseEther(property.priceEth),
  documents: [
    {
      title: "Example property overview (Markdown)",
      url: "/samples/property-overview.md",
    },
  ],
}));
