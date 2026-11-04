import { useId, useState } from "react";
import { safeContentUrl } from "../lib/marketplace";

export default function PropertyArt({ property }) {
  const id = useId().replaceAll(":", "");
  const [failedImage, setFailedImage] = useState(null);
  const image =
    property.image !== failedImage ? safeContentUrl(property.image) : null;
  const variant = property.illustration ?? Number(property.id || 0) % 3;
  return (
    <div className={`property-art art-${variant}`}>
      {image ? (
        <img
          src={image}
          alt={property.imageAlt || property.name}
          loading="lazy"
          onError={() => setFailedImage(property.image)}
        />
      ) : null}
      <svg
        viewBox="0 0 640 370"
        role="img"
        aria-hidden={image ? true : undefined}
        aria-label="Architectural illustration, not a photograph of this property"
      >
        <defs>
          <linearGradient id={id} x2="0" y2="1">
            <stop stopColor="#bcc9c3" />
            <stop offset="1" stopColor="#e5dfcd" />
          </linearGradient>
        </defs>
        <rect width="640" height="370" fill={`url(#${id})`} />
        <circle cx="505" cy="76" r="37" fill="#f4e5bd" />
        <path
          d="M0 278L99 214 197 261 340 202 496 262 640 212V370H0Z"
          fill="#738a7c"
          opacity=".45"
        />
        {variant === 1 ? (
          <g>
            <path d="M126 319V160L351 110V319Z" fill="#eee6d3" />
            <path d="M351 110L476 169V319H351Z" fill="#a5b29f" />
            <path d="M126 160L351 110 476 169 247 221Z" fill="#f6efdf" />
            <path d="M167 247V184L326 149V247Z" fill="#315650" />
            <path d="M167 260L327 226V296L167 322Z" fill="#42665a" />
            <path d="M126 241L351 190V207L126 258Z" fill="#ded6c1" />
            <path d="M351 190L476 249V267L351 207Z" fill="#879a84" />
            <path
              d="M371 166L451 202V237L371 201ZM371 241L451 277V304L371 277Z"
              fill="#476b5c"
            />
            <path
              d="M207 174V314M254 164V306M300 154V299"
              stroke="#b5b59b"
              strokeWidth="5"
            />
            <path d="M115 327H486V338H115Z" fill="#e7dfc9" />
          </g>
        ) : variant === 2 ? (
          <g>
            <path d="M139 322V125L271 90V322Z" fill="#e8deca" />
            <path d="M271 90L326 118V322H271Z" fill="#a1b09c" />
            <path d="M331 322V88L434 61V322Z" fill="#e8e1cf" />
            <path d="M434 61L484 90V322H434Z" fill="#9bab95" />
            <path
              d="M139 125L271 90 326 118 195 153ZM331 88L434 61 484 90 380 117Z"
              fill="#f5eedc"
            />
            {Array.from({ length: 7 }, (_, row) => (
              <g key={row}>
                <path
                  d={`M154 ${150 + row * 23}l100 -27v13l-100 27z`}
                  fill={row % 3 === 0 ? "#bba176" : "#3c6056"}
                />
                <path
                  d={`M347 ${113 + row * 29}l72 -20v15l-72 20z`}
                  fill={row % 3 === 1 ? "#bba176" : "#3c6056"}
                />
                <path
                  d={`M447 ${105 + row * 29}l24 13v14l-24-13z`}
                  fill="#5c7b62"
                />
              </g>
            ))}
          </g>
        ) : (
          <g>
            <path d="M140 325V99L337 54V325Z" fill="#e9e2cf" />
            <path d="M337 54L452 113V325H337Z" fill="#a8b1a4" />
            <path d="M140 99L337 54 452 113 249 151Z" fill="#f4eedc" />
            {Array.from({ length: 6 }, (_, row) => (
              <g key={row}>
                {[0, 1, 2, 3].map((col) => (
                  <path
                    key={col}
                    d={`M${161 + col * 43} ${
                      119 + row * 31 - col * 9
                    }l26 -6v19l-26 6z`}
                    fill={row % 3 === col % 3 ? "#c49f65" : "#355958"}
                  />
                ))}
                <path
                  d={`M355 ${105 + row * 32}l72 35v16l-72 -35z`}
                  fill="#536e65"
                />
              </g>
            ))}
          </g>
        )}
        <path d="M111 326H493V339H111Z" fill="#d2c7ae" />
        <path d="M0 340L640 325V370H0Z" fill="#c8c2ad" />
        {[70, 502, 556].map((x) => (
          <g key={x}>
            <path d={`M${x} 330V240`} stroke="#686d4d" strokeWidth="6" />
            <ellipse cx={x} cy="237" rx="29" ry="46" fill="#526d54" />
            <ellipse cx={x + 10} cy="223" rx="19" ry="33" fill="#6b8563" />
          </g>
        ))}
        {variant === 0 && <path d="M231 320V276L276 265V320Z" fill="#365752" />}
      </svg>
      <span className="image-caption">
        {image
          ? property.imageCaption || "Listing image · operator supplied"
          : "Architectural illustration"}
      </span>
    </div>
  );
}
