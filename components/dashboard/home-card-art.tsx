/** Small illustrations for the corner of each service card. They take the card's colour from `currentColor`. */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 150 120">
      {children}
    </svg>
  );
}

export function BuildingsArt() {
  const towers = [
    [8, 56, 22],
    [34, 30, 26],
    [64, 64, 20],
    [88, 14, 30],
    [122, 46, 22],
  ] as const;
  return (
    <Frame>
      <defs>
        <linearGradient id="art-buildings" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#5aa2ff" stopOpacity=".75" />
          <stop offset="1" stopColor="#1a46a8" stopOpacity=".25" />
        </linearGradient>
        <pattern height="9" id="art-buildings-windows" patternUnits="userSpaceOnUse" width="7">
          <rect fill="#cfe6ff" height="3" opacity=".8" width="3" x="1.5" y="2" />
        </pattern>
      </defs>
      {towers.map(([x, top, width]) => (
        <g key={x}>
          <rect fill="url(#art-buildings)" height={120 - top} width={width} x={x} y={top} />
          <rect fill="url(#art-buildings-windows)" height={120 - top} opacity=".55" width={width} x={x} y={top} />
          <rect fill="#9fd4ff" height={120 - top} opacity=".6" width="1.2" x={x} y={top} />
        </g>
      ))}
    </Frame>
  );
}

export function BooksArt() {
  const books = [
    { x: 14, y: 34, w: 20, h: 86, color: "#17c3b2" },
    { x: 38, y: 22, w: 18, h: 98, color: "#2ee6c8" },
    { x: 60, y: 44, w: 24, h: 76, color: "#0e8f98" },
    { x: 88, y: 30, w: 18, h: 90, color: "#1fd5d0" },
  ];
  return (
    <Frame>
      {books.map((book) => (
        <g key={book.x}>
          <rect fill={book.color} fillOpacity=".5" height={book.h} rx="2" stroke={book.color} strokeOpacity=".9" width={book.w} x={book.x} y={book.y} />
          <rect fill="#d8fff7" height="3" opacity=".7" width={book.w - 6} x={book.x + 3} y={book.y + 12} />
          <rect fill="#d8fff7" height="3" opacity=".5" width={book.w - 6} x={book.x + 3} y={book.y + 20} />
        </g>
      ))}
      <g transform="rotate(14 128 100)">
        <rect fill="#17c3b2" fillOpacity=".5" height="84" rx="2" stroke="#2ee6c8" strokeOpacity=".9" width="18" x="116" y="30" />
        <rect fill="#d8fff7" height="3" opacity=".6" width="12" x="119" y="42" />
      </g>
    </Frame>
  );
}

export function LaptopArt() {
  return (
    <Frame>
      <defs>
        <linearGradient id="art-laptop" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffd86b" stopOpacity=".55" />
          <stop offset="1" stopColor="#7a5410" stopOpacity=".25" />
        </linearGradient>
      </defs>
      <path d="M26 20h98l-6 66H32Z" fill="url(#art-laptop)" stroke="#ffd25a" strokeOpacity=".9" strokeWidth="1.6" />
      <path d="m62 40-14 15 14 15M88 40l14 15-14 15M80 36l-10 38" fill="none" stroke="#ffe39a" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.2" />
      <path d="M12 90h126l8 14H4Z" fill="#ffd25a" fillOpacity=".35" stroke="#ffd25a" strokeOpacity=".8" />
      <rect fill="#ffe9ae" height="3" opacity=".7" rx="1.5" width="26" x="62" y="96" />
    </Frame>
  );
}

export function MarketArt() {
  const bars = [30, 44, 56, 70, 84, 100];
  return (
    <Frame>
      <defs>
        <linearGradient id="art-market" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#4fb0ff" stopOpacity=".85" />
          <stop offset="1" stopColor="#1a58c8" stopOpacity=".3" />
        </linearGradient>
      </defs>
      {bars.map((height, index) => (
        <rect fill="url(#art-market)" height={height} key={height} width="14" x={8 + index * 22} y={120 - height} />
      ))}
      <path d="M6 78 40 56l22 8 44-34" fill="none" stroke="#7fc6ff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      <path d="m96 24 20-4-4 20" fill="none" stroke="#7fc6ff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
    </Frame>
  );
}

export function PeopleArt() {
  const people = [
    { x: 40, scale: 0.9, opacity: 0.5 },
    { x: 108, scale: 0.9, opacity: 0.5 },
    { x: 74, scale: 1.1, opacity: 0.85 },
  ];
  return (
    <Frame>
      <defs>
        <linearGradient id="art-people" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#b79bff" stopOpacity=".9" />
          <stop offset="1" stopColor="#5a3ad0" stopOpacity=".25" />
        </linearGradient>
      </defs>
      {people.map((person) => (
        <g key={person.x} opacity={person.opacity} transform={`translate(${person.x} 120) scale(${person.scale}) translate(-${person.x} -120)`}>
          <circle cx={person.x} cy="40" fill="url(#art-people)" r="13" />
          <path d={`M${person.x - 28} 120c0-30 10-52 28-52s28 22 28 52Z`} fill="url(#art-people)" />
        </g>
      ))}
    </Frame>
  );
}

export function InvestmentsArt() {
  const bars = [26, 40, 34, 58, 74, 92];
  return (
    <Frame>
      <defs>
        <linearGradient id="art-invest" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#3df0b4" stopOpacity=".9" />
          <stop offset="1" stopColor="#0b7a62" stopOpacity=".3" />
        </linearGradient>
      </defs>
      {bars.map((height, index) => (
        <g key={index}>
          <rect fill="url(#art-invest)" height={height} width="14" x={14 + index * 22} y={120 - height} />
          <rect fill="#b6ffe4" height={height} opacity=".6" width="1.2" x={14 + index * 22} y={120 - height} />
        </g>
      ))}
      <path d="M8 84 36 70l22 10 30-26 24 12 28-34" fill="none" stroke="#7dffd0" strokeLinecap="round" strokeLinejoin="round" strokeOpacity=".9" strokeWidth="2.6" />
    </Frame>
  );
}
