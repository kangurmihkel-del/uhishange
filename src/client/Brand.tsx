export function BrandMark() {
  return (
    <svg viewBox="0 0 68 44" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round">
        <path d="M4 23 13 14l9 9v16H4Zm19-7L34 5l11 11v23H23Zm23 7 9-9 9 9v16H46Z" />
        <path d="M10 39v-9h6v9m15 0V26h7v13m14 0v-9h6v9" />
      </g>
    </svg>
  );
}

export function CommunityHouses({ className = 'community-houses' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 330 154" aria-hidden="true" focusable="false">
      <g stroke="#285443" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M26 76 73 39l47 37v61H26Z" fill="#F5F1E8" />
        <path d="M118 57 165 20l47 37v80h-94Z" fill="#285443" />
        <path d="M210 81 257 44l47 37v56h-94Z" fill="#F5F1E8" />
        <path d="M25 76 73 39l48 37m-4-18 48-38 48 38m-4 23 48-37 48 37" fill="none" />
        <path d="M57 137V99h31v38m151 0v-34h31v34" fill="#C86848" />
        <path d="M150 137V96h30v41" fill="#F5F1E8" />
        <path d="M42 82h15v12H42Zm48 0h14v12H90Zm134 8h13v12h-13Zm53 0h13v12h-13Z" fill="#285443" />
        <path d="M137 65h15v15h-15Zm41 0h15v15h-15Z" fill="#F5F1E8" stroke="#F5F1E8" />
        <path d="M12 138h306" fill="none" />
      </g>
    </svg>
  );
}

export default function Brand({
  href = '#overview',
  tagline = false,
}: {
  href?: string;
  tagline?: boolean;
}) {
  return (
    <a className="brand" href={href} aria-label="Ühishange">
      <span className="brand-mark">
        <BrandMark />
      </span>
      <span className="brand-wordmark">
        <span className="brand-strong">ÜHIS</span>
        <span className="brand-thin">HANGE</span>
        {tagline && <small className="brand-tagline">Koos tellides tuleb parem hind.</small>}
      </span>
    </a>
  );
}
