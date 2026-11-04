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
        <path d="M111 326H493V339H111Z" fill="#d2c7ae" />
        <path d="M0 340L640 325V370H0Z" fill="#c8c2ad" />
        {[70, 502, 556].map((x) => (
          <g key={x}>
            <path d={`M${x} 330V240`} stroke="#686d4d" strokeWidth="6" />
            <ellipse cx={x} cy="237" rx="29" ry="46" fill="#526d54" />
            <ellipse cx={x + 10} cy="223" rx="19" ry="33" fill="#6b8563" />
          </g>
        ))}
        <path d="M231 320V276L276 265V320Z" fill="#365752" />
      </svg>
      <span className="image-caption">
        {image
          ? property.imageCaption || "Listing image · operator supplied"
          : "Architectural illustration"}
      </span>
    </div>
  );
}
