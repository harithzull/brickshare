# Property descriptions, photographs and documents

On-chain supply, price, status and balances always come from the contract.
Optional presentation information lives in `src/data/property-metadata.json`.
It is public and bundled with the frontend; updating it requires rebuilding.
It is not an upload service or a verification system.

Key each entry by `chainId:lowercaseContractAddress:propertyId` so metadata does
not accidentally follow the same property ID to a different deployment address:

```json
{
  "31337:0x5fbdb2315678afecb367f032d93f642f64180aa3:1": {
    "description": "An operator-supplied description of the listed property.",
    "image": "/properties/condo.jpg",
    "imageAlt": "Exterior of the listed condo",
    "imageCaption": "Property exterior · operator supplied",
    "documents": [
      { "title": "Property overview (PDF)", "url": "/properties/overview.pdf" }
    ]
  }
}
```

The paths above are examples. Add your own licensed, authentic photo and public
documents under `public/properties/`, or use public HTTPS URLs. Images and
documents allow root-relative paths and HTTPS; other protocols are rejected.
Do not include personal records, secrets or private investor documents.

Without a photograph, the app uses an original architectural illustration and
labels it as such. Missing documents and descriptions are shown honestly.
Operator-supplied files are not presented as independently verified.

The sample preview has its own fictional records and document. It never falls
back into the live catalog and cannot prepare a purchase or transfer.

After resetting a local Hardhat chain, the contract address may repeat. Review
or clear your metadata before reusing property IDs on that fresh chain.
